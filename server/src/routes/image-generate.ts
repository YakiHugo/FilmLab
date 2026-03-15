import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import type {
  PersistedAssetEdgeType,
  PersistedConversationCreativeState,
  GenerationJobSnapshot,
  PersistedImageGenerationRequestSnapshot,
  PersistedPromptSnapshot,
  PersistedRunRecord,
  PersistedRunTargetSnapshot,
} from "../../../shared/chatImageTypes";
import type { PromptVersionRecord } from "../gateway/prompt/types";
import { requireAuthenticatedUser } from "../auth/user";
import { ChatPromptStateConflictError } from "../chat/persistence/types";
import { getConfig } from "../config";
import {
  applyTurnDelta,
  buildPromptIR,
  compilePromptForTarget,
  createPromptCompilationContext,
  createPromptHashes,
  toPromptSnapshot,
  withProviderEffectivePrompt,
} from "../gateway/prompt/compiler";
import { rewriteTurn } from "../gateway/prompt/rewrite";
import { imageRuntimeRouter } from "../gateway/router/router";
import type { ResolvedRouteTarget } from "../gateway/router/types";
import { getFrontendImageModelById } from "../models/frontendRegistry";
import { ProviderError } from "../providers/base/errors";
import { downloadGeneratedImage } from "../shared/downloadGeneratedImage";
import { createGeneratedImageCapability } from "../shared/generatedImageCapability";
import { getImageGenerationCapabilityWarnings } from "../shared/imageGenerationCapabilityWarnings";
import {
  imageGenerationRequestSchema,
  type ParsedImageGenerationRequest,
  validateImageGenerationRequestAgainstModel,
} from "../shared/imageGenerationSchema";
import {
  resolveImagePromptCompilerOperation,
  type ImageGenerationAssetRef,
  type ImagePromptCompilerOperationId,
} from "../../../shared/imageGeneration";

const GENERATED_IMAGE_NORMALIZATION_CONCURRENCY = 2;

const createId = (prefix: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const cloneSnapshot = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const uniqueWarnings = (warnings: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      warnings.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    )
  );

const formatNormalizationWarning = (count: number) =>
  `${count} generated image${count === 1 ? "" : "s"} could not be processed and ${
    count === 1 ? "was" : "were"
  } omitted.`;

const createRunTargetSnapshot = (input: PersistedRunTargetSnapshot): PersistedRunTargetSnapshot => ({
  modelId: input.modelId,
  logicalModel: input.logicalModel,
  deploymentId: input.deploymentId,
  runtimeProvider: input.runtimeProvider,
  providerModel: input.providerModel,
  pinned: input.pinned,
});

const createResolvedTargetSnapshot = (
  target: ResolvedRouteTarget,
  pinned: boolean
): PersistedRunTargetSnapshot =>
  createRunTargetSnapshot({
    modelId: target.frontendModel.id,
    logicalModel: target.frontendModel.logicalModel,
    deploymentId: target.deployment.id,
    runtimeProvider: target.provider.id,
    providerModel: target.deployment.providerModel,
    pinned,
  });

const createRewriteTargetSnapshot = (
  rewriteModel: string,
  degraded: boolean
): PersistedRunTargetSnapshot =>
  createRunTargetSnapshot({
    modelId: null,
    logicalModel: rewriteModel,
    deploymentId: rewriteModel,
    runtimeProvider: degraded ? "deterministic-fallback" : "internal-rewrite",
    providerModel: rewriteModel,
      pinned: true,
    });

const IMAGE_GENERATION_RUN_OPERATIONS = new Set<PersistedRunRecord["operation"]>([
  "image.generate",
  "image.edit",
  "image.variation",
]);

const SOURCE_ASSET_DEGRADATION_CODES = new Set<string>([
  "OPERATION_DEGRADED_TO_IMAGE_GENERATE",
  "ASSET_ROLE_DEGRADED_TO_REFERENCE_GUIDANCE",
  "SOURCE_IMAGE_NOT_EXECUTABLE",
  "STYLE_REFERENCE_ROLE_COLLAPSED",
]);

const resolveEdgeType = (
  role: "reference" | "edit" | "variation",
  prompt: PersistedPromptSnapshot | null
): PersistedAssetEdgeType => {
  if (
    role !== "reference" &&
    prompt?.semanticLosses.some((loss) => SOURCE_ASSET_DEGRADATION_CODES.has(loss.code))
  ) {
    return "referenced_in_turn";
  }

  switch (role) {
    case "edit":
      return "edited_from_asset";
    case "variation":
      return "variant_of";
    default:
      return "referenced_in_turn";
  }
};

const resolveRequestedOperation = (
  assetRefs: ImageGenerationAssetRef[] | undefined
): ImagePromptCompilerOperationId => resolveImagePromptCompilerOperation(assetRefs);

const toPersistedRequestSnapshot = (
  payload: unknown
): PersistedImageGenerationRequestSnapshot => {
  const snapshot = cloneSnapshot(payload) as Record<string, unknown> & {
    referenceImages?: Array<Record<string, unknown>>;
  };

  if (!Array.isArray(snapshot.referenceImages)) {
    return snapshot as PersistedImageGenerationRequestSnapshot;
  }

  return {
    ...snapshot,
    referenceImages: snapshot.referenceImages.map((referenceImage, index) => ({
      ...referenceImage,
      id:
        typeof referenceImage.id === "string" && referenceImage.id.trim()
          ? referenceImage.id
          : createId(`ref-${index}`),
    })),
  } as PersistedImageGenerationRequestSnapshot;
};

