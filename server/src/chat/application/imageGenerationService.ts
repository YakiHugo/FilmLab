import type { FastifyBaseLogger } from "fastify";
import type { AssetService } from "../../assets/service";
import type { PersistedRunRecord } from "../persistence/models";
import type { ChatStateRepository } from "../persistence/types";
import { createId } from "../../../../shared/createId";
import type { ImageGenerationResponse } from "../../../../shared/imageGeneration";
import { withProviderEffectivePrompt } from "../../gateway/prompt/compiler";
import { getFrontendImageModelById } from "../../models/frontendRegistry";
import { ProviderError } from "../../providers/base/errors";
import type { AppConfig } from "../../config";
import { getImageGenerationCapabilityWarnings } from "../../shared/imageGenerationCapabilityWarnings";
import type { ParsedImageGenerationRequest } from "../../shared/imageGenerationSchema";
import { GenerationPersister } from "./imageGeneration/generationPersister";
import { InputAssetProjector } from "./imageGeneration/inputAssetProjector";
import { ProviderExecutor } from "./imageGeneration/providerExecutor";
import {
  PromptCompileCoordinator,
  type PromptResolution,
} from "./imageGeneration/promptCompileCoordinator";
import {
  createResolvedTargetSnapshot,
  createRewriteTargetSnapshot,
  createRunTargetSnapshot,
  findRetryJob,
  findRetryRun,
  formatNormalizationWarning,
  settleWithConcurrency,
  toExactRetryPayload,
  toPersistedConfigSnapshot,
  toPersistedRequestSnapshot,
  uniqueWarnings,
} from "./imageGeneration/helpers";
import {
  collectNormalizedImages,
  normalizeGeneratedImage,
} from "./imageGeneration/imageNormalization";
import { commitGeneratedAssets } from "./imageGeneration/generatedAssets";
import {
  ImageGenerationCommandError,
  type PersistedGenerationContext,
} from "./imageGeneration/errors";

export { ImageGenerationCommandError, type PersistedGenerationContext } from "./imageGeneration/errors";

const GENERATED_IMAGE_NORMALIZATION_CONCURRENCY = 2;

export type ImageGenerationServiceDeps = {
  repository: ChatStateRepository;
  assetService: AssetService;
  config: AppConfig;
};

export type ExecuteImageGenerationCommandInput = {
  userId: string;
  payload: ParsedImageGenerationRequest;
  traceId: string;
  signal: AbortSignal;
  logger: FastifyBaseLogger;
};

export class ImageGenerationService {
  private readonly providerExecutor: ProviderExecutor;
  private readonly promptCompileCoordinator: PromptCompileCoordinator;
  private readonly inputAssetProjector: InputAssetProjector;
  private readonly generationPersister: GenerationPersister;

  constructor(private readonly deps: ImageGenerationServiceDeps) {
    this.providerExecutor = new ProviderExecutor({ config: deps.config });
    this.promptCompileCoordinator = new PromptCompileCoordinator({ config: deps.config });
    this.inputAssetProjector = new InputAssetProjector({ assetService: deps.assetService });
    this.generationPersister = new GenerationPersister({
      repository: deps.repository,
      assetService: deps.assetService,
    });
  }

