import type { FastifyBaseLogger } from "fastify";
import type { AssetService } from "../../assets/service";
import type {
  PersistedAssetEdgeType,
  PersistedConversationCreativeState,
  GenerationJobSnapshot,
  PersistedImageGenerationRequestSnapshot,
  PersistedPromptSnapshot,
  PersistedRunRecord,
  PersistedRunTargetSnapshot,
} from "../persistence/models";
import type { ChatStateRepository } from "../persistence/types";
import { createId } from "../../../../shared/createId";
import type {
  ImageGenerationResponse,
  ImageGenerationAssetRef,
  ImagePromptCompilerOperationId,
  ImageProviderId,
} from "../../../../shared/imageGeneration";
import type { PromptVersionRecord } from "../../gateway/prompt/types";
import { ChatPromptStateConflictError } from "../persistence/types";
import { getConfig } from "../../config";
import {
  applyTurnDelta,
  buildPromptIR,
  compilePromptForTarget,
  createPromptCompilationContext,
  createPromptHashes,
  toPromptSnapshot,
  withProviderEffectivePrompt,
} from "../../gateway/prompt/compiler";
import { rewriteTurn } from "../../gateway/prompt/rewrite";
import { imageRuntimeRouter } from "../../gateway/router/router";
import type { ResolvedRouteTarget } from "../../gateway/router/types";
import { getFrontendImageModelById } from "../../models/frontendRegistry";
import { ProviderError } from "../../providers/base/errors";
import { downloadGeneratedImage } from "../../shared/downloadGeneratedImage";
import { getImageGenerationCapabilityWarnings } from "../../shared/imageGenerationCapabilityWarnings";
import {
  imageGenerationRequestSchema,
  type ParsedImageGenerationRequest,
  validateImageGenerationRequestAgainstModel,
} from "../../shared/imageGenerationSchema";
import { resolveImagePromptCompilerOperation } from "../../../../shared/imageGeneration";

const GENERATED_IMAGE_NORMALIZATION_CONCURRENCY = 2;

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

export type PersistedGenerationContext = {
  conversationId: string;
  turnId: string;
  jobId: string;
  runId: string;
  attemptId: string;
};

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
  traceId: string;
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
  traceId: input.traceId,
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

export type ImageGenerationServiceDeps = {
  repository: ChatStateRepository;
  assetService: AssetService;
  config: ReturnType<typeof getConfig>;
};

export type ExecuteImageGenerationCommandInput = {
  userId: string;
  payload: ParsedImageGenerationRequest;
  traceId: string;
  signal: AbortSignal;
  logger: FastifyBaseLogger;
};

export class ImageGenerationCommandError extends Error {
  readonly statusCode: number;
  readonly persistedGeneration: PersistedGenerationContext | null;

  constructor(input: {
    statusCode: number;
    message: string;
    persistedGeneration?: PersistedGenerationContext | null;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "ImageGenerationCommandError";
    this.statusCode = input.statusCode;
    this.persistedGeneration = input.persistedGeneration ?? null;
    if (input.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = input.cause;
    }
  }
}

export class ImageGenerationService {
  constructor(private readonly deps: ImageGenerationServiceDeps) {}

