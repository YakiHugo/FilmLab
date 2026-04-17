import type { FastifyBaseLogger } from "fastify";
import type { AssetService } from "../../../assets/service";
import { ProviderError } from "../../../providers/base/errors";
import type {
  PersistedConversationCreativeState,
  PersistedPromptSnapshot,
  PersistedRunRecord,
  PersistedRunTargetSnapshot,
  GenerationJobSnapshot,
  PersistedGenerationTurn,
  PersistedResultItem,
  PersistedAssetRecord,
  PersistedAssetEdgeRecord,
} from "../../persistence/models";
import type { ChatAttemptRecord, ChatStateRepository } from "../../persistence/types";
import { ChatPromptStateConflictError } from "../../persistence/types";
import type { PromptVersionRecord } from "../../../domain/prompt";
import type { ImageProviderId } from "../../../../../shared/imageGeneration";
import { ImageGenerationCommandError, type PersistedGenerationContext } from "./errors";

export type CreateInitialGenerationInput = {
  conversationId: string;
  turn: PersistedGenerationTurn;
  job: GenerationJobSnapshot;
  run: PersistedRunRecord;
  attempt: ChatAttemptRecord;
  additionalRuns: PersistedRunRecord[];
  promptVersions: PromptVersionRecord[];
};

export type PersistDispatchPromptVersionInput = {
  conversationId: string;
  promptVersion: PromptVersionRecord;
};

export type CompleteSuccessInput = {
  persistedGeneration: PersistedGenerationContext;
  generated: {
    logicalModel: string;
    deploymentId: string;
    runtimeProvider: ImageProviderId;
    providerModel: string;
    providerRequestId?: string;
    providerTaskId?: string;
  };
  completedAt: string;
  mergedWarnings: string[];
  results: PersistedResultItem[];
  assets: PersistedAssetRecord[];
  assetEdges: PersistedAssetEdgeRecord[];
  run: {
    status: "completed";
    prompt: PersistedPromptSnapshot;
    assetIds: string[];
    referencedAssetIds: string[];
    telemetry: PersistedRunRecord["telemetry"];
    executedTarget: PersistedRunTargetSnapshot;
  };
  finalDispatchPromptVersion: PromptVersionRecord;
};

export type UpdateDeferredPromptStateInput = {
  conversationId: string;
  nextPromptState: PersistedConversationCreativeState;
  expectedRevision: number;
  completedAt: string;
  turnId: string;
  logger: FastifyBaseLogger;
};

export type HandleFailureInput = {
  signal: AbortSignal;
  persistedGeneration: PersistedGenerationContext | null;
  userId: string;
  generationAssetsCommitted: boolean;
  createdAssetEdgeIds: string[];
  createdGeneratedAssetIds: string[];
  logger: FastifyBaseLogger;
};

export class GenerationPersister {
  constructor(
    private readonly deps: {
      repository: ChatStateRepository;
      assetService: AssetService;
    }
  ) {}

  async createInitial(input: CreateInitialGenerationInput): Promise<void> {
    await this.deps.repository.createGeneration({
      conversationId: input.conversationId,
      turn: input.turn,
      job: input.job,
      run: input.run,
      attempt: input.attempt,
      additionalRuns: input.additionalRuns,
      promptVersions: input.promptVersions,
    });
  }

  async persistDispatchPromptVersion(input: PersistDispatchPromptVersionInput): Promise<void> {
    await this.deps.repository.createPromptVersions({
      conversationId: input.conversationId,
      versions: [input.promptVersion],
    });
  }

  async completeSuccess(input: CompleteSuccessInput): Promise<void> {
    const { persistedGeneration, generated, completedAt, run } = input;
    await this.deps.repository.createPromptVersions({
      conversationId: persistedGeneration.conversationId,
      versions: [input.finalDispatchPromptVersion],
    });
    await this.deps.repository.completeGenerationSuccess({
      conversationId: persistedGeneration.conversationId,
      turnId: persistedGeneration.turnId,
      jobId: persistedGeneration.jobId,
      runId: persistedGeneration.runId,
      attemptId: persistedGeneration.attemptId,
      logicalModel: generated.logicalModel,
      deploymentId: generated.deploymentId,
      runtimeProvider: generated.runtimeProvider,
      providerModel: generated.providerModel,
      providerRequestId: generated.providerRequestId,
      providerTaskId: generated.providerTaskId,
      warnings: input.mergedWarnings,
      results: input.results,
      assets: input.assets,
      assetEdges: input.assetEdges,
      run,
      completedAt,
    });
  }

  async updateDeferredPromptState(input: UpdateDeferredPromptStateInput): Promise<void> {
    try {
      await this.deps.repository.updateConversationPromptState({
        conversationId: input.conversationId,
        promptState: input.nextPromptState,
        expectedRevision: input.expectedRevision,
        updatedAt: input.completedAt,
      });
    } catch (promptStateError) {
      input.logger.warn(
        { err: promptStateError, conversationId: input.conversationId, turnId: input.turnId },
        "Prompt state update failed after successful generation; generation result is preserved."
      );
    }
  }

  async handleFailure(
    error: unknown,
    cleanup: HandleFailureInput
  ): Promise<ImageGenerationCommandError> {
    const {
      signal,
      persistedGeneration,
      userId,
      generationAssetsCommitted,
      createdAssetEdgeIds,
      createdGeneratedAssetIds,
      logger,
    } = cleanup;

    const failureMessage = signal.aborted
      ? "Image generation was canceled."
      : error instanceof Error
        ? error.message
        : "Image generation failed.";

    if (persistedGeneration) {
      try {
        await this.deps.repository.completeGenerationFailure({
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
      await this.deps.assetService.deleteAssetEdges(createdAssetEdgeIds).catch(() => undefined);
    }
    if (!generationAssetsCommitted && createdGeneratedAssetIds.length > 0) {
      await Promise.allSettled(
        createdGeneratedAssetIds.map((assetId) => this.deps.assetService.deleteAsset(userId, assetId))
      );
    }

    if (error instanceof ImageGenerationCommandError) {
      return error;
    }
    if (error instanceof ChatPromptStateConflictError) {
      return new ImageGenerationCommandError({
        statusCode: 409,
        message: "Conversation state changed during prompt compilation. Please retry.",
        persistedGeneration,
        cause: error,
      });
    }
    if (error instanceof ProviderError) {
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

      return new ImageGenerationCommandError({
        statusCode: error.statusCode,
        message: error.message,
        persistedGeneration,
        cause: error,
      });
    }

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

    return new ImageGenerationCommandError({
      statusCode: 500,
      message: "Image generation failed.",
      persistedGeneration,
      cause: error,
    });
  }
}
