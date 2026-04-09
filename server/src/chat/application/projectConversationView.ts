import type {
  ImageLabConversationView,
  ImageLabCreativeStateView,
  ImageLabPromptArtifactView,
  ImageLabPromptArtifactsView,
  ImageLabObservabilityView,
  ImageLabResultView,
  ImageLabTurnRequestView,
  ImageLabTurnView,
} from "../../../../shared/imageLabViews";
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_STYLE_IDS,
  type ImagePromptIntentInput,
} from "../../../../shared/imageGeneration";
import type {
  PersistedImageSession,
  PromptObservabilitySummaryResponse,
  TurnPromptArtifactsResponse,
} from "../persistence/models";

const FALLBACK_MODEL_ID = "seedream-v5";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];

const toPromptIntent = (value: unknown): ImagePromptIntentInput => {
  if (!isRecord(value)) {
    return {
      preserve: [],
      avoid: [],
      styleDirectives: [],
      continuityTargets: [],
      editOps: [],
    };
  }

  return {
    preserve: toStringArray(value.preserve),
    avoid: toStringArray(value.avoid),
    styleDirectives: toStringArray(value.styleDirectives),
    continuityTargets: Array.isArray(value.continuityTargets)
      ? value.continuityTargets.filter(
          (entry): entry is ImagePromptIntentInput["continuityTargets"][number] =>
            entry === "subject" ||
            entry === "style" ||
            entry === "composition" ||
            entry === "text"
        )
      : [],
    editOps: Array.isArray(value.editOps)
      ? value.editOps
          .filter(
            (entry): entry is ImagePromptIntentInput["editOps"][number] =>
              isRecord(entry) && typeof entry.op === "string" && typeof entry.target === "string"
          )
          .map((entry) => ({
            op: entry.op,
            target: entry.target,
            ...(typeof entry.value === "string" ? { value: entry.value } : {}),
          }))
      : [],
  };
};

const toOperation = (value: unknown): ImageLabTurnRequestView["operation"] =>
  value === "edit" || value === "variation" ? value : "generate";

const toInputAssets = (value: unknown): ImageLabTurnRequestView["inputAssets"] | undefined =>
  Array.isArray(value)
    ? value.reduce<ImageLabTurnRequestView["inputAssets"]>((next, entry) => {
        if (
          !isRecord(entry) ||
          typeof entry.assetId !== "string" ||
          (entry.binding !== "guide" && entry.binding !== "source")
        ) {
          return next;
        }

        next.push({
          assetId: entry.assetId,
          binding: entry.binding,
          ...(entry.binding === "guide" &&
          (entry.guideType === "style" ||
            entry.guideType === "content" ||
            entry.guideType === "controlnet")
            ? { guideType: entry.guideType }
            : {}),
          ...(typeof entry.weight === "number" ? { weight: entry.weight } : {}),
        });
        return next;
      }, [])
    : undefined;

const toModelParams = (value: unknown): ImageLabTurnRequestView["modelParams"] => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<ImageLabTurnRequestView["modelParams"]>(
    (next, [key, entry]) => {
      if (
        typeof entry === "string" ||
        typeof entry === "number" ||
        typeof entry === "boolean" ||
        entry === null
      ) {
        next[key] = entry;
      }
      return next;
    },
    {}
  );
};

const toTurnRequestView = (snapshot: Record<string, unknown>): ImageLabTurnRequestView => ({
  operation: toOperation(snapshot.operation),
  inputAssets: (toInputAssets(snapshot.inputAssets) ?? []).map((entry) => ({ ...entry })),
  modelId:
    typeof snapshot.modelId === "string" && snapshot.modelId.trim().length > 0
      ? (snapshot.modelId as ImageLabTurnRequestView["modelId"])
      : (FALLBACK_MODEL_ID as ImageLabTurnRequestView["modelId"]),
  aspectRatio:
    typeof snapshot.aspectRatio === "string" &&
    (IMAGE_ASPECT_RATIOS as readonly string[]).includes(snapshot.aspectRatio)
      ? (snapshot.aspectRatio as ImageLabTurnRequestView["aspectRatio"])
      : "1:1",
  width: typeof snapshot.width === "number" ? snapshot.width : null,
  height: typeof snapshot.height === "number" ? snapshot.height : null,
  style:
    typeof snapshot.style === "string" && (IMAGE_STYLE_IDS as readonly string[]).includes(snapshot.style)
      ? (snapshot.style as ImageLabTurnRequestView["style"])
      : "none",
  stylePreset: typeof snapshot.stylePreset === "string" ? snapshot.stylePreset : "",
  negativePrompt: typeof snapshot.negativePrompt === "string" ? snapshot.negativePrompt : "",
  promptIntent: toPromptIntent(snapshot.promptIntent),
  seed: typeof snapshot.seed === "number" ? snapshot.seed : null,
  guidanceScale: typeof snapshot.guidanceScale === "number" ? snapshot.guidanceScale : null,
  steps: typeof snapshot.steps === "number" ? snapshot.steps : null,
  sampler: typeof snapshot.sampler === "string" ? snapshot.sampler : "",
  batchSize: typeof snapshot.batchSize === "number" ? snapshot.batchSize : 1,
  modelParams: toModelParams(snapshot.modelParams),
});