const toPersistedConfigSnapshot = (payload: unknown): Record<string, unknown> => {
  const snapshot = cloneSnapshot(payload) as Record<string, unknown> & {
    referenceImages?: Array<Record<string, unknown>>;
  };

  if (!Array.isArray(snapshot.referenceImages)) {
    return snapshot;
  }

  return {
    ...snapshot,
    referenceImages: snapshot.referenceImages.map((referenceImage, index) => ({
      id:
        typeof referenceImage.id === "string" && referenceImage.id.trim()
          ? referenceImage.id
          : createId(`ref-${index}`),
      fileName:
        typeof referenceImage.fileName === "string" ? referenceImage.fileName : undefined,
      type: referenceImage.type,
      weight: referenceImage.weight,
      sourceAssetId:
        typeof referenceImage.sourceAssetId === "string"
          ? referenceImage.sourceAssetId
          : undefined,
    })),
  };
};

const assertGeneratedImageSize = (buffer: Buffer, maxBytes: number) => {
  if (buffer.byteLength > maxBytes) {
    throw new ProviderError("Generated image is too large to persist.", 413);
  }
};

const settleWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
) => {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }

      try {
        results[currentIndex] = {
          status: "fulfilled",
          value: await mapper(items[currentIndex] as T, currentIndex),
        };
      } catch (error) {
        results[currentIndex] = {
          status: "rejected",
          reason: error,
        };
      }
    }
  };

  const workerCount = Math.min(Math.max(concurrency, 1), items.length || 1);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
};

const findRetryRun = (
  runs: PersistedRunRecord[],
  turnId: string
): PersistedRunRecord | null =>
  runs.find(
    (run) =>
      run.turnId === turnId &&
      IMAGE_GENERATION_RUN_OPERATIONS.has(run.operation) &&
      run.prompt
  ) ??
  null;

const findRetryJob = (
  jobs: GenerationJobSnapshot[],
  run: PersistedRunRecord
): GenerationJobSnapshot | null =>
  jobs.find((job) =>
    run.jobId ? job.id === run.jobId : job.turnId === run.turnId
  ) ?? null;

const toExactRetryPayload = (input: {
  requestSnapshot: PersistedImageGenerationRequestSnapshot;
  conversationId: string;
  turnId: string;
  jobId: string;
  retryOfTurnId: string;
}): ParsedImageGenerationRequest =>
  imageGenerationRequestSchema.parse({
    ...cloneSnapshot(input.requestSnapshot),
    threadId: input.conversationId,
    conversationId: input.conversationId,
    clientTurnId: input.turnId,
    clientJobId: input.jobId,
    retryOfTurnId: input.retryOfTurnId,
    retryMode: "exact",
  });

const findMatchingExactTarget = (
  targets: ResolvedRouteTarget[],
  run: PersistedRunRecord
): ResolvedRouteTarget | null => {
  const snapshot = run.executedTarget ?? run.selectedTarget ?? run.requestedTarget;
  if (!snapshot) {
    return null;
  }

  return (
    targets.find(
      (target) =>
        target.deployment.id === snapshot.deploymentId ||
        (target.provider.id === snapshot.runtimeProvider &&
          target.deployment.providerModel === snapshot.providerModel)
    ) ?? null
  );
};

const buildPromptVersionRecord = (input: {
  runId: string;
  turnId: string;
  version: number;
  stage: PromptVersionRecord["stage"];
  compilerVersion: string;
  capabilityVersion: string;
  originalPrompt: string;
  promptIntent: PersistedImageGenerationRequestSnapshot["promptIntent"] | null;
  createdAt: string;
  targetKey?: string | null;
  attempt?: number | null;
  turnDelta?: PromptVersionRecord["turnDelta"];
  committedStateBefore?: PromptVersionRecord["committedStateBefore"];
  candidateStateAfter?: PromptVersionRecord["candidateStateAfter"];
  promptIR?: PromptVersionRecord["promptIR"];
  compiledPrompt?: string | null;
  dispatchedPrompt?: string | null;
  providerEffectivePrompt?: string | null;
  semanticLosses?: PromptVersionRecord["semanticLosses"];
  warnings?: string[];
  hashes: PromptVersionRecord["hashes"];
}): PromptVersionRecord => ({
  id: createId("prompt-version"),
  runId: input.runId,
  turnId: input.turnId,
  version: input.version,
  stage: input.stage,
  targetKey: input.targetKey ?? null,
  attempt: input.attempt ?? null,
  compilerVersion: input.compilerVersion,
  capabilityVersion: input.capabilityVersion,
  originalPrompt: input.originalPrompt,
  promptIntent: (input.promptIntent as PromptVersionRecord["promptIntent"]) ?? null,
  turnDelta: input.turnDelta ?? null,
  committedStateBefore: input.committedStateBefore ?? null,
  candidateStateAfter: input.candidateStateAfter ?? null,
  promptIR: input.promptIR ?? null,
  compiledPrompt: input.compiledPrompt ?? null,
  dispatchedPrompt: input.dispatchedPrompt ?? null,
  providerEffectivePrompt: input.providerEffectivePrompt ?? null,
  semanticLosses: [...(input.semanticLosses ?? [])],
  warnings: [...(input.warnings ?? [])],
  hashes: { ...input.hashes },
  createdAt: input.createdAt,
});

