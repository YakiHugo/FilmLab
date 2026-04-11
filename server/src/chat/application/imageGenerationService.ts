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
  ImageInputAssetBinding,
  ImagePromptCompilerOperationId,
  ImageProviderId,
} from "../../../../shared/imageGeneration";
import type { PromptVersionRecord } from "../../gateway/prompt/types";
import { ChatPromptStateConflictError } from "../persistence/types";
import type { AppConfig } from "../../config";
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
import { createImageRuntimeRouter } from "../../gateway/router/router";
import type { ResolvedRouteTarget } from "../../gateway/router/types";
import { getFrontendImageModelById } from "../../models/frontendRegistry";
import { ProviderError } from "../../providers/base/errors";
import { downloadGeneratedImage, type DownloadGeneratedImageConfig } from "../../shared/downloadGeneratedImage";
import { getImageGenerationCapabilityWarnings } from "../../shared/imageGenerationCapabilityWarnings";
import {
  imageGenerationRequestSchema,
  type ParsedImageGenerationRequest,
  validateImageGenerationRequestAgainstModel,
} from "../../shared/imageGenerationSchema";
import {
  resolveExactRetryNegativePrompt,
  resolveImagePromptCompilerOperation,
} from "../../../../shared/imageGeneration";
import { projectInputAssetsForModelExecution } from "../../shared/imageInputAssetExecution";
import type { ResolvedProviderInputAsset } from "../../assets/types";

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
  inputAsset: ImageInputAssetBinding,
  operation: ParsedImageGenerationRequest["operation"],
  prompt: PersistedPromptSnapshot | null
): PersistedAssetEdgeType => {
  if (inputAsset.binding === "guide") {
    return "referenced_in_turn";
  }

  if (
    prompt?.semanticLosses.some((loss) => SOURCE_ASSET_DEGRADATION_CODES.has(loss.code))
  ) {
    return "referenced_in_turn";
  }

  switch (operation) {
    case "edit":
      return "edited_from_asset";
    case "variation":
      return "variant_of";
    default:
      return "referenced_in_turn";
  }
};

const resolveRequestedOperation = (
  operation: ParsedImageGenerationRequest["operation"]
): ImagePromptCompilerOperationId => resolveImagePromptCompilerOperation(operation);

const resolveDispatchInputAssets = (
  target: ResolvedRouteTarget,
  payload: ParsedImageGenerationRequest
) =>
  projectInputAssetsForModelExecution({
    inputAssets: payload.inputAssets ?? [],
    operation: payload.operation,
    promptCompiler: target.frontendModel.promptCompiler,
  });

const resolveExactRetryInputAssets = (payload: ParsedImageGenerationRequest) =>
  (payload.inputAssets ?? []).map((entry) => ({ ...entry }));

const toPersistedRequestSnapshot = (
  payload: unknown
): PersistedImageGenerationRequestSnapshot =>
  cloneSnapshot(payload) as PersistedImageGenerationRequestSnapshot;

const toPersistedConfigSnapshot = (payload: unknown): Record<string, unknown> =>
  cloneSnapshot(payload) as Record<string, unknown>;

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

const normalizeGeneratedImage = async (
  image: {
    binaryData?: Buffer;
    imageUrl?: string;
    mimeType?: string;
    revisedPrompt?: string | null;
  },
  index: number,
  signal: AbortSignal,
  maxBytes: number,
  downloadConfig: DownloadGeneratedImageConfig
) => {
  let buffer: Buffer | null = null;
  let mimeType: string | null = null;

  if (image.imageUrl) {
    const downloaded = await downloadGeneratedImage(image.imageUrl, downloadConfig, { signal });
    buffer = downloaded.buffer;
    mimeType = downloaded.mimeType;
  } else if (image.binaryData && image.mimeType) {
    buffer = image.binaryData;
    mimeType = image.mimeType;
  }

  if (!buffer || !mimeType) {
    return null;
  }

  assertGeneratedImageSize(buffer, maxBytes);

  return {
    buffer,
    mimeType,
    revisedPrompt: image.revisedPrompt ?? null,
    index,
  };
};