  async execute(input: ExecuteImageGenerationCommandInput): Promise<ImageGenerationResponse> {
    const { repository, assetService, config } = this.deps;
    const { userId, payload, traceId, signal, logger } = input;

    let persistedGeneration: PersistedGenerationContext | null = null;
    let createdGeneratedAssetIds: string[] = [];
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

      const requestedOperation = this.promptCompileCoordinator.resolveRequestedOperation(
        effectivePayload.operation
      );
      const promptContext = this.promptCompileCoordinator.createContext(
        conversation.promptState,
        rewriteModel,
        effectiveRetryMode,
        requestedOperation
      );
      this.promptCompileCoordinator.validateCompatibility(
        effectivePayload,
        frontendModel,
        effectiveRetryMode
      );

      const persistedRequestSnapshot = toPersistedRequestSnapshot(effectivePayload);
      const persistedConfigSnapshot = toPersistedConfigSnapshot(effectivePayload);
      const routingRequest = effectivePayload;
      const routeTargets = this.providerExecutor.getRouteTargets(routingRequest);

      const prompts: PromptResolution = await this.promptCompileCoordinator.resolveInitialPrompts({
        effectiveRetryMode,
        effectivePayload,
        exactRetrySourceRun,
        conversation,
        routeTargets,
        frontendModel,
        rewriteModel,
        promptContext,
        persistedRequestSnapshot,
        signal,
        logger,
        ids: { rewriteRunId, imageRunId, turnId, traceId },
        createdAt,
      });

      const referencedAssetIds =
        effectivePayload.inputAssets?.map((inputAsset) => inputAsset.assetId) ?? [];
      const rewriteRun: PersistedRunRecord = {
        id: rewriteRunId,
        turnId,
        jobId: null,
        operation: "text.rewrite",
        status: "completed",
        requestedTarget: createRewriteTargetSnapshot(rewriteModel, false),
        selectedTarget: prompts.rewriteTarget,
        executedTarget: prompts.rewriteTarget,
        prompt: prompts.rewritePromptSnapshot,
        error: null,
        warnings: uniqueWarnings([prompts.rewriteWarning]),
        assetIds: [],
        referencedAssetIds,
        createdAt,
        completedAt: createdAt,
        telemetry: { traceId, providerRequestId: null, providerTaskId: null, latencyMs: null },
      };

      persistedGeneration = {
        conversationId: conversation.id,
        turnId,
        jobId,
        runId: imageRunId,
        attemptId,
      };

      const pinnedTarget =
        Boolean(
          effectivePayload.requestedTarget?.deploymentId ||
            effectivePayload.requestedTarget?.provider
        ) || effectiveRetryMode === "exact";

      await this.generationPersister.createInitial({
        conversationId: conversation.id,
        turn: {
          id: turnId,
          prompt: effectivePayload.prompt,
          createdAt,
          retryOfTurnId: effectivePayload.retryOfTurnId ?? null,
          modelId: effectivePayload.modelId,
          logicalModel: frontendModel.logicalModel,
          deploymentId: prompts.selectedTarget.deployment.id,
          runtimeProvider: prompts.selectedTarget.provider.id,
          providerModel: prompts.selectedTarget.deployment.providerModel,
          configSnapshot: persistedConfigSnapshot,
          status: "loading",
          error: null,
          warnings: [],
          jobId,
          runIds: [rewriteRunId, imageRunId],
          referencedAssetIds,
          primaryAssetIds: [],
          results: [],
        },
        job: {
          id: jobId,
          turnId,
          runId: imageRunId,
          modelId: effectivePayload.modelId,
          logicalModel: frontendModel.logicalModel,
          deploymentId: prompts.selectedTarget.deployment.id,
          runtimeProvider: prompts.selectedTarget.provider.id,
          providerModel: prompts.selectedTarget.deployment.providerModel,
          compiledPrompt: prompts.initialPromptSnapshot.compiledPrompt,
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
          requestedTarget: prompts.requestedTargetSnapshot,
          selectedTarget: createResolvedTargetSnapshot(prompts.selectedTarget, pinnedTarget),
          executedTarget: null,
          prompt: prompts.initialPromptSnapshot,
          error: null,
          warnings: prompts.initialPromptSnapshot.warnings,
          assetIds: [],
          referencedAssetIds,
          createdAt,
          completedAt: null,
          telemetry: { traceId, providerRequestId: null, providerTaskId: null, latencyMs: null },
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
        additionalRuns: [rewriteRun],
        promptVersions: [
          ...(prompts.rewritePromptVersion ? [prompts.rewritePromptVersion] : []),
          ...prompts.compilePromptVersions,
        ],
      });

      const startedAt = Date.now();
      const dispatchState = {
        attempt: 0,
        finalPromptSnapshot: prompts.initialPromptSnapshot,
        finalWarnings: [...prompts.initialPromptSnapshot.warnings],
        finalNegativePrompt: undefined as string | undefined,
      };

      const generated = await this.providerExecutor.generate(routingRequest, {
        signal,
        traceId,
        logger,
        targets: prompts.routeTargets,
        resolveRequest: async (target) => {
          dispatchState.attempt += 1;
          const compileResult = this.promptCompileCoordinator.compileForDispatchAttempt({
            target,
            effectiveRetryMode,
            exactRetryPrompt: prompts.exactRetryPrompt,
            effectivePayload,
            promptIR: prompts.promptIR,
            nextPromptState: prompts.nextPromptState,
            promptContext,
            rewriteWarning: prompts.rewriteWarning,
            persistedRequestSnapshot,
            conversationPromptState: conversation.promptState,
            compilePromptVersionCount: prompts.compilePromptVersions.length,
            compiledTargetCache: prompts.compiledTargetCache,
            attemptNumber: dispatchState.attempt,
            ids: { imageRunId, turnId, traceId },
          });
          await this.generationPersister.persistDispatchPromptVersion({
            conversationId: conversation.id,
            promptVersion: compileResult.promptVersion,
          });
          dispatchState.finalPromptSnapshot = compileResult.finalPromptSnapshot;
          dispatchState.finalWarnings = compileResult.finalWarnings;
          dispatchState.finalNegativePrompt = compileResult.negativePrompt;
          const resolvedInputAssets = await this.inputAssetProjector.projectForDispatch({
            userId,
            target,
            payload: effectivePayload,
            effectiveRetryMode,
          });
          return {
            ...routingRequest,
            requestedTarget: {
              deploymentId: target.deployment.id,
              provider: target.provider.id,
            },
            resolvedInputAssets,
            prompt: compileResult.dispatchedPrompt,
            negativePrompt: compileResult.negativePrompt,
          };
        },
      });

      const normalizedSettledResults = await settleWithConcurrency(
        generated.images,
        GENERATED_IMAGE_NORMALIZATION_CONCURRENCY,
        async (image, index) =>
          normalizeGeneratedImage(image, index, signal, config.generatedImageDownloadMaxBytes, config)
      );

      const { normalizedImages, normalizationFailureCount, firstNormalizationError } =
        collectNormalizedImages(
          normalizedSettledResults,
          {
            provider: generated.runtimeProvider,
            providerModel: generated.providerModel,
            conversationId: persistedGeneration?.conversationId ?? null,
            turnId: persistedGeneration?.turnId ?? null,
            runId: persistedGeneration?.runId ?? null,
          },
          logger
        );

      if (normalizedImages.length === 0) {
        if (firstNormalizationError) {
          throw firstNormalizationError;
        }
        throw new ProviderError("Provider did not return any image.");
      }

      const capabilityWarnings =
        effectiveRetryMode === "exact"
          ? []
          : getImageGenerationCapabilityWarnings(effectivePayload);
      const mergedWarnings = uniqueWarnings([
        ...capabilityWarnings,
        ...(generated.warnings ?? []),
        ...dispatchState.finalWarnings,
        normalizationFailureCount > 0 ? formatNormalizationWarning(normalizationFailureCount) : null,
      ]);

      const completedAt = new Date().toISOString();
      const completedPrompt = withProviderEffectivePrompt(
        dispatchState.finalPromptSnapshot,
        normalizedImages[0]?.revisedPrompt ?? null
      );

      const committed = await commitGeneratedAssets(assetService, {
        userId,
        conversationId: conversation.id,
        turnId,
        runId: imageRunId,
        completedAt,
        normalizedImages,
        effectivePayload,
        completedPrompt,
      });
      createdGeneratedAssetIds = committed.createdGeneratedAssetIds;
      createdAssetEdgeIds = committed.createdAssetEdgeIds;

      const executedTarget = createRunTargetSnapshot({
        modelId: generated.modelId,
        logicalModel: generated.logicalModel,
        deploymentId: generated.deploymentId,
        runtimeProvider: generated.runtimeProvider,
        providerModel: generated.providerModel,
        pinned: pinnedTarget,
      });

      const finalDispatchPromptVersion =
        this.promptCompileCoordinator.buildFinalDispatchPromptVersion({
          persistedRequestSnapshot,
          effectivePayload,
          effectiveRetryMode,
          conversationPromptState: conversation.promptState,
          nextPromptState: prompts.nextPromptState,
          promptIR: prompts.promptIR,
          promptContext,
          compilePromptVersionCount: prompts.compilePromptVersions.length,
          attemptNumber: dispatchState.attempt,
          finalWarnings: dispatchState.finalWarnings,
          finalNegativePrompt: dispatchState.finalNegativePrompt,
          completedPrompt,
          generated,
          ids: { imageRunId, turnId, traceId },
          createdAt: completedAt,
        });

      await this.generationPersister.completeSuccess({
        persistedGeneration,
        generated,
        completedAt,
        mergedWarnings,
        finalDispatchPromptVersion,
        results: committed.assetizedImages.map((image, index) => ({
          id: image.resultId,
          imageUrl: image.imageUrl,
          imageId: null,
          runtimeProvider: image.provider,
          providerModel: image.model,
          mimeType: image.mimeType,
          revisedPrompt: image.revisedPrompt,
          index,
          assetId: image.assetId,
          saved: true,
        })),
        assets: committed.assets,
        assetEdges: committed.assetEdges,
        run: {
          status: "completed",
          prompt: completedPrompt,
          assetIds: committed.assets.map((asset) => asset.id),
          referencedAssetIds,
          telemetry: {
            traceId,
            providerRequestId: generated.providerRequestId ?? null,
            providerTaskId: generated.providerTaskId ?? null,
            latencyMs: Date.now() - startedAt,
          },
          executedTarget,
        },
      });
      generationAssetsCommitted = true;

      if (prompts.nextPromptState) {
        await this.generationPersister.updateDeferredPromptState({
          conversationId: conversation.id,
          nextPromptState: prompts.nextPromptState,
          expectedRevision: conversation.promptState.revision,
          completedAt,
          turnId,
          logger,
        });
      }

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
        imageUrl: committed.assetizedImages[0]?.imageUrl,
        images: committed.assetizedImages.map((image) => ({
          resultId: image.resultId,
          assetId: image.assetId,
          imageUrl: image.imageUrl,
          provider: image.provider,
          model: image.model,
          mimeType: image.mimeType,
          revisedPrompt: image.revisedPrompt,
        })),
        primaryAssetIds: committed.assets.map((asset) => asset.id),
        ...(mergedWarnings.length > 0 ? { warnings: mergedWarnings } : {}),
      };
    } catch (error) {
      throw await this.generationPersister.handleFailure(error, {
        signal,
        persistedGeneration,
        userId,
        generationAssetsCommitted,
        createdAssetEdgeIds,
        createdGeneratedAssetIds,
        logger,
      });
    }
  }
}