export const imageGenerateRoute: FastifyPluginAsync = async (app) => {
  const config = getConfig();

  app.post(
    "/api/image-generate",
    {
      config: {
        rateLimit: {
          max: config.imageGenerateRateLimitMax,
          timeWindow: config.imageGenerateRateLimitTimeWindowMs,
        },
      },
    },
    async (request, reply) => {
      const userId = requireAuthenticatedUser(request);
      if (!userId) {
        return reply.code(401).send({ error: "Unauthorized." });
      }

      const requestController = new AbortController();
      const abortRequest = () => {
        requestController.abort();
      };
      const handleResponseClose = () => {
        if (!reply.raw.writableEnded) {
          abortRequest();
        }
      };
      request.raw.once("aborted", abortRequest);
      reply.raw.once("close", handleResponseClose);

      const normalizeGeneratedImage = async (
        image: {
          binaryData?: Buffer;
          imageUrl?: string;
          mimeType?: string;
          revisedPrompt?: string | null;
        },
        index: number
      ) => {
        let buffer: Buffer | null = null;
        let mimeType: string | null = null;

        if (image.imageUrl) {
          const downloaded = await downloadGeneratedImage(image.imageUrl, {
            signal: requestController.signal,
          });
          buffer = downloaded.buffer;
          mimeType = downloaded.mimeType;
        } else if (image.binaryData && image.mimeType) {
          buffer = image.binaryData;
          mimeType = image.mimeType;
        }

        if (!buffer || !mimeType) {
          return null;
        }

        assertGeneratedImageSize(buffer, config.generatedImageDownloadMaxBytes);

        return {
          buffer,
          mimeType,
          revisedPrompt: image.revisedPrompt ?? null,
          index,
        };
      };

      let payload;
      let persistedGeneration:
        | {
            conversationId: string;
            turnId: string;
            jobId: string;
            runId: string;
            attemptId: string;
          }
        | null = null;

      try {
        payload = imageGenerationRequestSchema.parse(request.body);
      } catch (error) {
        const message =
          error instanceof ZodError
            ? "Invalid request payload."
            : "Request body could not be parsed.";
        return reply.code(400).send({ error: message });
      }

      try {
        const repository = app.chatStateRepository;
        if (
          payload.threadId &&
          payload.conversationId &&
          payload.threadId !== payload.conversationId
        ) {
          return reply.code(400).send({
            error: "threadId and conversationId must match when both are provided.",
          });
        }

        const requestedConversationId = payload.threadId ?? payload.conversationId;
        const conversation = requestedConversationId
          ? await repository.getConversationById(userId, requestedConversationId)
          : await repository.getOrCreateActiveConversation(userId);
        if (!conversation) {
          return reply.code(404).send({ error: "Conversation not found." });
        }

        if (payload.retryOfTurnId) {
          const retryTurnExists = await repository.turnExists(
            userId,
            conversation.id,
            payload.retryOfTurnId
          );
          if (!retryTurnExists) {
            return reply.code(400).send({
              error: "retryOfTurnId does not belong to the selected conversation.",
            });
          }
        }

        const effectiveRetryMode =
          payload.retryOfTurnId && payload.retryMode === "exact" ? "exact" : "recompile";
        const createdAt = new Date().toISOString();
        const turnId = payload.clientTurnId ?? createId("chat-turn");
        const rewriteRunId = createId("chat-run");
        const jobId = payload.clientJobId ?? createId("chat-job");
        const imageRunId = createId("chat-run");
        const attemptId = createId("chat-attempt");
        const rewriteModel = config.promptRewriteModel?.trim() || "deterministic-fallback";
        let effectivePayload: ParsedImageGenerationRequest = {
          ...payload,
          threadId: payload.threadId ?? payload.conversationId ?? conversation.id,
          conversationId: payload.conversationId ?? conversation.id,
        };
        let exactRetrySourceRun: PersistedRunRecord | null = null;

        if (effectiveRetryMode === "exact" && payload.retryOfTurnId) {
          const snapshot = await repository.getConversationSnapshot(userId, conversation.id);
          const retryRun = findRetryRun(snapshot.runs, payload.retryOfTurnId);
          const retryJob = retryRun ? findRetryJob(snapshot.jobs, retryRun) : null;
          if (!retryRun?.prompt || !retryJob?.requestSnapshot) {
            return reply.code(400).send({
              error:
                "Exact retry is unavailable because no prior execution snapshot was found.",
            });
          }

          effectivePayload = toExactRetryPayload({
            requestSnapshot: retryJob.requestSnapshot,
            conversationId: conversation.id,
            turnId,
            jobId,
            retryOfTurnId: payload.retryOfTurnId,
          });
          exactRetrySourceRun = retryRun;
        }

        const frontendModel = getFrontendImageModelById(effectivePayload.modelId);
        if (!frontendModel) {
          return reply.code(400).send({ error: `Unsupported modelId: ${effectivePayload.modelId}.` });
        }

        const requestedOperation = resolveRequestedOperation(effectivePayload.assetRefs);
        const promptContext = createPromptCompilationContext(
          conversation.promptState,
          rewriteModel,
          requestedOperation,
          effectiveRetryMode
        );

        const compatibilityProbe = imageGenerationRequestSchema.superRefine((nextPayload, ctx) => {
          validateImageGenerationRequestAgainstModel(nextPayload, frontendModel, ctx);
        });
        const validationResult = compatibilityProbe.safeParse(effectivePayload);
        if (!validationResult.success) {
          const firstIssue = validationResult.error.issues[0];
          return reply.code(400).send({
            error: firstIssue?.message ?? "Request is incompatible with selected model.",
          });
        }

        const persistedRequestSnapshot = toPersistedRequestSnapshot(effectivePayload);
        const persistedConfigSnapshot = toPersistedConfigSnapshot(effectivePayload);
        const routingRequest = effectivePayload;
        let routeTargets = imageRuntimeRouter.getRouteTargets(routingRequest);
        let exactRetryPrompt: PersistedPromptSnapshot | null = null;
        let nextPromptState: PersistedConversationCreativeState | null = null;
        let promptIR: ReturnType<typeof buildPromptIR> | null = null;
        let rewriteWarning: string | null = null;
        let rewriteTarget = createRewriteTargetSnapshot(rewriteModel, false);
        let rewritePromptSnapshot: PersistedPromptSnapshot | null = null;
        let rewritePromptVersion: PromptVersionRecord | null = null;
        let compilePromptVersions: PromptVersionRecord[] = [];
        let initialPromptSnapshot: PersistedPromptSnapshot;
        let selectedTarget: ResolvedRouteTarget;
        let requestedTargetSnapshot: PersistedRunTargetSnapshot;

        if (effectiveRetryMode === "exact" && payload.retryOfTurnId) {
          const retryRun = exactRetrySourceRun;
          if (!retryRun?.prompt) {
            return reply.code(400).send({
              error:
                "Exact retry is unavailable because no prior prompt snapshot was found.",
            });
          }

          const exactTarget = findMatchingExactTarget(routeTargets, retryRun);
          if (!exactTarget) {
            return reply.code(400).send({
              error: "Exact retry target is no longer available. Use recompile retry instead.",
            });
          }

          routeTargets = [exactTarget];
          selectedTarget = exactTarget;
          requestedTargetSnapshot = createResolvedTargetSnapshot(exactTarget, true);
          exactRetryPrompt = {
            ...retryRun.prompt,
            providerEffectivePrompt: null,
          };
          rewriteWarning = "Exact retry reused prior compiler artifacts.";
          rewriteTarget = createRewriteTargetSnapshot("exact-retry", true);
          rewritePromptSnapshot = toPromptSnapshot({
            originalPrompt: effectivePayload.prompt,
            compiledPrompt: exactRetryPrompt.compiledPrompt,
            dispatchedPrompt: exactRetryPrompt.dispatchedPrompt,
            semanticLosses: exactRetryPrompt.semanticLosses,
            warnings: uniqueWarnings([rewriteWarning]),
          });
          rewritePromptVersion = null;
          compilePromptVersions = [];
          initialPromptSnapshot = exactRetryPrompt;
        } else {
          const rewriteResult = await rewriteTurn(
            effectivePayload,
            conversation.promptState,
            config,
            {
            signal: requestController.signal,
            }
          );
          rewriteWarning = rewriteResult.warning;
          rewriteTarget = createRewriteTargetSnapshot(rewriteModel, rewriteResult.degraded);
          nextPromptState = applyTurnDelta(conversation.promptState, rewriteResult.turnDelta, turnId);
          promptIR = buildPromptIR(effectivePayload, nextPromptState);
          selectedTarget = routeTargets[0] as ResolvedRouteTarget;
          requestedTargetSnapshot = createRunTargetSnapshot({
            modelId: effectivePayload.modelId,
            logicalModel: frontendModel.logicalModel,
            deploymentId: selectedTarget.deployment.id,
            runtimeProvider:
              effectivePayload.requestedTarget?.provider ?? selectedTarget.provider.id,
            providerModel: selectedTarget.deployment.providerModel,
            pinned: Boolean(
              effectivePayload.requestedTarget?.deploymentId ||
                effectivePayload.requestedTarget?.provider
            ),
          });
          rewritePromptSnapshot = toPromptSnapshot({
            originalPrompt: effectivePayload.prompt,
            compiledPrompt: rewriteResult.turnDelta.prompt,
            dispatchedPrompt: null,
            warnings: uniqueWarnings([rewriteWarning]),
          });
          rewritePromptVersion = buildPromptVersionRecord({
            runId: rewriteRunId,
            turnId,
            version: 1,
            stage: "rewrite",
            compilerVersion: promptContext.compilerVersion,
            capabilityVersion: promptContext.capabilityVersion,
            originalPrompt: effectivePayload.prompt,
            promptIntent: persistedRequestSnapshot.promptIntent ?? null,
            turnDelta: rewriteResult.turnDelta,
            committedStateBefore: conversation.promptState.committed,
            candidateStateAfter: nextPromptState.candidate,
            compiledPrompt: rewriteResult.turnDelta.prompt,
            warnings: uniqueWarnings([rewriteWarning]),
            hashes: createPromptHashes({
              committedStateBefore: conversation.promptState.committed,
              candidateStateAfter: nextPromptState.candidate,
              promptIR: null,
              prefix: null,
              payload: rewriteResult.turnDelta,
            }),
            createdAt,
          });
          compilePromptVersions = routeTargets.map((target, index) => {
            const compiled = compilePromptForTarget(
              effectivePayload,
              promptIR as NonNullable<typeof promptIR>,
              nextPromptState as PersistedConversationCreativeState,
              target,
              promptContext
            );
            return buildPromptVersionRecord({
              runId: imageRunId,
              turnId,
              version: index + 1,
              stage: "compile",
              targetKey: compiled.targetKey,
              compilerVersion: promptContext.compilerVersion,
              capabilityVersion: promptContext.capabilityVersion,
              originalPrompt: effectivePayload.prompt,
              promptIntent: persistedRequestSnapshot.promptIntent ?? null,
              committedStateBefore: conversation.promptState.committed,
              candidateStateAfter: nextPromptState?.candidate ?? null,
              promptIR,
              compiledPrompt: compiled.compiledPrompt,
              dispatchedPrompt: compiled.dispatchedPrompt,
              semanticLosses: compiled.semanticLosses,
              warnings: compiled.warnings,
              hashes: {
                ...createPromptHashes({
                  committedStateBefore: conversation.promptState.committed,
                  candidateStateAfter: nextPromptState?.candidate ?? null,
                  promptIR,
                  prefix: compiled.compiledPrompt,
                  payload: {
                    prompt: compiled.dispatchedPrompt,
                    negativePrompt: compiled.negativePrompt,
                    targetKey: compiled.targetKey,
                  },
                }),
                prefixHash: compiled.prefixHash,
                payloadHash: compiled.payloadHash,
              },
              createdAt,
            });
          });
          const selectedCompile = compilePromptVersions[0];
          initialPromptSnapshot = toPromptSnapshot({
            originalPrompt: effectivePayload.prompt,
            compiledPrompt: selectedCompile.compiledPrompt ?? effectivePayload.prompt,
            dispatchedPrompt: selectedCompile.dispatchedPrompt,
            semanticLosses: selectedCompile.semanticLosses,
            warnings: uniqueWarnings([rewriteWarning, ...selectedCompile.warnings]),
          });
        }

        selectedTarget = selectedTarget ?? (routeTargets[0] as ResolvedRouteTarget);
        requestedTargetSnapshot =
          requestedTargetSnapshot ??
          createResolvedTargetSnapshot(
            selectedTarget,
            Boolean(
              effectivePayload.requestedTarget?.deploymentId ||
                effectivePayload.requestedTarget?.provider
            )
          );

        if (nextPromptState) {
          await repository.updateConversationPromptState({
            conversationId: conversation.id,
            promptState: nextPromptState,
            expectedRevision: conversation.promptState.revision,
            updatedAt: createdAt,
          });
        }

        const baseTurn = {
          id: turnId,
          prompt: effectivePayload.prompt,
          createdAt,
          retryOfTurnId: effectivePayload.retryOfTurnId ?? null,
          modelId: effectivePayload.modelId,
          logicalModel: frontendModel.logicalModel,
          deploymentId: selectedTarget.deployment.id,
          runtimeProvider: selectedTarget.provider.id,
          providerModel: selectedTarget.deployment.providerModel,
          configSnapshot: persistedConfigSnapshot,
          status: "loading" as const,
          error: null,
          warnings: [],
          jobId,
          runIds: [rewriteRunId, imageRunId],
          referencedAssetIds:
            effectivePayload.assetRefs?.map((assetRef) => assetRef.assetId) ?? [],
          primaryAssetIds: [],
          results: [],
        };

        await repository.createTurn({
          conversationId: conversation.id,
          turn: baseTurn,
        });
        await repository.createRun({
          conversationId: conversation.id,
          run: {
            id: rewriteRunId,
            turnId,
            jobId: null,
            operation: "text.rewrite",
            status: "completed",
            requestedTarget: createRewriteTargetSnapshot(rewriteModel, false),
            selectedTarget: rewriteTarget,
            executedTarget: rewriteTarget,
            prompt: rewritePromptSnapshot,
            error: null,
            warnings: uniqueWarnings([rewriteWarning]),
            assetIds: [],
            referencedAssetIds:
              effectivePayload.assetRefs?.map((assetRef) => assetRef.assetId) ?? [],
            createdAt,
            completedAt: createdAt,
            telemetry: {
              providerRequestId: null,
              providerTaskId: null,
              latencyMs: null,
            },
          },
        });
        if (rewritePromptVersion) {
          await repository.createPromptVersions({
            conversationId: conversation.id,
            versions: [rewritePromptVersion],
          });
        }

        persistedGeneration = {
          conversationId: conversation.id,
          turnId,
          jobId,
          runId: imageRunId,
          attemptId,
        };

        await repository.createGeneration({
          conversationId: conversation.id,
          turn: baseTurn,
          job: {
            id: jobId,
            turnId,
            runId: imageRunId,
            modelId: effectivePayload.modelId,
            logicalModel: frontendModel.logicalModel,
            deploymentId: selectedTarget.deployment.id,
            runtimeProvider: selectedTarget.provider.id,
            providerModel: selectedTarget.deployment.providerModel,
            compiledPrompt: initialPromptSnapshot.compiledPrompt,
            requestSnapshot: persistedRequestSnapshot,
            status: "running",
            error: null,
            createdAt,
            completedAt: null,
          },
          run: {
            id: imageRunId,
            turnId,
            jobId,
            operation: requestedOperation,
            status: "processing",
            requestedTarget: requestedTargetSnapshot,
            selectedTarget: createResolvedTargetSnapshot(
              selectedTarget,
              Boolean(
                effectivePayload.requestedTarget?.deploymentId ||
                  effectivePayload.requestedTarget?.provider
              ) || effectiveRetryMode === "exact"
            ),
            executedTarget: null,
            prompt: initialPromptSnapshot,
            error: null,
            warnings: initialPromptSnapshot.warnings,
            assetIds: [],
            referencedAssetIds:
              effectivePayload.assetRefs?.map((assetRef) => assetRef.assetId) ?? [],
            createdAt,
            completedAt: null,
            telemetry: {
              providerRequestId: null,
              providerTaskId: null,
              latencyMs: null,
            },
          },
          attempt: {
            id: attemptId,
            jobId,
            runId: imageRunId,
            attemptNo: 1,
            status: "running",
            error: null,
            providerRequestId: null,
            providerTaskId: null,
            createdAt,
            completedAt: null,
            updatedAt: createdAt,
          },
        });
        if (compilePromptVersions.length > 0) {
          await repository.createPromptVersions({
            conversationId: conversation.id,
            versions: compilePromptVersions,
          });
        }

        const startedAt = Date.now();
        let dispatchAttempt = 0;
        let finalPromptSnapshot = initialPromptSnapshot;
        let finalDispatchWarnings = [...initialPromptSnapshot.warnings];
        const generated = await imageRuntimeRouter.generate(routingRequest, {
          signal: requestController.signal,
          targets: routeTargets,
          resolveRequest: async (target) => {
            dispatchAttempt += 1;

            if (effectiveRetryMode === "exact" && exactRetryPrompt) {
              const dispatchedPrompt =
                exactRetryPrompt.dispatchedPrompt ?? exactRetryPrompt.compiledPrompt;
              await repository.createPromptVersions({
                conversationId: conversation.id,
                versions: [
                  buildPromptVersionRecord({
                    runId: imageRunId,
                    turnId,
                    version: compilePromptVersions.length + dispatchAttempt,
                    stage: "dispatch",
                  targetKey: `${target.provider.id}:${target.deployment.providerModel}`,
                  attempt: dispatchAttempt,
                  compilerVersion: promptContext.compilerVersion,
                  capabilityVersion: promptContext.capabilityVersion,
                    originalPrompt: effectivePayload.prompt,
                    promptIntent: persistedRequestSnapshot.promptIntent ?? null,
                    committedStateBefore: null,
                    candidateStateAfter: null,
                    compiledPrompt: exactRetryPrompt.compiledPrompt,
                    dispatchedPrompt,
                    semanticLosses: exactRetryPrompt.semanticLosses,
                    warnings: uniqueWarnings([rewriteWarning, ...exactRetryPrompt.warnings]),
                    hashes: createPromptHashes({
                      committedStateBefore: null,
                      candidateStateAfter: null,
                      promptIR: null,
                      prefix: exactRetryPrompt.compiledPrompt,
                      payload: {
                        prompt: dispatchedPrompt,
                        targetKey: `${target.provider.id}:${target.deployment.providerModel}`,
                      },
                    }),
                    createdAt: new Date().toISOString(),
                  }),
                ],
              });

              finalPromptSnapshot = toPromptSnapshot({
                originalPrompt: effectivePayload.prompt,
                compiledPrompt: exactRetryPrompt.compiledPrompt,
                dispatchedPrompt,
                semanticLosses: exactRetryPrompt.semanticLosses,
                warnings: uniqueWarnings([rewriteWarning, ...exactRetryPrompt.warnings]),
              });
              finalDispatchWarnings = [...finalPromptSnapshot.warnings];
              return {
                ...routingRequest,
                requestedTarget: {
                  deploymentId: target.deployment.id,
                  provider: target.provider.id,
                },
                prompt: dispatchedPrompt,
                negativePrompt: undefined,
              };
            }

            const compiled = compilePromptForTarget(
              effectivePayload,
              promptIR as NonNullable<typeof promptIR>,
              nextPromptState as PersistedConversationCreativeState,
              target,
              promptContext
            );
            await repository.createPromptVersions({
              conversationId: conversation.id,
              versions: [
                buildPromptVersionRecord({
                  runId: imageRunId,
                  turnId,
                  version: compilePromptVersions.length + dispatchAttempt,
                  stage: "dispatch",
                  targetKey: compiled.targetKey,
                  attempt: dispatchAttempt,
                  compilerVersion: promptContext.compilerVersion,
                  capabilityVersion: promptContext.capabilityVersion,
                  originalPrompt: effectivePayload.prompt,
                  promptIntent: persistedRequestSnapshot.promptIntent ?? null,
                  committedStateBefore: conversation.promptState.committed,
                  candidateStateAfter: nextPromptState?.candidate ?? null,
                  promptIR,
                  compiledPrompt: compiled.compiledPrompt,
                  dispatchedPrompt: compiled.dispatchedPrompt,
                  semanticLosses: compiled.semanticLosses,
                  warnings: uniqueWarnings([rewriteWarning, ...compiled.warnings]),
                  hashes: {
                    ...createPromptHashes({
                      committedStateBefore: conversation.promptState.committed,
                      candidateStateAfter: nextPromptState?.candidate ?? null,
                      promptIR,
                      prefix: compiled.compiledPrompt,
                      payload: {
                        prompt: compiled.dispatchedPrompt,
                        negativePrompt: compiled.negativePrompt,
                        targetKey: compiled.targetKey,
                      },
                    }),
                    prefixHash: compiled.prefixHash,
                    payloadHash: compiled.payloadHash,
                  },
                  createdAt: new Date().toISOString(),
                }),
              ],
            });

            finalPromptSnapshot = toPromptSnapshot({
              originalPrompt: effectivePayload.prompt,
              compiledPrompt: compiled.compiledPrompt,
              dispatchedPrompt: compiled.dispatchedPrompt,
              semanticLosses: compiled.semanticLosses,
              warnings: uniqueWarnings([rewriteWarning, ...compiled.warnings]),
            });
            finalDispatchWarnings = [...finalPromptSnapshot.warnings];

            return {
              ...routingRequest,
              requestedTarget: {
                deploymentId: target.deployment.id,
                provider: target.provider.id,
              },
              prompt: compiled.dispatchedPrompt,
              negativePrompt: compiled.negativePrompt ?? undefined,
            };
          },
        });

        const normalizedSettledResults = await settleWithConcurrency(
          generated.images,
          GENERATED_IMAGE_NORMALIZATION_CONCURRENCY,
          async (image, index) => normalizeGeneratedImage(image, index)
        );
        const normalizedResults: Array<{
          resultId: string;
          assetId: string;
          buffer: Buffer;
          imageId: string;
          imageUrl: string;
          privateTokenHash: string;
          provider: string;
          model: string;
          mimeType?: string;
          revisedPrompt: string | null;
          index: number;
        } | null> = [];
        let normalizationFailureCount = 0;
        let firstNormalizationError: unknown = null;

        normalizedSettledResults.forEach((result, index) => {
          if (result.status === "fulfilled") {
            const normalized = result.value;
            if (!normalized) {
              normalizedResults.push(null);
              return;
            }

            const capability = createGeneratedImageCapability();
            normalizedResults.push({
              resultId: createId("chat-result"),
              assetId: createId("thread-asset"),
              buffer: normalized.buffer,
              imageId: capability.imageId,
              imageUrl: capability.imageUrl,
              privateTokenHash: capability.privateTokenHash,
              provider: generated.runtimeProvider,
              model: generated.providerModel,
              mimeType: normalized.mimeType,
              revisedPrompt: normalized.revisedPrompt,
              index: normalized.index,
            });
            return;
          }

          normalizationFailureCount += 1;
          firstNormalizationError ??= result.reason;
          app.log.warn(
            {
              err: result.reason,
              imageIndex: index,
              conversationId: persistedGeneration?.conversationId ?? null,
            },
            "Generated image result could not be normalized."
          );
        });

        const normalizedImages = normalizedResults.reduce<
          Array<{
            resultId: string;
            assetId: string;
            buffer: Buffer;
            imageId: string;
            imageUrl: string;
            privateTokenHash: string;
            provider: string;
            model: string;
            mimeType?: string;
            revisedPrompt: string | null;
            index: number;
          }>
        >((accumulator, image) => {
          if (!image) {
            return accumulator;
          }

          accumulator.push(image);
          return accumulator;
        }, []);

        const firstImageUrl = normalizedImages[0]?.imageUrl;
        const firstImageId = normalizedImages[0]?.imageId;

        if (!firstImageUrl) {
          if (firstNormalizationError) {
            throw firstNormalizationError;
          }
          throw new ProviderError("Provider did not return any image.");
        }

        const capabilityWarnings = getImageGenerationCapabilityWarnings(effectivePayload);
        const mergedWarnings = uniqueWarnings([
          ...capabilityWarnings,
          ...(generated.warnings ?? []),
          ...finalDispatchWarnings,
          normalizationFailureCount > 0 ? formatNormalizationWarning(normalizationFailureCount) : null,
        ]);

        const completedAt = new Date().toISOString();
        const completedPrompt = withProviderEffectivePrompt(
          finalPromptSnapshot,
          normalizedImages[0]?.revisedPrompt ?? null
        );
        const assets = normalizedImages.map((image, index) => ({
          id: image.assetId,
          turnId,
          runId: imageRunId,
          assetType: "image" as const,
          label: `Generated image ${index + 1}`,
          metadata: {
            imageId: image.imageId,
            imageUrl: image.imageUrl,
            mimeType: image.mimeType ?? null,
            runtimeProvider: image.provider,
            providerModel: image.model,
            index,
            revisedPrompt: image.revisedPrompt ?? null,
          },
          locators: [
            {
              id: createId("thread-locator"),
              assetId: image.assetId,
              locatorType: "generated_image_store" as const,
              locatorValue: image.imageUrl,
              mimeType: image.mimeType,
              expiresAt: null,
            },
          ],
          createdAt: completedAt,
        }));
        const assetEdges = (effectivePayload.assetRefs ?? []).flatMap((assetRef) =>
          assets.map((asset) => ({
            id: createId("thread-edge"),
            sourceAssetId: assetRef.assetId,
            targetAssetId: asset.id,
            edgeType: resolveEdgeType(assetRef.role, completedPrompt),
            turnId,
            runId: imageRunId,
            createdAt: completedAt,
          }))
        );
        const executedTarget = createRunTargetSnapshot({
          modelId: generated.modelId,
          logicalModel: generated.logicalModel,
          deploymentId: generated.deploymentId,
          runtimeProvider: generated.runtimeProvider,
          providerModel: generated.providerModel,
          pinned:
            Boolean(
              effectivePayload.requestedTarget?.deploymentId ||
                effectivePayload.requestedTarget?.provider
            ) || effectiveRetryMode === "exact",
        });
        await repository.createPromptVersions({
          conversationId: conversation.id,
          versions: [
            buildPromptVersionRecord({
              runId: imageRunId,
              turnId,
              version: compilePromptVersions.length + dispatchAttempt + 1,
              stage: "dispatch",
              targetKey: `${generated.runtimeProvider}:${generated.providerModel}`,
              attempt: dispatchAttempt,
              compilerVersion: promptContext.compilerVersion,
              capabilityVersion: promptContext.capabilityVersion,
              originalPrompt: effectivePayload.prompt,
              promptIntent: persistedRequestSnapshot.promptIntent ?? null,
              committedStateBefore:
                effectiveRetryMode === "exact" ? null : conversation.promptState.committed,
              candidateStateAfter:
                effectiveRetryMode === "exact"
                  ? null
                  : nextPromptState?.candidate ?? conversation.promptState.candidate,
              promptIR: effectiveRetryMode === "exact" ? null : promptIR,
              compiledPrompt: completedPrompt.compiledPrompt,
              dispatchedPrompt: completedPrompt.dispatchedPrompt,
              providerEffectivePrompt: completedPrompt.providerEffectivePrompt,
              semanticLosses: completedPrompt.semanticLosses,
              warnings: finalDispatchWarnings,
              hashes: createPromptHashes({
                committedStateBefore:
                  effectiveRetryMode === "exact" ? null : conversation.promptState.committed,
                candidateStateAfter:
                  effectiveRetryMode === "exact"
                    ? null
                    : nextPromptState?.candidate ?? conversation.promptState.candidate,
                promptIR: effectiveRetryMode === "exact" ? null : promptIR,
                prefix: completedPrompt.compiledPrompt,
                payload: {
                  prompt: completedPrompt.dispatchedPrompt,
                  providerEffectivePrompt: completedPrompt.providerEffectivePrompt,
                  targetKey: `${generated.runtimeProvider}:${generated.providerModel}`,
                  attempt: dispatchAttempt,
                },
              }),
              createdAt: completedAt,
            }),
          ],
        });
        const rewriteRunRecord: PersistedRunRecord = {
          id: rewriteRunId,
          turnId,
          jobId: null,
          operation: "text.rewrite",
          status: "completed",
          requestedTarget: createRewriteTargetSnapshot(rewriteModel, false),
          selectedTarget: rewriteTarget,
          executedTarget: rewriteTarget,
          prompt: rewritePromptSnapshot,
          error: null,
          warnings: uniqueWarnings([rewriteWarning]),
          assetIds: [],
          referencedAssetIds:
            effectivePayload.assetRefs?.map((assetRef) => assetRef.assetId) ?? [],
          createdAt,
          completedAt: createdAt,
          telemetry: {
            providerRequestId: null,
            providerTaskId: null,
            latencyMs: null,
          },
        };

        await repository.completeGenerationSuccess({
          conversationId: conversation.id,
          turnId,
          jobId,
          runId: imageRunId,
          attemptId,
          logicalModel: generated.logicalModel,
          deploymentId: generated.deploymentId,
          runtimeProvider: generated.runtimeProvider,
          providerModel: generated.providerModel,
          providerRequestId: generated.providerRequestId,
          providerTaskId: generated.providerTaskId,
          warnings: mergedWarnings,
          generatedImages: normalizedImages.map((image) => ({
            id: image.imageId,
            ownerUserId: userId,
            conversationId: conversation.id,
            turnId,
            mimeType: image.mimeType ?? "image/png",
            sizeBytes: image.buffer.byteLength,
            blobData: image.buffer,
            visibility: "private",
            privateTokenHash: image.privateTokenHash,
            createdAt: completedAt,
          })),
          results: normalizedImages.map((image, index) => ({
            id: image.resultId,
            imageUrl: image.imageUrl,
            imageId: image.imageId,
            threadAssetId: image.assetId,
            runtimeProvider: image.provider,
            providerModel: image.model,
            mimeType: image.mimeType,
            revisedPrompt: image.revisedPrompt,
            index,
            assetId: null,
            saved: false,
          })),
          assets,
          assetEdges,
          run: {
            status: "completed",
            prompt: completedPrompt,
            assetIds: assets.map((asset) => asset.id),
            referencedAssetIds:
              effectivePayload.assetRefs?.map((assetRef) => assetRef.assetId) ?? [],
            telemetry: {
              providerRequestId: generated.providerRequestId ?? null,
              providerTaskId: generated.providerTaskId ?? null,
              latencyMs: Date.now() - startedAt,
            },
            executedTarget,
          },
          completedAt,
        });

        const imageRunRecord: PersistedRunRecord = {
          id: imageRunId,
          turnId,
          jobId,
          operation: requestedOperation,
          status: "completed",
          requestedTarget: requestedTargetSnapshot,
          selectedTarget: createResolvedTargetSnapshot(
            selectedTarget,
            Boolean(
              effectivePayload.requestedTarget?.deploymentId ||
                effectivePayload.requestedTarget?.provider
            ) || effectiveRetryMode === "exact"
          ),
          executedTarget,
          prompt: completedPrompt,
          error: null,
          warnings: mergedWarnings,
          assetIds: assets.map((asset) => asset.id),
          referencedAssetIds:
            effectivePayload.assetRefs?.map((assetRef) => assetRef.assetId) ?? [],
          createdAt,
          completedAt,
          telemetry: {
            providerRequestId: generated.providerRequestId ?? null,
            providerTaskId: generated.providerTaskId ?? null,
            latencyMs: Date.now() - startedAt,
          },
        };

        return reply.code(200).send({
          conversationId: conversation.id,
          threadId: conversation.id,
          turnId,
          jobId,
          runId: imageRunId,
          modelId: generated.modelId,
          logicalModel: generated.logicalModel,
          deploymentId: generated.deploymentId,
          runtimeProvider: generated.runtimeProvider,
          providerModel: generated.providerModel,
          createdAt: completedAt,
          imageId: firstImageId,
          imageUrl: firstImageUrl,
          images: normalizedImages.map((image) => ({
            resultId: image.resultId,
            assetId: image.assetId,
            imageId: image.imageId,
            imageUrl: image.imageUrl,
            provider: image.provider,
            model: image.model,
            mimeType: image.mimeType,
            revisedPrompt: image.revisedPrompt,
          })),
          runs: [rewriteRunRecord, imageRunRecord],
          assets,
          primaryAssetIds: assets.map((asset) => asset.id),
          ...(mergedWarnings.length > 0 ? { warnings: mergedWarnings } : {}),
        });
      } catch (error) {
        if (error instanceof ChatPromptStateConflictError) {
          return reply.code(409).send({
            error: "Conversation state changed during prompt compilation. Please retry.",
          });
        }

        const failureMessage = requestController.signal.aborted
          ? "Image generation was canceled."
          : error instanceof Error
            ? error.message
            : "Image generation failed.";

        if (persistedGeneration) {
          try {
            await app.chatStateRepository.completeGenerationFailure({
              conversationId: persistedGeneration.conversationId,
              turnId: persistedGeneration.turnId,
              jobId: persistedGeneration.jobId,
              runId: persistedGeneration.runId,
              attemptId: persistedGeneration.attemptId,
              error: failureMessage,
              completedAt: new Date().toISOString(),
            });
          } catch (persistenceError) {
            app.log.error(persistenceError);
          }
        }

        if (requestController.signal.aborted || reply.raw.destroyed) {
          return reply;
        }

        if (error instanceof ProviderError) {
          return reply.code(error.statusCode).send({
            error: error.message,
            ...(persistedGeneration
              ? {
                  conversationId: persistedGeneration.conversationId,
                  threadId: persistedGeneration.conversationId,
                  turnId: persistedGeneration.turnId,
                  jobId: persistedGeneration.jobId,
                  runId: persistedGeneration.runId,
                }
              : {}),
          });
        }
        app.log.error(error);
        return reply.code(500).send({
          error: "Image generation failed.",
          ...(persistedGeneration
            ? {
                conversationId: persistedGeneration.conversationId,
                threadId: persistedGeneration.conversationId,
                turnId: persistedGeneration.turnId,
                jobId: persistedGeneration.jobId,
                runId: persistedGeneration.runId,
              }
            : {}),
        });
      } finally {
        request.raw.removeListener("aborted", abortRequest);
        reply.raw.removeListener("close", handleResponseClose);
      }
    }
  );
};
