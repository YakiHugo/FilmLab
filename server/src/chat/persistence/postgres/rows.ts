import {
  cloneConversationCreativeState,
  createInitialConversationCreativeState,
} from "../../../domain/prompt";
import type {
  GenerationJobSnapshot,
  PersistedAssetEdgeRecord,
  PersistedAssetLocatorRecord,
  PersistedAssetRecord,
  PersistedConversationCreativeState,
  PersistedGenerationTurn,
  PersistedPromptArtifactRecord,
  PersistedResultItem,
  PersistedRunRecord,
} from "../models";
import type { ChatConversationRecord } from "../types";

export interface ChatTurnRow {
  id: string;
  prompt: string;
  created_at: string;
  retry_of_turn_id: string | null;
  model_id: string;
  logical_model: string;
  deployment_id: string;
  runtime_provider: string;
  provider_model: string;
  config_snapshot: Record<string, unknown>;
  status: PersistedGenerationTurn["status"];
  error: string | null;
  warnings: unknown;
  job_id: string | null;
}

export interface ChatJobRow {
  id: string;
  turn_id: string;
  run_id: string | null;
  model_id: string;
  logical_model: string;
  deployment_id: string;
  runtime_provider: string;
  provider_model: string;
  compiled_prompt: string;
  request_snapshot: Record<string, unknown>;
  status: GenerationJobSnapshot["status"];
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ChatResultRow {
  id: string;
  turn_id: string;
  image_url: string;
  image_id: string | null;
  asset_id: string | null;
  runtime_provider: string;
  provider_model: string;
  mime_type: string | null;
  revised_prompt: string | null;
  image_index: number;
}

export interface ChatRunRow {
  id: string;
  turn_id: string;
  job_id: string | null;
  operation: PersistedRunRecord["operation"];
  status: PersistedRunRecord["status"];
  requested_target: PersistedRunRecord["requestedTarget"] | null;
  selected_target: PersistedRunRecord["selectedTarget"] | null;
  executed_target: PersistedRunRecord["executedTarget"] | null;
  prompt_snapshot: PersistedRunRecord["prompt"] | null;
  error: string | null;
  warnings: unknown;
  asset_ids: unknown;
  referenced_asset_ids: unknown;
  telemetry: PersistedRunRecord["telemetry"] | null;
  created_at: string;
  completed_at: string | null;
}

export interface ChatAssetRow {
  id: string;
  turn_id: string | null;
  run_id: string | null;
  asset_type: PersistedAssetRecord["assetType"];
  label: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ChatAssetLocatorRow {
  id: string;
  asset_id: string;
  locator_type: PersistedAssetLocatorRecord["locatorType"];
  locator_value: string;
  mime_type: string | null;
  expires_at: string | null;
}

export interface ChatAssetEdgeRow {
  id: string;
  source_asset_id: string;
  target_asset_id: string;
  edge_type: PersistedAssetEdgeRecord["edgeType"];
  turn_id: string | null;
  run_id: string | null;
  created_at: string;
}

export interface ChatConversationRow {
  id: string;
  user_id: string;
  prompt_state: unknown;
  created_at: string;
  updated_at: string;
}

export interface ChatPromptArtifactRow {
  id: string;
  run_id: string;
  turn_id: string;
  trace_id: string | null;
  version: number;
  stage: PersistedPromptArtifactRecord["stage"];
  target_key: string | null;
  attempt: number | null;
  compiler_version: string;
  capability_version: string;
  original_prompt: string;
  prompt_intent: unknown;
  turn_delta: unknown;
  committed_state_before: unknown;
  candidate_state_after: unknown;
  prompt_ir: unknown;
  compiled_prompt: string | null;
  dispatched_prompt: string | null;
  provider_effective_prompt: string | null;
  semantic_losses: unknown;
  warnings: unknown;
  hashes: unknown;
  created_at: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === "string")
        : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const parseRunTarget = (value: unknown): PersistedRunRecord["requestedTarget"] => {
  if (!isRecord(value)) {
    return null;
  }

  return value as unknown as PersistedRunRecord["requestedTarget"];
};

export const parsePromptSnapshot = (value: unknown): PersistedRunRecord["prompt"] => {
  if (!isRecord(value)) {
    return null;
  }

  return value as unknown as PersistedRunRecord["prompt"];
};

export const parseTelemetry = (value: unknown): PersistedRunRecord["telemetry"] => {
  if (!isRecord(value)) {
    return {
      traceId: null,
      providerRequestId: null,
      providerTaskId: null,
      latencyMs: null,
    };
  }

  return {
    traceId: typeof value.traceId === "string" ? value.traceId : null,
    providerRequestId:
      typeof value.providerRequestId === "string" ? value.providerRequestId : null,
    providerTaskId: typeof value.providerTaskId === "string" ? value.providerTaskId : null,
    latencyMs: typeof value.latencyMs === "number" ? value.latencyMs : null,
  };
};

export const parsePromptEditOps = (
  value: unknown
): PersistedConversationCreativeState["committed"]["editOps"] =>
  Array.isArray(value)
    ? value
        .filter(
          (entry): entry is PersistedConversationCreativeState["committed"]["editOps"][number] =>
            isRecord(entry) &&
            typeof entry.op === "string" &&
            typeof entry.target === "string"
        )
        .map((entry) => ({
          op: entry.op,
          target: entry.target,
          ...(typeof entry.value === "string" ? { value: entry.value } : {}),
        }))
    : [];

export const parseContinuityTargets = (
  value: unknown
): PersistedConversationCreativeState["committed"]["continuityTargets"] =>
  parseStringArray(value).filter(
    (entry): entry is PersistedConversationCreativeState["committed"]["continuityTargets"][number] =>
      entry === "subject" ||
      entry === "style" ||
      entry === "composition" ||
      entry === "text"
  );

export const parseCreativeState = (
  value: unknown,
  fallback = createInitialConversationCreativeState().committed
): PersistedConversationCreativeState["committed"] => {
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    prompt: typeof value.prompt === "string" || value.prompt === null ? value.prompt : null,
    preserve: parseStringArray(value.preserve),
    avoid: parseStringArray(value.avoid),
    styleDirectives: parseStringArray(value.styleDirectives),
    continuityTargets: parseContinuityTargets(value.continuityTargets),
    editOps: parsePromptEditOps(value.editOps),
    referenceAssetIds: parseStringArray(value.referenceAssetIds),
  };
};

const parsePromptIntent = (value: unknown): PersistedPromptArtifactRecord["promptIntent"] => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    preserve: parseStringArray(value.preserve),
    avoid: parseStringArray(value.avoid),
    styleDirectives: parseStringArray(value.styleDirectives),
    continuityTargets: parseContinuityTargets(value.continuityTargets),
    editOps: parsePromptEditOps(value.editOps),
  };
};

