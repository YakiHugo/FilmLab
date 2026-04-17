import type {
  PersistedAssetEdgeType,
  PersistedImageGenerationRequestSnapshot,
  PersistedPromptSnapshot,
  PersistedRunRecord,
  PersistedRunTargetSnapshot,
  GenerationJobSnapshot,
} from "../../persistence/models";
import type { ResolvedRouteTarget } from "../../../gateway/router/types";
import type { ImageInputAssetBinding } from "../../../../../shared/imageGeneration";
import { ProviderError } from "../../../providers/base/errors";
import {
  imageGenerationRequestSchema,
  type ParsedImageGenerationRequest,
} from "../../../shared/imageGenerationSchema";

export const cloneSnapshot = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const uniqueWarnings = (warnings: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      warnings.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    )
  );

export const formatNormalizationWarning = (count: number) =>
  `${count} generated image${count === 1 ? "" : "s"} could not be processed and ${
    count === 1 ? "was" : "were"
  } omitted.`;

export const createRunTargetSnapshot = (input: PersistedRunTargetSnapshot): PersistedRunTargetSnapshot => ({
  modelId: input.modelId,
  logicalModel: input.logicalModel,
  deploymentId: input.deploymentId,
  runtimeProvider: input.runtimeProvider,
  providerModel: input.providerModel,
  pinned: input.pinned,
});

export const createResolvedTargetSnapshot = (
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

export const createRewriteTargetSnapshot = (
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

export const resolveEdgeType = (
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

export const toPersistedRequestSnapshot = (
  payload: unknown
): PersistedImageGenerationRequestSnapshot =>
  cloneSnapshot(payload) as PersistedImageGenerationRequestSnapshot;

export const toPersistedConfigSnapshot = (payload: unknown): Record<string, unknown> =>
  cloneSnapshot(payload) as Record<string, unknown>;

export const assertGeneratedImageSize = (buffer: Buffer, maxBytes: number) => {
  if (buffer.byteLength > maxBytes) {
    throw new ProviderError("Generated image is too large to persist.", 413);
  }
};

export const settleWithConcurrency = async <T, R>(
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

export const findRetryRun = (
  runs: PersistedRunRecord[],
  turnId: string
): PersistedRunRecord | null =>
  runs.find(
    (run) =>
      run.turnId === turnId &&
      IMAGE_GENERATION_RUN_OPERATIONS.has(run.operation) &&
      run.prompt
  ) ?? null;

export const findRetryJob = (
  jobs: GenerationJobSnapshot[],
  run: PersistedRunRecord
): GenerationJobSnapshot | null =>
  jobs.find((job) =>
    run.jobId ? job.id === run.jobId : job.turnId === run.turnId
  ) ?? null;

export const toExactRetryPayload = (input: {
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

export const findMatchingExactTarget = (
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