type NormalizedGeneratedImageEntry = {
  buffer: Buffer;
  provider: ImageProviderId;
  model: string;
  mimeType: string;
  revisedPrompt: string | null;
  index: number;
};

const collectNormalizedImages = (
  settledResults: Array<PromiseSettledResult<Awaited<ReturnType<typeof normalizeGeneratedImage>>>>,
  meta: {
    provider: ImageProviderId;
    providerModel: string;
    conversationId: string | null;
    turnId: string | null;
    runId: string | null;
  },
  logger: FastifyBaseLogger
) => {
  const normalizedImages: NormalizedGeneratedImageEntry[] = [];
  let normalizationFailureCount = 0;
  let firstNormalizationError: unknown = null;

  for (const [settledIndex, result] of settledResults.entries()) {
    if (result.status === "fulfilled") {
      if (result.value) {
        normalizedImages.push({
          buffer: result.value.buffer,
          provider: meta.provider,
          model: meta.providerModel,
          mimeType: result.value.mimeType,
          revisedPrompt: result.value.revisedPrompt,
          index: result.value.index,
        });
      }
      continue;
    }

    normalizationFailureCount += 1;
    firstNormalizationError ??= result.reason;
    logger.warn(
      {
        err: result.reason,
        imageIndex: settledIndex,
        conversationId: meta.conversationId,
        turnId: meta.turnId,
        runId: meta.runId,
      },
      "Generated image result could not be normalized."
    );
  }

  return { normalizedImages, normalizationFailureCount, firstNormalizationError };
};