const parseInputAssets = (
  value: unknown
): NonNullable<PersistedPromptArtifactRecord["promptIR"]>["inputAssets"] =>
  Array.isArray(value)
    ? value
        .filter(
          (
            entry
          ): entry is NonNullable<PersistedPromptArtifactRecord["promptIR"]>["inputAssets"][number] =>
            isRecord(entry) &&
            typeof entry.assetId === "string" &&
            (entry.binding === "guide" || entry.binding === "source")
        )
        .map((entry) => ({
          assetId: entry.assetId,
          binding: entry.binding,
          ...(entry.binding === "guide" &&
          (entry.guideType === "style" ||
            entry.guideType === "content" ||
            entry.guideType === "controlnet")
            ? { guideType: entry.guideType }
            : {}),
          ...(typeof entry.weight === "number" ? { weight: entry.weight } : {}),
        }))
    : [];

const parsePromptArtifactSemanticLosses = (
  value: unknown
): PersistedPromptArtifactRecord["semanticLosses"] =>
  Array.isArray(value)
    ? value
        .filter(
          (entry): entry is PersistedPromptArtifactRecord["semanticLosses"][number] =>
            isRecord(entry) &&
            typeof entry.code === "string" &&
            typeof entry.severity === "string" &&
            typeof entry.fieldPath === "string" &&
            typeof entry.degradeMode === "string" &&
            typeof entry.userMessage === "string"
        )
        .map((entry) => ({
          code: entry.code,
          severity: entry.severity,
          fieldPath: entry.fieldPath,
          degradeMode: entry.degradeMode,
          userMessage: entry.userMessage,
          ...(typeof entry.internalDetail === "string"
            ? { internalDetail: entry.internalDetail }
            : {}),
        }))
    : [];

const parsePromptArtifactHashes = (
  value: unknown
): PersistedPromptArtifactRecord["hashes"] => {
  if (!isRecord(value)) {
    return {
      stateHash: "",
      irHash: "",
      prefixHash: "",
      payloadHash: "",
    };
  }

  return {
    stateHash: typeof value.stateHash === "string" ? value.stateHash : "",
    irHash: typeof value.irHash === "string" ? value.irHash : "",
    prefixHash: typeof value.prefixHash === "string" ? value.prefixHash : "",
    payloadHash: typeof value.payloadHash === "string" ? value.payloadHash : "",
  };
};

const parsePromptArtifactTurnDelta = (
  value: unknown
): PersistedPromptArtifactRecord["turnDelta"] => {
  if (!isRecord(value) || typeof value.prompt !== "string") {
    return null;
  }

  return {
    prompt: value.prompt,
    preserve: parseStringArray(value.preserve),
    avoid: parseStringArray(value.avoid),
    styleDirectives: parseStringArray(value.styleDirectives),
    continuityTargets: parseContinuityTargets(value.continuityTargets),
    editOps: parsePromptEditOps(value.editOps),
    referenceAssetIds: parseStringArray(value.referenceAssetIds),
  };
};