  async execute(input: ExecuteImageGenerationCommandInput): Promise<ImageGenerationResponse> {
    const { repository, assetService, config } = this.deps;
    const { userId, payload, traceId, signal, logger } = input;

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
            signal,
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

    let persistedGeneration: PersistedGenerationContext | null = null;
    const createdGeneratedAssetIds: string[] = [];
    let createdAssetEdgeIds: string[] = [];
    let generationAssetsCommitted = false;

    try {
        if (
          payload.threadId &&
          payload.conversationId &&
          payload.threadId !== payload.conversationId
        ) {
          throw new ImageGenerationCommandError({
            statusCode: 400,
            message: "threadId and conversationId must match when both are provided.",
          });
        }

        const requestedConversationId = payload.threadId ?? payload.conversationId;
        const conversation = requestedConversationId
          ? await repository.getConversationById(userId, requestedConversationId)
          : await repository.getOrCreateActiveConversation(userId);
        if (!conversation) {
          throw new ImageGenerationCommandError({
            statusCode: 404,
            message: "Conversation not found.",
          });
        }

        if (payload.retryOfTurnId) {
          const retryTurnExists = await repository.turnExists(
            userId,
            conversation.id,
            payload.retryOfTurnId
          );
          if (!retryTurnExists) {
            throw new ImageGenerationCommandError({
              statusCode: 400,
              message: "retryOfTurnId does not belong to the selected conversation.",
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
            throw new ImageGenerationCommandError({
              statusCode: 400,
              message: "Exact retry is unavailable because no prior execution snapshot was found.",
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
          throw new ImageGenerationCommandError({
            statusCode: 400,
            message: `Unsupported modelId: ${effectivePayload.modelId}.`,
          });
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
          throw new ImageGenerationCommandError({
            statusCode: 400,
            message: firstIssue?.message ?? "Request is incompatible with selected model.",
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
            throw new ImageGenerationCommandError({
              statusCode: 400,
              message: "Exact retry is unavailable because no prior prompt snapshot was found.",
            });
          }

          const exactTarget = findMatchingExactTarget(routeTargets, retryRun);
          if (!exactTarget) {
            throw new ImageGenerationCommandError({
              statusCode: 400,
              message: "Exact retry target is no longer available. Use recompile retry instead.",
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
            signal,
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
            traceId,
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
              traceId,
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
              traceId,
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
              traceId,
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
          signal,
          traceId,
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
                    traceId,
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
                resolvedAssetRefs: await assetService.resolveProviderAssetRefs(
                  userId,
                  effectivePayload.assetRefs ?? []
                ),
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
                  traceId,
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
              resolvedAssetRefs: await assetService.resolveProviderAssetRefs(
                userId,
                effectivePayload.assetRefs ?? []
              ),
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
          buffer: Buffer;
          provider: ImageProviderId;
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

            normalizedResults.push({
              buffer: normalized.buffer,
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
          logger.warn(
            {
              err: result.reason,
              imageIndex: index,
              conversationId: persistedGeneration?.conversationId ?? null,
              turnId: persistedGeneration?.turnId ?? null,
              runId: persistedGeneration?.runId ?? null,
            },
            "Generated image result could not be normalized."
          );
        });

        const normalizedImages = normalizedResults.reduce<
          Array<{
            buffer: Buffer;
            provider: ImageProviderId;
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

        if (normalizedImages.length === 0) {
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
        const assetizedImages: Array<{
          resultId: string;
          assetId: string;
          imageUrl: string;
          thumbnailUrl: string;
          created: boolean;
          provider: ImageProviderId;
          model: string;
          mimeType?: string;
          revisedPrompt: string | null;
          index: number;
        }> = [];
        for (const [index, image] of normalizedImages.entries()) {
          const createdAsset = await assetService.createGeneratedAsset({
            userId,
            name: `generated-${turnId}-${index + 1}`,
            mimeType: image.mimeType ?? "image/png",
            buffer: image.buffer,
            createdAt: completedAt,
            source: "ai-generated",
            origin: "ai",
            metadata: {
              runtimeProvider: image.provider,
              providerModel: image.model,
              revisedPrompt: image.revisedPrompt ?? null,
              index,
            },
          });
          if (createdAsset.created) {
            createdGeneratedAssetIds.push(createdAsset.assetId);
          }

          assetizedImages.push({
            resultId: createId("chat-result"),
            assetId: createdAsset.assetId,
            imageUrl: createdAsset.objectUrl,
            thumbnailUrl: createdAsset.thumbnailUrl,
            created: createdAsset.created,
            provider: image.provider,
            model: image.model,
            mimeType: createdAsset.type,
            revisedPrompt: image.revisedPrompt,
            index: image.index,
          });
        }
        const assets = assetizedImages.map((image, index) => ({
          id: image.assetId,
          turnId,
          runId: imageRunId,
          assetType: "image" as const,
          label: `Generated image ${index + 1}`,
          metadata: {
            imageUrl: image.imageUrl,
            thumbnailUrl: image.thumbnailUrl,
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
              locatorType: "remote_url" as const,
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
        await assetService.createAssetEdges(
          assetEdges.map((edge) => ({
            ...edge,
            conversationId: conversation.id,
          }))
        );
        createdAssetEdgeIds = assetEdges.map((edge) => edge.id);
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
              traceId,
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
          generatedImages: [],
          results: assetizedImages.map((image, index) => ({
            id: image.resultId,
            imageUrl: image.imageUrl,
            imageId: null,
            threadAssetId: image.assetId,
            runtimeProvider: image.provider,
            providerModel: image.model,
            mimeType: image.mimeType,
            revisedPrompt: image.revisedPrompt,
            index,
            assetId: image.assetId,
            saved: true,
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
              traceId,
              providerRequestId: generated.providerRequestId ?? null,
              providerTaskId: generated.providerTaskId ?? null,
              latencyMs: Date.now() - startedAt,
            },
            executedTarget,
          },
          completedAt,
        });
        generationAssetsCommitted = true;

        return {
          conversationId: conversation.id,
          threadId: conversation.id,
          turnId,
          jobId,
          runId: imageRunId,
          traceId,
          modelId: generated.modelId,
          logicalModel: generated.logicalModel,
          deploymentId: generated.deploymentId,
          runtimeProvider: generated.runtimeProvider,
          providerModel: generated.providerModel,
          createdAt: completedAt,
          imageUrl: assetizedImages[0]?.imageUrl,
          images: assetizedImages.map((image) => ({
            resultId: image.resultId,
            assetId: image.assetId,
            imageUrl: image.imageUrl,
            provider: image.provider,
            model: image.model,
            mimeType: image.mimeType,
            revisedPrompt: image.revisedPrompt,
          })),
          primaryAssetIds: assets.map((asset) => asset.id),
          ...(mergedWarnings.length > 0 ? { warnings: mergedWarnings } : {}),
        };
    } catch (error) {
        const failureMessage = signal.aborted
          ? "Image generation was canceled."
          : error instanceof Error
            ? error.message
            : "Image generation failed.";

        if (persistedGeneration) {
          try {
            await repository.completeGenerationFailure({
              conversationId: persistedGeneration.conversationId,
              turnId: persistedGeneration.turnId,
              jobId: persistedGeneration.jobId,
              runId: persistedGeneration.runId,
              attemptId: persistedGeneration.attemptId,
              error: failureMessage,
              completedAt: new Date().toISOString(),
            });
          } catch (persistenceError) {
            logger.error(
              {
                err: persistenceError,
                conversationId: persistedGeneration.conversationId,
                turnId: persistedGeneration.turnId,
                jobId: persistedGeneration.jobId,
                runId: persistedGeneration.runId,
              },
              "Failed to persist image generation failure state."
            );
          }
        }

        if (!generationAssetsCommitted && createdAssetEdgeIds.length > 0) {
          await assetService.deleteAssetEdges(createdAssetEdgeIds).catch(() => undefined);
        }
        if (!generationAssetsCommitted && createdGeneratedAssetIds.length > 0) {
          await Promise.allSettled(
            createdGeneratedAssetIds.map((assetId) => assetService.deleteAsset(userId, assetId))
          );
        }

        let commandError: ImageGenerationCommandError;

        if (error instanceof ImageGenerationCommandError) {
          commandError = error;
        } else if (error instanceof ChatPromptStateConflictError) {
          commandError = new ImageGenerationCommandError({
            statusCode: 409,
            message: "Conversation state changed during prompt compilation. Please retry.",
            persistedGeneration,
            cause: error,
          });
        } else if (error instanceof ProviderError) {
          if (!signal.aborted) {
            logger.warn(
              {
                err: error,
                conversationId: persistedGeneration?.conversationId ?? null,
                turnId: persistedGeneration?.turnId ?? null,
                jobId: persistedGeneration?.jobId ?? null,
                runId: persistedGeneration?.runId ?? null,
              },
              "Image generation failed with a provider error."
            );
          }

          commandError = new ImageGenerationCommandError({
            statusCode: error.statusCode,
            message: error.message,
            persistedGeneration,
            cause: error,
          });
        } else {
          if (!signal.aborted) {
            logger.error(
              {
                err: error,
                conversationId: persistedGeneration?.conversationId ?? null,
                turnId: persistedGeneration?.turnId ?? null,
                jobId: persistedGeneration?.jobId ?? null,
                runId: persistedGeneration?.runId ?? null,
              },
              "Image generation failed."
            );
          }

          commandError = new ImageGenerationCommandError({
            statusCode: 500,
            message: "Image generation failed.",
            persistedGeneration,
            cause: error,
          });
        }

        throw commandError;
    }
  }
}