const handleExecutionFailure = async (
  error: unknown,
  cleanup: {
    signal: AbortSignal;
    persistedGeneration: PersistedGenerationContext | null;
    repository: ChatStateRepository;
    assetService: AssetService;
    userId: string;
    generationAssetsCommitted: boolean;
    createdAssetEdgeIds: string[];
    createdGeneratedAssetIds: string[];
    logger: FastifyBaseLogger;
  }
): Promise<ImageGenerationCommandError> => {
  const {
    signal,
    persistedGeneration,
    repository,
    assetService,
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
};

type PromptResolution = {
  routeTargets: ResolvedRouteTarget[];
  selectedTarget: ResolvedRouteTarget;
  requestedTargetSnapshot: PersistedRunTargetSnapshot;
  exactRetryPrompt: PersistedPromptSnapshot | null;
  nextPromptState: PersistedConversationCreativeState | null;
  promptIR: ReturnType<typeof buildPromptIR> | null;
  rewriteWarning: string | null;
  rewriteTarget: PersistedRunTargetSnapshot;
  rewritePromptSnapshot: PersistedPromptSnapshot | null;
  rewritePromptVersion: PromptVersionRecord | null;
  compilePromptVersions: PromptVersionRecord[];
  compiledTargetCache: Map<string, ReturnType<typeof compilePromptForTarget>>;
  initialPromptSnapshot: PersistedPromptSnapshot;
};

const resolveExactRetryPrompts = (input: {
  exactRetrySourceRun: PersistedRunRecord;
  routeTargets: ResolvedRouteTarget[];
  effectivePayload: ParsedImageGenerationRequest;
  rewriteModel: string;
}): PromptResolution => {
  const { exactRetrySourceRun, routeTargets, effectivePayload } = input;
  const retryRun = exactRetrySourceRun;
  if (!retryRun.prompt) {
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

  const exactRetryPrompt: PersistedPromptSnapshot = {
    ...retryRun.prompt,
    providerEffectivePrompt: null,
  };
  const rewriteWarning = "Exact retry reused prior compiler artifacts.";

  return {
    routeTargets: [exactTarget],
    selectedTarget: exactTarget,
    requestedTargetSnapshot: createResolvedTargetSnapshot(exactTarget, true),
    exactRetryPrompt,
    nextPromptState: null,
    promptIR: null,
    rewriteWarning,
    rewriteTarget: createRewriteTargetSnapshot("exact-retry", true),
    rewritePromptSnapshot: toPromptSnapshot({
      originalPrompt: effectivePayload.prompt,
      compiledPrompt: exactRetryPrompt.compiledPrompt,
      dispatchedPrompt: exactRetryPrompt.dispatchedPrompt,
      semanticLosses: exactRetryPrompt.semanticLosses,
      warnings: uniqueWarnings([rewriteWarning]),
    }),
    rewritePromptVersion: null,
    compilePromptVersions: [],
    compiledTargetCache: new Map(),
    initialPromptSnapshot: exactRetryPrompt,
  };
};

const resolveNewPrompts = async (input: {
  effectivePayload: ParsedImageGenerationRequest;
  conversation: { id: string; promptState: PersistedConversationCreativeState };
  routeTargets: ResolvedRouteTarget[];
  frontendModel: NonNullable<ReturnType<typeof getFrontendImageModelById>>;
  rewriteModel: string;
  promptContext: ReturnType<typeof createPromptCompilationContext>;
  persistedRequestSnapshot: PersistedImageGenerationRequestSnapshot;
  config: AppConfig;
  signal: AbortSignal;
  logger: FastifyBaseLogger;
  ids: { rewriteRunId: string; imageRunId: string; turnId: string; traceId: string };
  createdAt: string;
}): Promise<PromptResolution> => {
  const {
    effectivePayload, conversation, routeTargets, frontendModel,
    rewriteModel, promptContext, persistedRequestSnapshot,
    config, signal, logger, ids, createdAt,
  } = input;

  const rewriteResult = await rewriteTurn(
    effectivePayload,
    conversation.promptState,
    config,
    { signal }
  );
  const rewriteWarning = rewriteResult.warning;
  const rewriteTarget = createRewriteTargetSnapshot(rewriteModel, rewriteResult.degraded);
  const nextPromptState = applyTurnDelta(conversation.promptState, rewriteResult.turnDelta, ids.turnId);
  const promptIR = buildPromptIR(effectivePayload, nextPromptState);
  const selectedTarget = routeTargets[0] as ResolvedRouteTarget;
  const requestedTargetSnapshot = createRunTargetSnapshot({
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
  const rewritePromptSnapshot = toPromptSnapshot({
    originalPrompt: effectivePayload.prompt,
    compiledPrompt: rewriteResult.turnDelta.prompt,
    dispatchedPrompt: null,
    warnings: uniqueWarnings([rewriteWarning]),
  });
  const rewritePromptVersion = buildPromptVersionRecord({
    runId: ids.rewriteRunId,
    turnId: ids.turnId,
    traceId: ids.traceId,
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
  const compiledTargetCache = new Map<string, ReturnType<typeof compilePromptForTarget>>();
  const compilePromptVersions = routeTargets.map((target, index) => {
    const compiled = compilePromptForTarget(
      effectivePayload,
      promptIR,
      nextPromptState,
      target,
      promptContext
    );
    compiledTargetCache.set(compiled.targetKey, compiled);
    return buildPromptVersionRecord({
      runId: ids.imageRunId,
      turnId: ids.turnId,
      traceId: ids.traceId,
      version: index + 1,
      stage: "compile",
      targetKey: compiled.targetKey,
      compilerVersion: promptContext.compilerVersion,
      capabilityVersion: promptContext.capabilityVersion,
      originalPrompt: effectivePayload.prompt,
      promptIntent: persistedRequestSnapshot.promptIntent ?? null,
      committedStateBefore: conversation.promptState.committed,
      candidateStateAfter: nextPromptState.candidate ?? null,
      promptIR,
      compiledPrompt: compiled.compiledPrompt,
      dispatchedPrompt: compiled.dispatchedPrompt,
      semanticLosses: compiled.semanticLosses,
      warnings: compiled.warnings,
      hashes: {
        ...createPromptHashes({
          committedStateBefore: conversation.promptState.committed,
          candidateStateAfter: nextPromptState.candidate ?? null,
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
  const initialPromptSnapshot = toPromptSnapshot({
    originalPrompt: effectivePayload.prompt,
    compiledPrompt: selectedCompile.compiledPrompt ?? effectivePayload.prompt,
    dispatchedPrompt: selectedCompile.dispatchedPrompt,
    semanticLosses: selectedCompile.semanticLosses,
    warnings: uniqueWarnings([rewriteWarning, ...selectedCompile.warnings]),
  });

  return {
    routeTargets,
    selectedTarget,
    requestedTargetSnapshot,
    exactRetryPrompt: null,
    nextPromptState,
    promptIR,
    rewriteWarning,
    rewriteTarget,
    rewritePromptSnapshot,
    rewritePromptVersion,
    compilePromptVersions,
    compiledTargetCache,
    initialPromptSnapshot,
  };
};

type DispatchContext = {
  effectiveRetryMode: "exact" | "recompile";
  exactRetryPrompt: PersistedPromptSnapshot | null;
  effectivePayload: ParsedImageGenerationRequest;
  promptIR: ReturnType<typeof buildPromptIR> | null;
  nextPromptState: PersistedConversationCreativeState | null;
  promptContext: ReturnType<typeof createPromptCompilationContext>;
  rewriteWarning: string | null;
  persistedRequestSnapshot: PersistedImageGenerationRequestSnapshot;
  compilePromptVersionCount: number;
  compiledTargetCache: Map<string, ReturnType<typeof compilePromptForTarget>>;
  conversationPromptState: PersistedConversationCreativeState;
  ids: { imageRunId: string; turnId: string; traceId: string };
  repository: ChatStateRepository;
  assetService: AssetService;
  userId: string;
  conversationId: string;
};

type DispatchState = {
  attempt: number;
  finalPromptSnapshot: PersistedPromptSnapshot;
  finalWarnings: string[];
  finalNegativePrompt: string | undefined;
};

type DispatchedRequest = ParsedImageGenerationRequest & {
  resolvedInputAssets?: ResolvedProviderInputAsset[];
};

const resolveDispatchRequest = async (
  target: ResolvedRouteTarget,
  ctx: DispatchContext,
  state: DispatchState,
  routingRequest: ParsedImageGenerationRequest
): Promise<DispatchedRequest> => {
  state.attempt += 1;
  const { ids, promptContext, persistedRequestSnapshot, repository, assetService, userId } = ctx;

  if (ctx.effectiveRetryMode === "exact" && ctx.exactRetryPrompt) {
    const exactRetryNegativePrompt = resolveExactRetryNegativePrompt({
      negativePrompt: ctx.effectivePayload.negativePrompt,
      semanticLosses: ctx.exactRetryPrompt.semanticLosses,
    });
    const dispatchedPrompt =
      ctx.exactRetryPrompt.dispatchedPrompt ?? ctx.exactRetryPrompt.compiledPrompt;
    await repository.createPromptVersions({
      conversationId: ctx.conversationId,
      versions: [
        buildPromptVersionRecord({
          runId: ids.imageRunId,
          turnId: ids.turnId,
          traceId: ids.traceId,
          version: ctx.compilePromptVersionCount + state.attempt,
          stage: "dispatch",
          targetKey: `${target.provider.id}:${target.deployment.providerModel}`,
          attempt: state.attempt,
          compilerVersion: promptContext.compilerVersion,
          capabilityVersion: promptContext.capabilityVersion,
          originalPrompt: ctx.effectivePayload.prompt,
          promptIntent: persistedRequestSnapshot.promptIntent ?? null,
          committedStateBefore: null,
          candidateStateAfter: null,
          compiledPrompt: ctx.exactRetryPrompt.compiledPrompt,
          dispatchedPrompt,
          semanticLosses: ctx.exactRetryPrompt.semanticLosses,
          warnings: uniqueWarnings([
            ctx.rewriteWarning,
            ...ctx.exactRetryPrompt.warnings,
          ]),
          hashes: createPromptHashes({
            committedStateBefore: null,
            candidateStateAfter: null,
            promptIR: null,
            prefix: ctx.exactRetryPrompt.compiledPrompt,
            payload: {
              prompt: dispatchedPrompt,
              negativePrompt: exactRetryNegativePrompt,
              targetKey: `${target.provider.id}:${target.deployment.providerModel}`,
            },
          }),
          createdAt: new Date().toISOString(),
        }),
      ],
    });

    state.finalPromptSnapshot = toPromptSnapshot({
      originalPrompt: ctx.effectivePayload.prompt,
      compiledPrompt: ctx.exactRetryPrompt.compiledPrompt,
      dispatchedPrompt,
      semanticLosses: ctx.exactRetryPrompt.semanticLosses,
      warnings: uniqueWarnings([
        ctx.rewriteWarning,
        ...ctx.exactRetryPrompt.warnings,
      ]),
    });
    state.finalWarnings = [...state.finalPromptSnapshot.warnings];
    state.finalNegativePrompt = exactRetryNegativePrompt;
    return {
      ...routingRequest,
      requestedTarget: {
        deploymentId: target.deployment.id,
        provider: target.provider.id,
      },
      resolvedInputAssets: await assetService.resolveProviderInputAssets(
        userId,
        resolveExactRetryInputAssets(ctx.effectivePayload)
      ),
      prompt: dispatchedPrompt,
      negativePrompt: exactRetryNegativePrompt,
    };
  }

  const targetKey = `${target.provider.id}:${target.deployment.providerModel}`;
  const compiled = ctx.compiledTargetCache.get(targetKey) ?? compilePromptForTarget(
    ctx.effectivePayload,
    ctx.promptIR as NonNullable<typeof ctx.promptIR>,
    ctx.nextPromptState as PersistedConversationCreativeState,
    target,
    promptContext
  );
  await repository.createPromptVersions({
    conversationId: ctx.conversationId,
    versions: [
      buildPromptVersionRecord({
        runId: ids.imageRunId,
        turnId: ids.turnId,
        traceId: ids.traceId,
        version: ctx.compilePromptVersionCount + state.attempt,
        stage: "dispatch",
        targetKey: compiled.targetKey,
        attempt: state.attempt,
        compilerVersion: promptContext.compilerVersion,
        capabilityVersion: promptContext.capabilityVersion,
        originalPrompt: ctx.effectivePayload.prompt,
        promptIntent: persistedRequestSnapshot.promptIntent ?? null,
        committedStateBefore: ctx.conversationPromptState.committed,
        candidateStateAfter: ctx.nextPromptState?.candidate ?? null,
        promptIR: ctx.promptIR,
        compiledPrompt: compiled.compiledPrompt,
        dispatchedPrompt: compiled.dispatchedPrompt,
        semanticLosses: compiled.semanticLosses,
        warnings: uniqueWarnings([ctx.rewriteWarning, ...compiled.warnings]),
        hashes: {
          ...createPromptHashes({
            committedStateBefore: ctx.conversationPromptState.committed,
            candidateStateAfter: ctx.nextPromptState?.candidate ?? null,
            promptIR: ctx.promptIR,
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

  state.finalPromptSnapshot = toPromptSnapshot({
    originalPrompt: ctx.effectivePayload.prompt,
    compiledPrompt: compiled.compiledPrompt,
    dispatchedPrompt: compiled.dispatchedPrompt,
    semanticLosses: compiled.semanticLosses,
    warnings: uniqueWarnings([ctx.rewriteWarning, ...compiled.warnings]),
  });
  state.finalWarnings = [...state.finalPromptSnapshot.warnings];
  state.finalNegativePrompt = compiled.negativePrompt ?? undefined;

  return {
    ...routingRequest,
    requestedTarget: {
      deploymentId: target.deployment.id,
      provider: target.provider.id,
    },
    resolvedInputAssets: await assetService.resolveProviderInputAssets(
      userId,
      resolveDispatchInputAssets(target, ctx.effectivePayload)
    ),
    prompt: compiled.dispatchedPrompt,
    negativePrompt: compiled.negativePrompt ?? undefined,
  };
};

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
  private readonly runtimeRouter;

  constructor(private readonly deps: ImageGenerationServiceDeps) {
    this.runtimeRouter = createImageRuntimeRouter(deps.config);
  }

  async execute(input: ExecuteImageGenerationCommandInput): Promise<ImageGenerationResponse> {
    const { repository, assetService, config } = this.deps;
    const { userId, payload, traceId, signal, logger } = input;

    let persistedGeneration: PersistedGenerationContext | null = null;
    const createdGeneratedAssetIds: string[] = [];
    let createdAssetEdgeIds: string[] = [];
    let generationAssetsCommitted = false;

    try {
        // ── Phase 1: Resolve conversation ──
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

        const requestedOperation = resolveRequestedOperation(effectivePayload.operation);
        const promptContext = createPromptCompilationContext(
          conversation.promptState,
          rewriteModel,
          requestedOperation,
          effectiveRetryMode
        );

        if (effectiveRetryMode !== "exact") {
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
        }

        // ── Phase 2: Prompt resolution ──
        const persistedRequestSnapshot = toPersistedRequestSnapshot(effectivePayload);
        const persistedConfigSnapshot = toPersistedConfigSnapshot(effectivePayload);
        const routingRequest = effectivePayload;
        const routeTargets = this.runtimeRouter.getRouteTargets(routingRequest);

        const prompts: PromptResolution =
          effectiveRetryMode === "exact" && payload.retryOfTurnId && exactRetrySourceRun
            ? resolveExactRetryPrompts({
                exactRetrySourceRun,
                routeTargets,
                effectivePayload,
                rewriteModel,
              })
            : await resolveNewPrompts({
                effectivePayload,
                conversation,
                routeTargets,
                frontendModel,
                rewriteModel,
                promptContext,
                persistedRequestSnapshot,
                config,
                signal,
                logger,
                ids: { rewriteRunId, imageRunId, turnId, traceId },
                createdAt,
              });

        const {
          selectedTarget, requestedTargetSnapshot, rewriteTarget,
          rewritePromptSnapshot, rewritePromptVersion, compilePromptVersions,
          initialPromptSnapshot, nextPromptState, rewriteWarning,
        } = prompts;

        // ── Phase 3: Persist pre-generation records ──
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
            effectivePayload.inputAssets?.map((inputAsset) => inputAsset.assetId) ?? [],
          primaryAssetIds: [],
          results: [],
        };

        const rewriteRun: PersistedRunRecord = {
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
            effectivePayload.inputAssets?.map((inputAsset) => inputAsset.assetId) ?? [],
          createdAt,
          completedAt: createdAt,
          telemetry: {
            traceId,
            providerRequestId: null,
            providerTaskId: null,
            latencyMs: null,
          },
        };

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
              effectivePayload.inputAssets?.map((inputAsset) => inputAsset.assetId) ?? [],
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
          additionalRuns: [rewriteRun],
          promptVersions: [
            ...(rewritePromptVersion ? [rewritePromptVersion] : []),
            ...compilePromptVersions,
          ],
        });

        // ── Phase 4: Provider dispatch ──
        const startedAt = Date.now();
        const dispatchState: DispatchState = {
          attempt: 0,
          finalPromptSnapshot: initialPromptSnapshot,
          finalWarnings: [...initialPromptSnapshot.warnings],
          finalNegativePrompt: undefined,
        };
        const dispatchCtx: DispatchContext = {
          effectiveRetryMode,
          exactRetryPrompt: prompts.exactRetryPrompt,
          effectivePayload,
          promptIR: prompts.promptIR,
          nextPromptState,
          promptContext,
          rewriteWarning,
          persistedRequestSnapshot,
          compilePromptVersionCount: compilePromptVersions.length,
          compiledTargetCache: prompts.compiledTargetCache,
          conversationPromptState: conversation.promptState,
          ids: { imageRunId, turnId, traceId },
          repository,
          assetService,
          userId,
          conversationId: conversation.id,
        };
        const generated = await this.runtimeRouter.generate(routingRequest, {
          signal,
          traceId,
          targets: prompts.routeTargets,
          resolveRequest: (target) =>
            resolveDispatchRequest(target, dispatchCtx, dispatchState, routingRequest),
        });

        // ── Phase 5: Image normalization ──
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

        // ── Phase 6: Asset persistence & response ──
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
        const assetEdges = (effectivePayload.inputAssets ?? []).flatMap((inputAsset) =>
          assets.map((asset) => ({
            id: createId("thread-edge"),
            sourceAssetId: inputAsset.assetId,
            targetAssetId: asset.id,
            edgeType: resolveEdgeType(inputAsset, effectivePayload.operation, completedPrompt),
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
              version: compilePromptVersions.length + dispatchState.attempt + 1,
              stage: "dispatch",
              targetKey: `${generated.runtimeProvider}:${generated.providerModel}`,
              attempt: dispatchState.attempt,
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
              promptIR: effectiveRetryMode === "exact" ? null : prompts.promptIR,
              compiledPrompt: completedPrompt.compiledPrompt,
              dispatchedPrompt: completedPrompt.dispatchedPrompt,
              providerEffectivePrompt: completedPrompt.providerEffectivePrompt,
              semanticLosses: completedPrompt.semanticLosses,
              warnings: dispatchState.finalWarnings,
              hashes: createPromptHashes({
                committedStateBefore:
                  effectiveRetryMode === "exact" ? null : conversation.promptState.committed,
                candidateStateAfter:
                  effectiveRetryMode === "exact"
                    ? null
                    : nextPromptState?.candidate ?? conversation.promptState.candidate,
                promptIR: effectiveRetryMode === "exact" ? null : prompts.promptIR,
                prefix: completedPrompt.compiledPrompt,
                payload: {
                  prompt: completedPrompt.dispatchedPrompt,
                  negativePrompt: dispatchState.finalNegativePrompt,
                  providerEffectivePrompt: completedPrompt.providerEffectivePrompt,
                  targetKey: `${generated.runtimeProvider}:${generated.providerModel}`,
                  attempt: dispatchState.attempt,
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
          results: assetizedImages.map((image, index) => ({
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
          assets,
          assetEdges,
          run: {
            status: "completed",
            prompt: completedPrompt,
            assetIds: assets.map((asset) => asset.id),
            referencedAssetIds:
              effectivePayload.inputAssets?.map((inputAsset) => inputAsset.assetId) ?? [],
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

        if (nextPromptState) {
          try {
            await repository.updateConversationPromptState({
              conversationId: conversation.id,
              promptState: nextPromptState,
              expectedRevision: conversation.promptState.revision,
              updatedAt: completedAt,
            });
          } catch (promptStateError) {
            logger.warn(
              { err: promptStateError, conversationId: conversation.id, turnId },
              "Prompt state update failed after successful generation; generation result is preserved."
            );
          }
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
      throw await handleExecutionFailure(error, {
        signal,
        persistedGeneration,
        repository,
        assetService,
        userId,
        generationAssetsCommitted,
        createdAssetEdgeIds,
        createdGeneratedAssetIds,
        logger,
      });
    }
  }
}