const parsePromptArtifactPromptIR = (
  value: unknown
): PersistedPromptArtifactRecord["promptIR"] => {
  if (!isRecord(value) || typeof value.operation !== "string" || typeof value.goal !== "string") {
    return null;
  }

  const operation =
    value.operation === "image.generate" ||
    value.operation === "image.edit" ||
    value.operation === "image.variation"
      ? value.operation
      : null;
  if (!operation) {
    return null;
  }

  const output = isRecord(value.output) ? value.output : {};
  const sourceAssets = parseInputAssets(value.sourceAssets).filter(
    (entry) => entry.binding === "source"
  );
  const referenceAssets = parseInputAssets(value.referenceAssets).filter(
    (entry) => entry.binding === "guide"
  );
  const parsedInputAssets = parseInputAssets(value.inputAssets);
  const inputAssets =
    parsedInputAssets.length > 0
      ? parsedInputAssets
      : [...sourceAssets, ...referenceAssets];
  const normalizedSourceAssets = inputAssets.filter((entry) => entry.binding === "source");
  const normalizedReferenceAssets = inputAssets.filter((entry) => entry.binding === "guide");

  return {
    operation,
    goal: value.goal,
    preserve: parseStringArray(value.preserve),
    negativeConstraints: parseStringArray(value.negativeConstraints),
    styleDirectives: parseStringArray(value.styleDirectives),
    continuityTargets: parseContinuityTargets(value.continuityTargets),
    editOps: parsePromptEditOps(value.editOps),
    sourceAssets: normalizedSourceAssets,
    referenceAssets: normalizedReferenceAssets,
    inputAssets,
    output: {
      aspectRatio: typeof output.aspectRatio === "string" ? output.aspectRatio : "1:1",
      width: typeof output.width === "number" ? output.width : null,
      height: typeof output.height === "number" ? output.height : null,
      batchSize: typeof output.batchSize === "number" ? output.batchSize : 1,
      style: typeof output.style === "string" ? output.style : "none",
      stylePreset: typeof output.stylePreset === "string" ? output.stylePreset : null,
    },
  };
};

export const toPromptArtifactRecord = (
  row: ChatPromptArtifactRow
): PersistedPromptArtifactRecord => ({
  id: row.id,
  runId: row.run_id,
  turnId: row.turn_id,
  traceId: row.trace_id,
  version: row.version,
  stage: row.stage,
  targetKey: row.target_key,
  attempt: row.attempt,
  compilerVersion: row.compiler_version,
  capabilityVersion: row.capability_version,
  originalPrompt: row.original_prompt,
  promptIntent: parsePromptIntent(row.prompt_intent),
  turnDelta: parsePromptArtifactTurnDelta(row.turn_delta),
  committedStateBefore: row.committed_state_before
    ? parseCreativeState(row.committed_state_before)
    : null,
  candidateStateAfter: row.candidate_state_after
    ? parseCreativeState(row.candidate_state_after)
    : null,
  promptIR: parsePromptArtifactPromptIR(row.prompt_ir),
  compiledPrompt: row.compiled_prompt,
  dispatchedPrompt: row.dispatched_prompt,
  providerEffectivePrompt: row.provider_effective_prompt,
  semanticLosses: parsePromptArtifactSemanticLosses(row.semantic_losses),
  warnings: parseStringArray(row.warnings),
  hashes: parsePromptArtifactHashes(row.hashes),
  createdAt: new Date(row.created_at).toISOString(),
});

export const parsePromptState = (value: unknown): PersistedConversationCreativeState => {
  const fallback = createInitialConversationCreativeState();
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    committed: parseCreativeState(value.committed, fallback.committed),
    candidate:
      typeof value.candidate === "object" && value.candidate !== null
        ? parseCreativeState(value.candidate, fallback.committed)
        : null,
    baseAssetId: typeof value.baseAssetId === "string" ? value.baseAssetId : null,
    candidateTurnId:
      typeof value.candidateTurnId === "string" ? value.candidateTurnId : null,
    revision: typeof value.revision === "number" ? value.revision : 0,
  };
};

export const toConversationRecord = (row: ChatConversationRow): ChatConversationRecord => ({
  id: row.id,
  userId: row.user_id,
  promptState: parsePromptState(row.prompt_state),
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
});

export const clonePromptState = (promptState: PersistedConversationCreativeState) =>
  cloneConversationCreativeState(promptState);

export const mapResultRows = (rows: ChatResultRow[]) =>
  rows.reduce<Map<string, PersistedResultItem[]>>((map, row) => {
    const current = map.get(row.turn_id) ?? [];
    current.push({
      id: row.id,
      imageUrl: row.image_url,
      imageId: row.image_id,
      runtimeProvider: row.runtime_provider,
      providerModel: row.provider_model,
      mimeType: row.mime_type ?? undefined,
      revisedPrompt: row.revised_prompt,
      index: row.image_index,
      assetId: row.asset_id,
      saved: row.asset_id !== null,
    });
    map.set(row.turn_id, current);
    return map;
  }, new Map());

export const mapLocatorRows = (rows: ChatAssetLocatorRow[]) =>
  rows.reduce<Map<string, PersistedAssetLocatorRecord[]>>((map, row) => {
    const current = map.get(row.asset_id) ?? [];
    current.push({
      id: row.id,
      assetId: row.asset_id,
      locatorType: row.locator_type,
      locatorValue: row.locator_value,
      mimeType: row.mime_type ?? undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    });
    map.set(row.asset_id, current);
    return map;
  }, new Map());