const toCreativeStateView = (state: ImageLabCreativeStateView): ImageLabCreativeStateView => ({
  prompt: state.prompt,
  preserve: [...state.preserve],
  avoid: [...state.avoid],
  styleDirectives: [...state.styleDirectives],
  continuityTargets: [...state.continuityTargets],
  editOps: state.editOps.map((entry) => ({ ...entry })),
  referenceAssetIds: [...state.referenceAssetIds],
});

export const projectConversationView = (
  session: PersistedImageSession
): ImageLabConversationView => ({
  conversationId: session.thread.id,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
  creativeBrief: {
    latestPrompt: session.thread.creativeBrief.latestPrompt,
    latestModelId: session.thread.creativeBrief.latestModelId,
    acceptedAssetId: session.thread.creativeBrief.acceptedAssetId,
    selectedAssetIds: [...session.thread.creativeBrief.selectedAssetIds],
    recentAssetRefIds: [...session.thread.creativeBrief.recentAssetRefIds],
  },
  promptState: {
    committed: toCreativeStateView(session.thread.promptState.committed),
    candidate: session.thread.promptState.candidate
      ? toCreativeStateView(session.thread.promptState.candidate)
      : null,
    baseAssetId: session.thread.promptState.baseAssetId,
    candidateTurnId: session.thread.promptState.candidateTurnId,
    revision: session.thread.promptState.revision,
  },
  turns: session.turns.map((turn) => {
    const relatedRuns = session.runs.filter((run) => run.turnId === turn.id);
    const latestRun = relatedRuns[0] ?? null;

    return {
      id: turn.id,
      prompt: turn.prompt,
      createdAt: turn.createdAt,
      retryOfTurnId: turn.retryOfTurnId,
      status: turn.status,
      error: turn.error,
      warnings: [...turn.warnings],
      request: toTurnRequestView(turn.configSnapshot),
      runtimeProvider: turn.runtimeProvider as ImageLabTurnView["runtimeProvider"],
      providerModel: turn.providerModel,
      runCount: relatedRuns.length,
      executedTargetLabel: latestRun?.executedTarget
        ? `${latestRun.executedTarget.runtimeProvider} / ${latestRun.executedTarget.providerModel}`
        : null,
      referencedAssetIds: [...turn.referencedAssetIds],
      primaryAssetIds: [...turn.primaryAssetIds],
      results: turn.results.map((result) => ({
        id: result.id,
        imageUrl: result.imageUrl,
        imageId: result.imageId,
        assetId: result.assetId,
        provider: result.runtimeProvider as ImageLabResultView["provider"],
        model: result.providerModel,
        ...(result.mimeType ? { mimeType: result.mimeType } : {}),
        ...(result.revisedPrompt !== undefined ? { revisedPrompt: result.revisedPrompt } : {}),
        index: result.index,
        saved: result.saved,
      })),
    };
  }),
});

export const projectPromptArtifactsView = (
  response: TurnPromptArtifactsResponse
): ImageLabPromptArtifactsView => ({
  turnId: response.turnId,
  versions: response.versions.map(
    (version): ImageLabPromptArtifactView => ({
      ...version,
      promptIntent: version.promptIntent
        ? {
            preserve: [...version.promptIntent.preserve],
            avoid: [...version.promptIntent.avoid],
            styleDirectives: [...version.promptIntent.styleDirectives],
            continuityTargets: [...version.promptIntent.continuityTargets],
            editOps: version.promptIntent.editOps.map((entry) => ({ ...entry })),
          }
        : null,
      turnDelta: version.turnDelta
        ? {
            prompt: version.turnDelta.prompt,
            preserve: [...version.turnDelta.preserve],
            avoid: [...version.turnDelta.avoid],
            styleDirectives: [...version.turnDelta.styleDirectives],
            continuityTargets: [...version.turnDelta.continuityTargets],
            editOps: version.turnDelta.editOps.map((entry) => ({ ...entry })),
            referenceAssetIds: [...version.turnDelta.referenceAssetIds],
          }
        : null,
      committedStateBefore: version.committedStateBefore
        ? toCreativeStateView(version.committedStateBefore)
        : null,
      candidateStateAfter: version.candidateStateAfter
        ? toCreativeStateView(version.candidateStateAfter)
        : null,
      promptIR: version.promptIR
        ? {
            ...version.promptIR,
            preserve: [...version.promptIR.preserve],
            negativeConstraints: [...version.promptIR.negativeConstraints],
            styleDirectives: [...version.promptIR.styleDirectives],
            continuityTargets: [...version.promptIR.continuityTargets],
            editOps: version.promptIR.editOps.map((entry) => ({ ...entry })),
            sourceAssets: version.promptIR.sourceAssets.map((entry) => ({ ...entry })),
            referenceAssets: version.promptIR.referenceAssets.map((entry) => ({ ...entry })),
            inputAssets: version.promptIR.inputAssets.map((entry) => ({ ...entry })),
            output: { ...version.promptIR.output },
          }
        : null,
      semanticLosses: version.semanticLosses.map((entry) => ({ ...entry })),
      warnings: [...version.warnings],
      hashes: { ...version.hashes },
    })
  ),
});

export const projectObservabilityView = (
  response: PromptObservabilitySummaryResponse
): ImageLabObservabilityView => ({
  conversationId: response.conversationId,
  overview: { ...response.overview },
  semanticLosses: response.semanticLosses.map((entry) => ({ ...entry })),
  targets: response.targets.map((entry) => ({ ...entry })),
  turns: response.turns.map((entry) => ({
    ...entry,
    semanticLossCodes: [...entry.semanticLossCodes],
  })),
});
