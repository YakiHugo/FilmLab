import type { Pool, PoolClient } from "pg";
import type {
  PersistedAssetEdgeRecord,
  PersistedAssetLocatorRecord,
  PersistedAssetRecord,
  PersistedConversationCreativeState,
  GenerationJobSnapshot,
  PersistedPromptArtifactRecord,
  PersistedGenerationTurn,
  PersistedImageSession,
  PersistedRunRecord,
  PersistedResultItem,
  TurnPromptArtifactsResponse,
} from "../../../../shared/chatImageTypes";
import {
  cloneConversationCreativeState,
  createInitialConversationCreativeState,
} from "../../gateway/prompt/types";
import type { PromptVersionRecord } from "../../gateway/prompt/types";
import {
  ChatConversationNotFoundError,
  ChatPromptStateConflictError,
} from "./types";
import type {
  AcceptConversationTurnInput,
  ChatConversationRecord,
  ChatStateRepository,
  CompleteChatGenerationFailureInput,
  CompleteChatGenerationSuccessInput,
  CreateChatRunInput,
  CreatePromptVersionsInput,
  CreateChatGenerationInput,
  CreateChatTurnInput,
  UpdateConversationPromptStateInput,
} from "./types";
import { hashGeneratedImageToken } from "../../shared/generatedImageCapability";

const MIGRATIONS = [
  {
    name: "001_chat_state_base",
    sql: `
      CREATE TABLE IF NOT EXISTS chat_schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS chat_conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_active_user_idx
        ON chat_conversations(user_id)
        WHERE is_active = TRUE;
      CREATE INDEX IF NOT EXISTS chat_conversations_user_updated_idx
        ON chat_conversations(user_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS chat_turns (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        retry_of_turn_id TEXT NULL,
        model_id TEXT NOT NULL,
        logical_model TEXT NOT NULL,
        deployment_id TEXT NOT NULL,
        runtime_provider TEXT NOT NULL,
        provider_model TEXT NOT NULL,
        config_snapshot JSONB NOT NULL,
        status TEXT NOT NULL,
        error TEXT NULL,
        warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
        job_id TEXT NULL
      );
      CREATE INDEX IF NOT EXISTS chat_turns_conversation_created_idx
        ON chat_turns(conversation_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS chat_jobs (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
        turn_id TEXT NOT NULL REFERENCES chat_turns(id) ON DELETE CASCADE,
        model_id TEXT NOT NULL,
        logical_model TEXT NOT NULL,
        deployment_id TEXT NOT NULL,
        runtime_provider TEXT NOT NULL,
        provider_model TEXT NOT NULL,
        compiled_prompt TEXT NOT NULL,
        request_snapshot JSONB NOT NULL,
        status TEXT NOT NULL,
        error TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS chat_jobs_turn_id_idx
        ON chat_jobs(turn_id);
      CREATE INDEX IF NOT EXISTS chat_jobs_conversation_created_idx
        ON chat_jobs(conversation_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS chat_attempts (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES chat_jobs(id) ON DELETE CASCADE,
        attempt_no INTEGER NOT NULL,
        status TEXT NOT NULL,
        error TEXT NULL,
        provider_request_id TEXT NULL,
        provider_task_id TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS chat_attempts_job_attempt_no_idx
        ON chat_attempts(job_id, attempt_no);

      CREATE TABLE IF NOT EXISTS chat_results (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
        turn_id TEXT NOT NULL REFERENCES chat_turns(id) ON DELETE CASCADE,
        job_id TEXT NOT NULL REFERENCES chat_jobs(id) ON DELETE CASCADE,
        image_index INTEGER NOT NULL,
        image_url TEXT NOT NULL,
        image_id TEXT NULL,
        runtime_provider TEXT NOT NULL,
        provider_model TEXT NOT NULL,
        mime_type TEXT NULL,
        revised_prompt TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS chat_results_turn_image_index_idx
        ON chat_results(turn_id, image_index);
    `,
  },
  {
    name: "002_chat_turns_soft_hide",
    sql: `
      ALTER TABLE chat_turns
      ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

      CREATE INDEX IF NOT EXISTS chat_turns_conversation_visible_created_idx
        ON chat_turns(conversation_id, created_at DESC)
        WHERE is_hidden = FALSE;
    `,
  },
  {
    name: "003_chat_runs_assets",
    sql: `
      CREATE TABLE IF NOT EXISTS chat_runs (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
        turn_id TEXT NOT NULL REFERENCES chat_turns(id) ON DELETE CASCADE,
        job_id TEXT NULL REFERENCES chat_jobs(id) ON DELETE SET NULL,
        operation TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_target JSONB NULL,
        selected_target JSONB NULL,
        executed_target JSONB NULL,
        prompt_snapshot JSONB NULL,
        error TEXT NULL,
        warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
        asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        referenced_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        telemetry JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chat_runs_conversation_created_idx
        ON chat_runs(conversation_id, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS chat_runs_job_id_idx
        ON chat_runs(job_id)
        WHERE job_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS chat_assets (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
        turn_id TEXT NULL REFERENCES chat_turns(id) ON DELETE SET NULL,
        run_id TEXT NULL REFERENCES chat_runs(id) ON DELETE SET NULL,
        asset_type TEXT NOT NULL,
        label TEXT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chat_assets_conversation_created_idx
        ON chat_assets(conversation_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS chat_assets_run_id_idx
        ON chat_assets(run_id);

      CREATE TABLE IF NOT EXISTS chat_asset_locators (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL REFERENCES chat_assets(id) ON DELETE CASCADE,
        locator_type TEXT NOT NULL,
        locator_value TEXT NOT NULL,
        mime_type TEXT NULL,
        expires_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chat_asset_locators_asset_idx
        ON chat_asset_locators(asset_id, created_at ASC);

      CREATE TABLE IF NOT EXISTS chat_asset_edges (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
        source_asset_id TEXT NOT NULL REFERENCES chat_assets(id) ON DELETE CASCADE,
        target_asset_id TEXT NOT NULL REFERENCES chat_assets(id) ON DELETE CASCADE,
        edge_type TEXT NOT NULL,
        turn_id TEXT NULL REFERENCES chat_turns(id) ON DELETE SET NULL,
        run_id TEXT NULL REFERENCES chat_runs(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chat_asset_edges_conversation_idx
        ON chat_asset_edges(conversation_id, created_at DESC);

      ALTER TABLE chat_jobs
      ADD COLUMN IF NOT EXISTS run_id TEXT NULL;

      ALTER TABLE chat_attempts
      ADD COLUMN IF NOT EXISTS run_id TEXT NULL;

      ALTER TABLE chat_results
      ADD COLUMN IF NOT EXISTS thread_asset_id TEXT NULL;
    `,
  },
  {
    name: "004_generated_images",
    sql: `
      CREATE TABLE IF NOT EXISTS generated_images (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
        turn_id TEXT NOT NULL REFERENCES chat_turns(id) ON DELETE CASCADE,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        blob_data BYTEA NOT NULL,
        visibility TEXT NOT NULL,
        private_token_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        deleted_at TIMESTAMPTZ NULL
      );
      CREATE INDEX IF NOT EXISTS generated_images_turn_idx
        ON generated_images(turn_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS generated_images_owner_idx
        ON generated_images(owner_user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS generated_images_active_lookup_idx
        ON generated_images(id, private_token_hash)
        WHERE deleted_at IS NULL;
    `,
  },
  {
    name: "005_prompt_compiler_state",
    sql: `
      ALTER TABLE chat_conversations
      ADD COLUMN IF NOT EXISTS prompt_state JSONB NOT NULL DEFAULT '{
        "committed": {
          "prompt": null,
          "preserve": [],
          "avoid": [],
          "styleDirectives": [],
          "continuityTargets": [],
          "editOps": [],
          "referenceAssetIds": []
        },
        "candidate": null,
        "baseAssetId": null,
        "candidateTurnId": null,
        "revision": 0
      }'::jsonb;

      CREATE TABLE IF NOT EXISTS chat_prompt_versions (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
        run_id TEXT NOT NULL REFERENCES chat_runs(id) ON DELETE CASCADE,
        turn_id TEXT NOT NULL REFERENCES chat_turns(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        stage TEXT NOT NULL,
        target_key TEXT NULL,
        attempt INTEGER NULL,
        compiler_version TEXT NOT NULL,
        capability_version TEXT NOT NULL,
        original_prompt TEXT NOT NULL,
        prompt_intent JSONB NULL,
        turn_delta JSONB NULL,
        committed_state_before JSONB NULL,
        candidate_state_after JSONB NULL,
        prompt_ir JSONB NULL,
        compiled_prompt TEXT NULL,
        dispatched_prompt TEXT NULL,
        provider_effective_prompt TEXT NULL,
        semantic_losses JSONB NOT NULL DEFAULT '[]'::jsonb,
        warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
        hashes JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chat_prompt_versions_run_idx
        ON chat_prompt_versions(run_id, version ASC, created_at ASC);
      CREATE INDEX IF NOT EXISTS chat_prompt_versions_conversation_idx
        ON chat_prompt_versions(conversation_id, created_at DESC);
    `,
  },
] as const;

interface ChatTurnRow {
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

interface ChatJobRow {
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

interface ChatResultRow {
  id: string;
  turn_id: string;
  image_url: string;
  image_id: string | null;
  thread_asset_id: string | null;
  runtime_provider: string;
  provider_model: string;
  mime_type: string | null;
  revised_prompt: string | null;
  image_index: number;
}

interface ChatRunRow {
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

interface ChatAssetRow {
  id: string;
  turn_id: string | null;
  run_id: string | null;
  asset_type: PersistedAssetRecord["assetType"];
  label: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface ChatAssetLocatorRow {
  id: string;
  asset_id: string;
  locator_type: PersistedAssetLocatorRecord["locatorType"];
  locator_value: string;
  mime_type: string | null;
  expires_at: string | null;
}

interface ChatAssetEdgeRow {
  id: string;
  source_asset_id: string;
  target_asset_id: string;
  edge_type: PersistedAssetEdgeRecord["edgeType"];
  turn_id: string | null;
  run_id: string | null;
  created_at: string;
}

interface ChatConversationRow {
  id: string;
  user_id: string;
  prompt_state: unknown;
  created_at: string;
  updated_at: string;
}

interface ChatPromptArtifactRow {
  id: string;
  run_id: string;
  turn_id: string;
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

const parseStringArray = (value: unknown): string[] => {
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

const parseRunTarget = (value: unknown): PersistedRunRecord["requestedTarget"] => {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as PersistedRunRecord["requestedTarget"];
};

const parsePromptSnapshot = (value: unknown): PersistedRunRecord["prompt"] => {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as PersistedRunRecord["prompt"];
};

const parseTelemetry = (value: unknown): PersistedRunRecord["telemetry"] => {
  if (typeof value !== "object" || value === null) {
    return {
      providerRequestId: null,
      providerTaskId: null,
      latencyMs: null,
    };
  }

  const telemetry = value as Record<string, unknown>;
  return {
    providerRequestId:
      typeof telemetry.providerRequestId === "string" ? telemetry.providerRequestId : null,
    providerTaskId: typeof telemetry.providerTaskId === "string" ? telemetry.providerTaskId : null,
    latencyMs: typeof telemetry.latencyMs === "number" ? telemetry.latencyMs : null,
  };
};

const parsePromptEditOps = (
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

const parseContinuityTargets = (
  value: unknown
): PersistedConversationCreativeState["committed"]["continuityTargets"] =>
  parseStringArray(value).filter(
    (entry): entry is PersistedConversationCreativeState["committed"]["continuityTargets"][number] =>
      entry === "subject" ||
      entry === "style" ||
      entry === "composition" ||
      entry === "text"
  );

const parseCreativeState = (
  value: unknown,
  fallback = createInitialConversationCreativeState().committed
): PersistedConversationCreativeState["committed"] => {
  if (!isRecord(value)) {
    return fallback;
  }

  const state = value as Partial<PersistedConversationCreativeState["committed"]>;
  return {
    prompt: typeof state.prompt === "string" || state.prompt === null ? state.prompt : null,
    preserve: parseStringArray(state.preserve),
    avoid: parseStringArray(state.avoid),
    styleDirectives: parseStringArray(state.styleDirectives),
    continuityTargets: parseContinuityTargets(state.continuityTargets),
    editOps: parsePromptEditOps(state.editOps),
    referenceAssetIds: parseStringArray(state.referenceAssetIds),
  };
};

const parsePromptIntent = (
  value: unknown
): PersistedPromptArtifactRecord["promptIntent"] => {
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

const parseAssetRefs = (
  value: unknown
): PersistedPromptArtifactRecord["promptIR"] extends infer T
  ? T extends { assetRefs: infer TAssetRefs }
    ? TAssetRefs
    : never
  : never =>
  Array.isArray(value)
    ? value
        .filter(
          (
            entry
          ): entry is NonNullable<PersistedPromptArtifactRecord["promptIR"]>["assetRefs"][number] =>
            isRecord(entry) &&
            typeof entry.assetId === "string" &&
            (entry.role === "reference" || entry.role === "edit" || entry.role === "variation")
        )
        .map((entry) => ({
          assetId: entry.assetId,
          role: entry.role,
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

  return {
    operation,
    goal: value.goal,
    preserve: parseStringArray(value.preserve),
    negativeConstraints: parseStringArray(value.negativeConstraints),
    styleDirectives: parseStringArray(value.styleDirectives),
    continuityTargets: parseContinuityTargets(value.continuityTargets),
    editOps: parsePromptEditOps(value.editOps),
    sourceAssets: parseAssetRefs(value.sourceAssets),
    referenceAssets: parseAssetRefs(value.referenceAssets),
    assetRefs: parseAssetRefs(value.assetRefs),
    referenceImages: Array.isArray(value.referenceImages)
      ? value.referenceImages
          .filter(
            (
              entry
            ): entry is NonNullable<PersistedPromptArtifactRecord["promptIR"]>["referenceImages"][number] =>
              isRecord(entry) &&
              typeof entry.id === "string" &&
              typeof entry.type === "string"
          )
          .map((entry) => ({
            id: entry.id,
            type: entry.type,
            ...(typeof entry.sourceAssetId === "string"
              ? { sourceAssetId: entry.sourceAssetId }
              : {}),
          }))
      : [],
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

const toPromptArtifactRecord = (
  row: ChatPromptArtifactRow
): PersistedPromptArtifactRecord => ({
  id: row.id,
  runId: row.run_id,
  turnId: row.turn_id,
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

const parsePromptState = (value: unknown): PersistedConversationCreativeState => {
  const fallback = createInitialConversationCreativeState();
  if (typeof value !== "object" || value === null) {
    return fallback;
  }

  const state = value as Partial<PersistedConversationCreativeState>;
  return {
    committed: parseCreativeState(state.committed, fallback.committed),
    candidate:
      typeof state.candidate === "object" && state.candidate !== null
        ? parseCreativeState(state.candidate, fallback.committed)
        : null,
    baseAssetId: typeof state.baseAssetId === "string" ? state.baseAssetId : null,
    candidateTurnId:
      typeof state.candidateTurnId === "string" ? state.candidateTurnId : null,
    revision: typeof state.revision === "number" ? state.revision : 0,
  };
};

export class PostgresChatStateRepository implements ChatStateRepository {
  private initPromise: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  async close() {
    await this.pool.end();
  }

  async getConversationById(userId: string, conversationId: string) {
    await this.ensureReady();
    const result = await this.pool.query<ChatConversationRow>(
      `
        SELECT id, user_id, prompt_state, created_at, updated_at
        FROM chat_conversations
        WHERE id = $1
          AND user_id = $2
        LIMIT 1;
      `,
      [conversationId, userId]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      userId: row.user_id,
      promptState: parsePromptState(row.prompt_state),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    } satisfies ChatConversationRecord;
  }

  async getOrCreateActiveConversation(userId: string) {
    await this.ensureReady();
    const existing = await this.pool.query<ChatConversationRow>(
      `
        SELECT id, user_id, prompt_state, created_at, updated_at
        FROM chat_conversations
        WHERE user_id = $1
          AND is_active = TRUE
        ORDER BY updated_at DESC
        LIMIT 1;
      `,
      [userId]
    );

    const row = existing.rows[0];
    if (row) {
      return {
        id: row.id,
        userId: row.user_id,
        promptState: parsePromptState(row.prompt_state),
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      } satisfies ChatConversationRecord;
    }

    const createdAt = new Date().toISOString();
    const conversationId = crypto.randomUUID();
    await this.pool.query(
      `
        INSERT INTO chat_conversations (
          id,
          user_id,
          is_active,
          prompt_state,
          created_at,
          updated_at
        )
        VALUES ($1, $2, TRUE, $3::jsonb, $4::timestamptz, $5::timestamptz);
      `,
      [conversationId, userId, JSON.stringify(createInitialConversationCreativeState()), createdAt, createdAt]
    );

    return {
      id: conversationId,
      userId,
      promptState: createInitialConversationCreativeState(),
      createdAt,
      updatedAt: createdAt,
    } satisfies ChatConversationRecord;
  }

  async getConversationSnapshot(userId: string, conversationId?: string) {
    await this.ensureReady();
    const conversation = conversationId
      ? await this.getConversationById(userId, conversationId)
      : await this.getOrCreateActiveConversation(userId);
    if (!conversation) {
      throw new ChatConversationNotFoundError(conversationId);
    }

    const [turnsResult, jobsResult, resultsResult, runsResult, assetsResult, locatorsResult, assetEdgesResult] =
      await Promise.all([
      this.pool.query<ChatTurnRow>(
        `
          SELECT
            id,
            prompt,
            created_at,
            retry_of_turn_id,
            model_id,
            logical_model,
            deployment_id,
            runtime_provider,
            provider_model,
            config_snapshot,
            status,
            error,
            warnings,
            job_id
          FROM chat_turns
          WHERE conversation_id = $1
            AND is_hidden = FALSE
          ORDER BY created_at DESC;
        `,
        [conversation.id]
      ),
      this.pool.query<ChatJobRow>(
        `
          SELECT
            id,
            turn_id,
            run_id,
            model_id,
            logical_model,
            deployment_id,
            runtime_provider,
            provider_model,
            compiled_prompt,
            request_snapshot,
            status,
            error,
            created_at,
            completed_at
          FROM chat_jobs
          WHERE conversation_id = $1
            AND turn_id IN (
              SELECT id
              FROM chat_turns
              WHERE conversation_id = $1
                AND is_hidden = FALSE
            )
          ORDER BY created_at DESC;
        `,
        [conversation.id]
      ),
      this.pool.query<ChatResultRow>(
        `
          SELECT
            id,
            turn_id,
            image_url,
            image_id,
            thread_asset_id,
            runtime_provider,
            provider_model,
            mime_type,
            revised_prompt,
            image_index
          FROM chat_results
          WHERE conversation_id = $1
            AND turn_id IN (
              SELECT id
              FROM chat_turns
              WHERE conversation_id = $1
                AND is_hidden = FALSE
            )
          ORDER BY turn_id ASC, image_index ASC;
        `,
        [conversation.id]
      ),
      this.pool.query<ChatRunRow>(
        `
          SELECT
            id,
            turn_id,
            job_id,
            operation,
            status,
            requested_target,
            selected_target,
            executed_target,
            prompt_snapshot,
            error,
            warnings,
            asset_ids,
            referenced_asset_ids,
            telemetry,
            created_at,
            completed_at
          FROM chat_runs
          WHERE conversation_id = $1
            AND turn_id IN (
              SELECT id
              FROM chat_turns
              WHERE conversation_id = $1
                AND is_hidden = FALSE
            )
          ORDER BY created_at DESC;
        `,
        [conversation.id]
      ),
      this.pool.query<ChatAssetRow>(
        `
          SELECT
            id,
            turn_id,
            run_id,
            asset_type,
            label,
            metadata,
            created_at
          FROM chat_assets
          WHERE conversation_id = $1
          ORDER BY created_at DESC;
        `,
        [conversation.id]
      ),
      this.pool.query<ChatAssetLocatorRow>(
        `
          SELECT
            id,
            asset_id,
            locator_type,
            locator_value,
            mime_type,
            expires_at
          FROM chat_asset_locators
          WHERE asset_id IN (
            SELECT id
            FROM chat_assets
            WHERE conversation_id = $1
          )
          ORDER BY asset_id ASC, created_at ASC;
        `,
        [conversation.id]
      ),
      this.pool.query<ChatAssetEdgeRow>(
        `
          SELECT
            id,
            source_asset_id,
            target_asset_id,
            edge_type,
            turn_id,
            run_id,
            created_at
          FROM chat_asset_edges
          WHERE conversation_id = $1
          ORDER BY created_at DESC;
        `,
        [conversation.id]
      ),
    ]);

    const resultsByTurnId = resultsResult.rows.reduce<Map<string, PersistedResultItem[]>>(
      (map, row) => {
        const current = map.get(row.turn_id) ?? [];
        current.push({
          id: row.id,
          imageUrl: row.image_url,
          imageId: row.image_id,
          threadAssetId: row.thread_asset_id,
          runtimeProvider: row.runtime_provider,
          providerModel: row.provider_model,
          mimeType: row.mime_type ?? undefined,
          revisedPrompt: row.revised_prompt,
          index: row.image_index,
          assetId: null,
          saved: false,
        });
        map.set(row.turn_id, current);
        return map;
      },
      new Map()
    );
    const locatorsByAssetId = locatorsResult.rows.reduce<Map<string, PersistedAssetLocatorRecord[]>>(
      (map, row) => {
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
      },
      new Map()
    );
    const turns = turnsResult.rows.map((row) => ({
      id: row.id,
      prompt: row.prompt,
      createdAt: new Date(row.created_at).toISOString(),
      retryOfTurnId: row.retry_of_turn_id,
      modelId: row.model_id as PersistedGenerationTurn["modelId"],
      logicalModel: row.logical_model as PersistedGenerationTurn["logicalModel"],
      deploymentId: row.deployment_id,
      runtimeProvider: row.runtime_provider,
      providerModel: row.provider_model,
      configSnapshot: row.config_snapshot,
      status: row.status,
      error: row.error,
      warnings: parseStringArray(row.warnings),
      jobId: row.job_id,
      runIds: runsResult.rows
        .filter((run) => run.turn_id === row.id)
        .map((run) => run.id),
      referencedAssetIds: runsResult.rows
        .filter((run) => run.turn_id === row.id)
        .flatMap((run) => parseStringArray(run.referenced_asset_ids)),
      primaryAssetIds: runsResult.rows
        .filter((run) => run.turn_id === row.id && run.operation === "image.generate")
        .flatMap((run) => parseStringArray(run.asset_ids)),
      results: resultsByTurnId.get(row.id) ?? [],
    }));
    const visibleTurnIds = new Set(turns.map((turn) => turn.id));
    const visibleRunIds = new Set(
      runsResult.rows.filter((run) => visibleTurnIds.has(run.turn_id)).map((run) => run.id)
    );
    const visibleAssetRows = assetsResult.rows.filter(
      (row) =>
        (row.turn_id ? visibleTurnIds.has(row.turn_id) : false) ||
        (row.run_id ? visibleRunIds.has(row.run_id) : false)
    );
    const assets = visibleAssetRows.map((row) => ({
      id: row.id,
      turnId: row.turn_id,
      runId: row.run_id,
      assetType: row.asset_type,
      label: row.label,
      metadata: row.metadata,
      locators: locatorsByAssetId.get(row.id) ?? [],
      createdAt: new Date(row.created_at).toISOString(),
    }));
    const assetIds = new Set(assets.map((asset) => asset.id));
    const assetEdges = assetEdgesResult.rows
      .filter((row) => assetIds.has(row.source_asset_id) && assetIds.has(row.target_asset_id))
      .map((row) => ({
        id: row.id,
        sourceAssetId: row.source_asset_id,
        targetAssetId: row.target_asset_id,
        edgeType: row.edge_type,
        turnId: row.turn_id,
        runId: row.run_id,
        createdAt: new Date(row.created_at).toISOString(),
      }));

    return {
      id: conversation.id,
      thread: {
        id: conversation.id,
        creativeBrief: this.buildCreativeBrief(turns, conversation.promptState),
        promptState: cloneConversationCreativeState(conversation.promptState),
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      turns,
      runs: runsResult.rows.map((row) => ({
        id: row.id,
        turnId: row.turn_id,
        jobId: row.job_id,
        operation: row.operation,
        status: row.status,
        requestedTarget: parseRunTarget(row.requested_target),
        selectedTarget: parseRunTarget(row.selected_target),
        executedTarget: parseRunTarget(row.executed_target),
        prompt: parsePromptSnapshot(row.prompt_snapshot),
        error: row.error,
        warnings: parseStringArray(row.warnings),
        assetIds: parseStringArray(row.asset_ids),
        referencedAssetIds: parseStringArray(row.referenced_asset_ids),
        createdAt: new Date(row.created_at).toISOString(),
        completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
        telemetry: parseTelemetry(row.telemetry),
      })),
      assets,
      assetEdges,
      jobs: jobsResult.rows.map((row) => ({
        id: row.id,
        turnId: row.turn_id,
        runId: row.run_id,
        modelId: row.model_id as GenerationJobSnapshot["modelId"],
        logicalModel: row.logical_model as GenerationJobSnapshot["logicalModel"],
        deploymentId: row.deployment_id,
        runtimeProvider: row.runtime_provider,
        providerModel: row.provider_model,
        compiledPrompt: row.compiled_prompt,
        requestSnapshot: row.request_snapshot as GenerationJobSnapshot["requestSnapshot"],
        status: row.status,
        error: row.error,
        createdAt: new Date(row.created_at).toISOString(),
        completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      })),
    } satisfies PersistedImageSession;
  }

  async getPromptArtifactsForTurn(
    userId: string,
    turnId: string
  ): Promise<TurnPromptArtifactsResponse | null> {
    await this.ensureReady();
    const turnResult = await this.pool.query<{
      conversation_id: string;
    }>(
      `
        SELECT t.conversation_id
        FROM chat_turns t
        INNER JOIN chat_conversations c
          ON c.id = t.conversation_id
        WHERE t.id = $1
          AND t.is_hidden = FALSE
          AND c.user_id = $2
        LIMIT 1;
      `,
      [turnId, userId]
    );
    const turnRow = turnResult.rows[0];
    if (!turnRow) {
      return null;
    }

    const versionsResult = await this.pool.query<ChatPromptArtifactRow>(
      `
        SELECT
          id,
          run_id,
          turn_id,
          version,
          stage,
          target_key,
          attempt,
          compiler_version,
          capability_version,
          original_prompt,
          prompt_intent,
          turn_delta,
          committed_state_before,
          candidate_state_after,
          prompt_ir,
          compiled_prompt,
          dispatched_prompt,
          provider_effective_prompt,
          semantic_losses,
          warnings,
          hashes,
          created_at
        FROM chat_prompt_versions
        WHERE conversation_id = $1
          AND turn_id = $2
        ORDER BY version ASC, created_at ASC;
      `,
      [turnRow.conversation_id, turnId]
    );

    return {
      turnId,
      versions: versionsResult.rows.map(toPromptArtifactRecord),
    };
  }

  async clearActiveConversation(userId: string) {
    await this.ensureReady();
    const createdAt = new Date().toISOString();
    const conversationId = crypto.randomUUID();

    await this.withTransaction(async (client) => {
      await client.query(
        `
          UPDATE chat_conversations
          SET is_active = FALSE,
              updated_at = $2::timestamptz
          WHERE user_id = $1
            AND is_active = TRUE;
        `,
        [userId, createdAt]
      );
      await client.query(
        `
          INSERT INTO chat_conversations (
            id,
            user_id,
            is_active,
            prompt_state,
            created_at,
            updated_at
          )
          VALUES ($1, $2, TRUE, $3::jsonb, $4::timestamptz, $5::timestamptz);
        `,
        [
          conversationId,
          userId,
          JSON.stringify(createInitialConversationCreativeState()),
          createdAt,
          createdAt,
        ]
      );
    });

    return {
      id: conversationId,
      thread: {
        id: conversationId,
        creativeBrief: this.buildCreativeBrief([], createInitialConversationCreativeState()),
        promptState: createInitialConversationCreativeState(),
        createdAt,
        updatedAt: createdAt,
      },
      turns: [],
      runs: [],
      assets: [],
      assetEdges: [],
      jobs: [],
      createdAt,
      updatedAt: createdAt,
    } satisfies PersistedImageSession;
  }

  async deleteTurn(userId: string, turnId: string) {
    await this.ensureReady();
    const row = await this.withTransaction(async (client) => {
      const result = await client.query<{ conversation_id: string }>(
        `
          UPDATE chat_turns
          SET is_hidden = TRUE,
              updated_at = NOW()
          WHERE id = $1
            AND is_hidden = FALSE
            AND conversation_id IN (
              SELECT id
              FROM chat_conversations
              WHERE user_id = $2
            )
          RETURNING conversation_id;
        `,
        [turnId, userId]
      );

      const updatedRow = result.rows[0] ?? null;
      if (!updatedRow) {
        return null;
      }

      await client.query(
        `
          UPDATE generated_images
          SET deleted_at = COALESCE(deleted_at, NOW())
          WHERE turn_id = $1
            AND conversation_id = $2;
        `,
        [turnId, updatedRow.conversation_id]
      );
      await this.touchConversation(updatedRow.conversation_id, undefined, client);
      return updatedRow;
    });

    if (!row) {
      return null;
    }

    return this.getConversationSnapshot(userId, row.conversation_id);
  }

  async getGeneratedImageByCapability(imageId: string, token: string) {
    await this.ensureReady();
    const result = await this.pool.query<{
      blob_data: Buffer;
      mime_type: string;
    }>(
      `
        SELECT blob_data, mime_type
        FROM generated_images
        WHERE id = $1
          AND private_token_hash = $2
          AND deleted_at IS NULL
        LIMIT 1;
      `,
      [imageId, hashGeneratedImageToken(token)]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      buffer: row.blob_data,
      mimeType: row.mime_type,
    };
  }

  async createGeneration(input: CreateChatGenerationInput) {
    await this.ensureReady();
    await this.withTransaction(async (client) => {
      await client.query(
        `
          INSERT INTO chat_turns (
            id,
            conversation_id,
            prompt,
            created_at,
            updated_at,
            retry_of_turn_id,
            model_id,
            logical_model,
            deployment_id,
            runtime_provider,
            provider_model,
            config_snapshot,
            status,
            error,
            warnings,
            job_id
          )
          VALUES (
            $1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7, $8, $9, $10, $11,
            $12::jsonb, $13, $14, $15::jsonb, $16
          )
          ON CONFLICT (id) DO NOTHING;
        `,
        [
          input.turn.id,
          input.conversationId,
          input.turn.prompt,
          input.turn.createdAt,
          input.turn.createdAt,
          input.turn.retryOfTurnId,
          input.turn.modelId,
          input.turn.logicalModel,
          input.turn.deploymentId,
          input.turn.runtimeProvider,
          input.turn.providerModel,
          JSON.stringify(input.turn.configSnapshot),
          input.turn.status,
          input.turn.error,
          JSON.stringify(input.turn.warnings),
          input.turn.jobId,
        ]
      );
      await client.query(
        `
          INSERT INTO chat_jobs (
            id,
            conversation_id,
            turn_id,
            run_id,
            model_id,
            logical_model,
            deployment_id,
            runtime_provider,
            provider_model,
            compiled_prompt,
            request_snapshot,
            status,
            error,
            created_at,
            completed_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13,
            $14::timestamptz, $15::timestamptz, $16::timestamptz
          );
        `,
        [
          input.job.id,
          input.conversationId,
          input.job.turnId,
          input.job.runId,
          input.job.modelId,
          input.job.logicalModel,
          input.job.deploymentId,
          input.job.runtimeProvider,
          input.job.providerModel,
          input.job.compiledPrompt,
          JSON.stringify(input.job.requestSnapshot),
          input.job.status,
          input.job.error,
          input.job.createdAt,
          input.job.completedAt,
          input.job.createdAt,
        ]
      );
      await client.query(
        `
          INSERT INTO chat_runs (
            id,
            conversation_id,
            turn_id,
            job_id,
            operation,
            status,
            requested_target,
            selected_target,
            executed_target,
            prompt_snapshot,
            error,
            warnings,
            asset_ids,
            referenced_asset_ids,
            telemetry,
            created_at,
            completed_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11,
            $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::timestamptz,
            $17::timestamptz, $18::timestamptz
          );
        `,
        [
          input.run.id,
          input.conversationId,
          input.run.turnId,
          input.run.jobId,
          input.run.operation,
          input.run.status,
          JSON.stringify(input.run.requestedTarget),
          JSON.stringify(input.run.selectedTarget),
          JSON.stringify(input.run.executedTarget),
          JSON.stringify(input.run.prompt),
          input.run.error,
          JSON.stringify(input.run.warnings),
          JSON.stringify(input.run.assetIds),
          JSON.stringify(input.run.referencedAssetIds),
          JSON.stringify(input.run.telemetry),
          input.run.createdAt,
          input.run.completedAt,
          input.run.createdAt,
        ]
      );
      await client.query(
        `
          INSERT INTO chat_attempts (
            id,
            job_id,
            run_id,
            attempt_no,
            status,
            error,
            provider_request_id,
            provider_task_id,
            created_at,
            completed_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11::timestamptz);
        `,
        [
          input.attempt.id,
          input.attempt.jobId,
          input.attempt.runId,
          input.attempt.attemptNo,
          input.attempt.status,
          input.attempt.error,
          input.attempt.providerRequestId,
          input.attempt.providerTaskId,
          input.attempt.createdAt,
          input.attempt.completedAt,
          input.attempt.updatedAt,
        ]
      );
      await this.touchConversation(input.conversationId, input.turn.createdAt, client);
    });
  }

  async createTurn(input: CreateChatTurnInput) {
    await this.ensureReady();
    await this.withTransaction(async (client) => {
      await client.query(
        `
          INSERT INTO chat_turns (
            id,
            conversation_id,
            prompt,
            created_at,
            updated_at,
            retry_of_turn_id,
            model_id,
            logical_model,
            deployment_id,
            runtime_provider,
            provider_model,
            config_snapshot,
            status,
            error,
            warnings,
            job_id
          )
          VALUES (
            $1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7, $8, $9, $10, $11,
            $12::jsonb, $13, $14, $15::jsonb, $16
          )
          ON CONFLICT (id) DO NOTHING;
        `,
        [
          input.turn.id,
          input.conversationId,
          input.turn.prompt,
          input.turn.createdAt,
          input.turn.createdAt,
          input.turn.retryOfTurnId,
          input.turn.modelId,
          input.turn.logicalModel,
          input.turn.deploymentId,
          input.turn.runtimeProvider,
          input.turn.providerModel,
          JSON.stringify(input.turn.configSnapshot),
          input.turn.status,
          input.turn.error,
          JSON.stringify(input.turn.warnings),
          input.turn.jobId,
        ]
      );
      await this.touchConversation(input.conversationId, input.turn.createdAt, client);
    });
  }

  async createRun(input: CreateChatRunInput) {
    await this.ensureReady();
    await this.withTransaction(async (client) => {
      await client.query(
        `
          INSERT INTO chat_runs (
            id,
            conversation_id,
            turn_id,
            job_id,
            operation,
            status,
            requested_target,
            selected_target,
            executed_target,
            prompt_snapshot,
            error,
            warnings,
            asset_ids,
            referenced_asset_ids,
            telemetry,
            created_at,
            completed_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11,
            $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::timestamptz,
            $17::timestamptz, $18::timestamptz
          );
        `,
        [
          input.run.id,
          input.conversationId,
          input.run.turnId,
          input.run.jobId,
          input.run.operation,
          input.run.status,
          JSON.stringify(input.run.requestedTarget),
          JSON.stringify(input.run.selectedTarget),
          JSON.stringify(input.run.executedTarget),
          JSON.stringify(input.run.prompt),
          input.run.error,
          JSON.stringify(input.run.warnings),
          JSON.stringify(input.run.assetIds),
          JSON.stringify(input.run.referencedAssetIds),
          JSON.stringify(input.run.telemetry),
          input.run.createdAt,
          input.run.completedAt,
          input.run.createdAt,
        ]
      );

      if (input.attempt) {
        await client.query(
          `
            INSERT INTO chat_attempts (
              id,
              job_id,
              run_id,
              attempt_no,
              status,
              error,
              provider_request_id,
              provider_task_id,
              created_at,
              completed_at,
              updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11::timestamptz
            );
          `,
          [
            input.attempt.id,
            input.attempt.jobId,
            input.attempt.runId,
            input.attempt.attemptNo,
            input.attempt.status,
            input.attempt.error,
            input.attempt.providerRequestId,
            input.attempt.providerTaskId,
            input.attempt.createdAt,
            input.attempt.completedAt,
            input.attempt.updatedAt,
          ]
        );
      }

      await this.touchConversation(input.conversationId, input.run.createdAt, client);
    });
  }

  async createPromptVersions(input: CreatePromptVersionsInput) {
    await this.ensureReady();
    await this.withTransaction(async (client) => {
      for (const version of input.versions) {
        await client.query(
          `
            INSERT INTO chat_prompt_versions (
              id,
              conversation_id,
              run_id,
              turn_id,
              version,
              stage,
              target_key,
              attempt,
              compiler_version,
              capability_version,
              original_prompt,
              prompt_intent,
              turn_delta,
              committed_state_before,
              candidate_state_after,
              prompt_ir,
              compiled_prompt,
              dispatched_prompt,
              provider_effective_prompt,
              semantic_losses,
              warnings,
              hashes,
              created_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb,
              $14::jsonb, $15::jsonb, $16::jsonb, $17, $18, $19, $20::jsonb, $21::jsonb,
              $22::jsonb, $23::timestamptz
            );
          `,
          [
            version.id,
            input.conversationId,
            version.runId,
            version.turnId,
            version.version,
            version.stage,
            version.targetKey,
            version.attempt,
            version.compilerVersion,
            version.capabilityVersion,
            version.originalPrompt,
            JSON.stringify(version.promptIntent),
            JSON.stringify(version.turnDelta),
            JSON.stringify(version.committedStateBefore),
            JSON.stringify(version.candidateStateAfter),
            JSON.stringify(version.promptIR),
            version.compiledPrompt,
            version.dispatchedPrompt,
            version.providerEffectivePrompt,
            JSON.stringify(version.semanticLosses),
            JSON.stringify(version.warnings),
            JSON.stringify(version.hashes),
            version.createdAt,
          ]
        );
      }
    });
  }

  async updateConversationPromptState(input: UpdateConversationPromptStateInput) {
    await this.ensureReady();
    const result = await this.pool.query(
      `
        UPDATE chat_conversations
        SET prompt_state = $2::jsonb,
            updated_at = $4::timestamptz
        WHERE id = $1
          AND COALESCE((prompt_state->>'revision')::integer, 0) = $3
        RETURNING id;
      `,
      [
        input.conversationId,
        JSON.stringify(input.promptState),
        input.expectedRevision,
        input.updatedAt,
      ]
    );

    if ((result.rowCount ?? 0) > 0) {
      return;
    }

    const exists = await this.pool.query(
      `
        SELECT 1
        FROM chat_conversations
        WHERE id = $1
        LIMIT 1;
      `,
      [input.conversationId]
    );
    if ((exists.rowCount ?? 0) === 0) {
      throw new ChatConversationNotFoundError(input.conversationId);
    }
    throw new ChatPromptStateConflictError(input.conversationId);
  }

  private async resolveAcceptedCreativeState(
    client: PoolClient,
    conversationId: string,
    startingTurnId: string
  ): Promise<PersistedConversationCreativeState["committed"] | null> {
    const visited = new Set<string>();
    let semanticTurnId: string | null = startingTurnId;

    while (semanticTurnId && !visited.has(semanticTurnId)) {
      visited.add(semanticTurnId);

      const versionResult = await client.query<{
        candidate_state_after: unknown;
      }>(
        `
          SELECT candidate_state_after
          FROM chat_prompt_versions
          WHERE conversation_id = $1
            AND turn_id = $2
            AND candidate_state_after IS NOT NULL
          ORDER BY
            CASE stage
              WHEN 'dispatch' THEN 2
              WHEN 'compile' THEN 1
              ELSE 0
            END DESC,
            COALESCE(attempt, 0) DESC,
            version DESC,
            created_at DESC
          LIMIT 1;
        `,
        [conversationId, semanticTurnId]
      );
      const versionRow = versionResult.rows[0];
      if (versionRow?.candidate_state_after) {
        return parseCreativeState(versionRow.candidate_state_after);
      }

      semanticTurnId =
        (
          await client.query<{ retry_of_turn_id: string | null }>(
            `
              SELECT retry_of_turn_id
              FROM chat_turns
              WHERE id = $1
                AND conversation_id = $2
              LIMIT 1;
            `,
            [semanticTurnId, conversationId]
          )
        ).rows[0]?.retry_of_turn_id ?? null;
    }

    return null;
  }

  async acceptConversationTurn(input: AcceptConversationTurnInput) {
    await this.ensureReady();
    const conversationId = await this.withTransaction(async (client) => {
      const turnResult = await client.query<{
        conversation_id: string;
        prompt_state: unknown;
        retry_of_turn_id: string | null;
      }>(
        `
          SELECT t.conversation_id, t.retry_of_turn_id, c.prompt_state
          FROM chat_turns t
          INNER JOIN chat_conversations c
            ON c.id = t.conversation_id
          WHERE t.id = $1
            AND c.user_id = $2
          LIMIT 1;
        `,
        [input.turnId, input.userId]
      );
      const turnRow = turnResult.rows[0];
      if (!turnRow) {
        throw new ChatConversationNotFoundError();
      }

      const assetResult = await client.query<{
        id: string;
        run_id: string | null;
      }>(
        `
          SELECT id, run_id
          FROM chat_assets
          WHERE id = $1
            AND conversation_id = $2
          LIMIT 1;
        `,
        [input.assetId, turnRow.conversation_id]
      );
      const assetRow = assetResult.rows[0];
      if (!assetRow) {
        throw new Error(
          `Asset ${input.assetId} was not found in conversation ${turnRow.conversation_id}.`
        );
      }

      const nextPromptState = parsePromptState(turnRow.prompt_state);
      const previousBaseAssetId = nextPromptState.baseAssetId;
      const acceptedCreativeState =
        nextPromptState.candidate && nextPromptState.candidateTurnId === input.turnId
          ? parseCreativeState(nextPromptState.candidate)
          : await this.resolveAcceptedCreativeState(
              client,
              turnRow.conversation_id,
              turnRow.retry_of_turn_id ?? input.turnId
            );

      if (!acceptedCreativeState) {
        throw new Error(`Turn ${input.turnId} is missing prompt compiler state.`);
      }

      nextPromptState.committed = acceptedCreativeState;
      nextPromptState.candidate = null;
      nextPromptState.candidateTurnId = null;
      nextPromptState.baseAssetId = input.assetId;
      nextPromptState.revision += 1;

      await client.query(
        `
          UPDATE chat_conversations
          SET prompt_state = $2::jsonb,
              updated_at = $3::timestamptz
          WHERE id = $1;
        `,
        [turnRow.conversation_id, JSON.stringify(nextPromptState), input.acceptedAt]
      );

      await client.query(
        `
          INSERT INTO chat_asset_edges (
            id,
            conversation_id,
            source_asset_id,
            target_asset_id,
            edge_type,
            turn_id,
            run_id,
            created_at
          )
          VALUES ($1, $2, $3, $4, 'accepted_as_final', $5, $6, $7::timestamptz);
        `,
        [
          crypto.randomUUID(),
          turnRow.conversation_id,
          previousBaseAssetId ?? input.assetId,
          input.assetId,
          input.turnId,
          assetRow.run_id,
          input.acceptedAt,
        ]
      );

      return turnRow.conversation_id;
    });

    return this.getConversationSnapshot(input.userId, conversationId);
  }

  async completeGenerationSuccess(input: CompleteChatGenerationSuccessInput) {
    await this.ensureReady();
    await this.withTransaction(async (client) => {
      await client.query(
        `
          UPDATE chat_turns
          SET logical_model = $2,
              deployment_id = $3,
              runtime_provider = $4,
              provider_model = $5,
              status = 'done',
              error = NULL,
              warnings = $6::jsonb,
              updated_at = $7::timestamptz
          WHERE id = $1;
        `,
        [
          input.turnId,
          input.logicalModel,
          input.deploymentId,
          input.runtimeProvider,
          input.providerModel,
          JSON.stringify(input.warnings),
          input.completedAt,
        ]
      );
      await client.query(
        `
          UPDATE chat_jobs
          SET run_id = $2,
              logical_model = $3,
              deployment_id = $4,
              runtime_provider = $5,
              provider_model = $6,
              status = 'succeeded',
              error = NULL,
              completed_at = $7::timestamptz,
              updated_at = $7::timestamptz
          WHERE id = $1;
        `,
        [
          input.jobId,
          input.runId,
          input.logicalModel,
          input.deploymentId,
          input.runtimeProvider,
          input.providerModel,
          input.completedAt,
        ]
      );
      await client.query(
        `
          UPDATE chat_runs
          SET status = $2,
              executed_target = $3::jsonb,
              prompt_snapshot = $4::jsonb,
              error = NULL,
              warnings = $5::jsonb,
              asset_ids = $6::jsonb,
              referenced_asset_ids = $7::jsonb,
              telemetry = $8::jsonb,
              completed_at = $9::timestamptz,
              updated_at = $9::timestamptz
          WHERE id = $1;
        `,
        [
          input.runId,
          input.run.status,
          JSON.stringify(input.run.executedTarget),
          JSON.stringify(input.run.prompt),
          JSON.stringify(input.warnings),
          JSON.stringify(input.run.assetIds),
          JSON.stringify(input.run.referencedAssetIds),
          JSON.stringify(input.run.telemetry),
          input.completedAt,
        ]
      );
      await client.query(
        `
          UPDATE chat_attempts
          SET run_id = $2,
              status = 'succeeded',
              error = NULL,
              provider_request_id = $3,
              provider_task_id = $4,
              completed_at = $5::timestamptz,
              updated_at = $5::timestamptz
          WHERE id = $1;
        `,
        [
          input.attemptId,
          input.runId,
          input.providerRequestId ?? null,
          input.providerTaskId ?? null,
          input.completedAt,
        ]
      );
      await client.query(
        `
          DELETE FROM chat_results
          WHERE turn_id = $1;
        `,
        [input.turnId]
      );
      await client.query(
        `
          UPDATE generated_images
          SET deleted_at = COALESCE(deleted_at, $2::timestamptz)
          WHERE turn_id = $1
            AND deleted_at IS NULL;
        `,
        [input.turnId, input.completedAt]
      );
      await client.query(
        `
          DELETE FROM chat_asset_edges
          WHERE run_id = $1;
        `,
        [input.runId]
      );
      await client.query(
        `
          DELETE FROM chat_asset_locators
          WHERE asset_id IN (
            SELECT id
            FROM chat_assets
            WHERE run_id = $1
          );
        `,
        [input.runId]
      );
      await client.query(
        `
          DELETE FROM chat_assets
          WHERE run_id = $1;
        `,
        [input.runId]
      );

      for (const image of input.generatedImages) {
        await client.query(
          `
            INSERT INTO generated_images (
              id,
              owner_user_id,
              conversation_id,
              turn_id,
              mime_type,
              size_bytes,
              blob_data,
              visibility,
              private_token_hash,
              created_at,
              deleted_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, NULL
            );
          `,
          [
            image.id,
            image.ownerUserId,
            image.conversationId,
            image.turnId,
            image.mimeType,
            image.sizeBytes,
            image.blobData,
            image.visibility,
            image.privateTokenHash,
            image.createdAt,
          ]
        );
      }

      for (const asset of input.assets) {
        await client.query(
          `
            INSERT INTO chat_assets (
              id,
              conversation_id,
              turn_id,
              run_id,
              asset_type,
              label,
              metadata,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz);
          `,
          [
            asset.id,
            input.conversationId,
            asset.turnId,
            asset.runId,
            asset.assetType,
            asset.label,
            JSON.stringify(asset.metadata),
            asset.createdAt,
          ]
        );

        for (const locator of asset.locators) {
          await client.query(
            `
              INSERT INTO chat_asset_locators (
                id,
                asset_id,
                locator_type,
                locator_value,
                mime_type,
                expires_at,
                created_at
              )
              VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz);
            `,
            [
              locator.id,
              asset.id,
              locator.locatorType,
              locator.locatorValue,
              locator.mimeType ?? null,
              locator.expiresAt,
              asset.createdAt,
            ]
          );
        }
      }

      for (const edge of input.assetEdges) {
        await client.query(
          `
            INSERT INTO chat_asset_edges (
              id,
              conversation_id,
              source_asset_id,
              target_asset_id,
              edge_type,
              turn_id,
              run_id,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz);
          `,
          [
            edge.id,
            input.conversationId,
            edge.sourceAssetId,
            edge.targetAssetId,
            edge.edgeType,
            edge.turnId,
            edge.runId,
            edge.createdAt,
          ]
        );
      }

      for (const result of input.results) {
        await client.query(
          `
            INSERT INTO chat_results (
              id,
              conversation_id,
              turn_id,
              job_id,
              image_index,
              image_url,
              image_id,
              thread_asset_id,
              runtime_provider,
              provider_model,
              mime_type,
              revised_prompt,
              created_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::timestamptz
            );
          `,
          [
            result.id,
            input.conversationId,
            input.turnId,
            input.jobId,
            result.index,
            result.imageUrl,
            result.imageId,
            result.threadAssetId,
            result.runtimeProvider,
            result.providerModel,
            result.mimeType ?? null,
            result.revisedPrompt ?? null,
            input.completedAt,
          ]
        );
      }

      await this.touchConversation(input.conversationId, input.completedAt, client);
    });
  }

  async completeGenerationFailure(input: CompleteChatGenerationFailureInput) {
    await this.ensureReady();
    await this.withTransaction(async (client) => {
      await client.query(
        `
          UPDATE chat_turns
          SET status = 'error',
              error = $2,
              warnings = '[]'::jsonb,
              updated_at = $3::timestamptz
          WHERE id = $1;
        `,
        [input.turnId, input.error, input.completedAt]
      );
      await client.query(
        `
          UPDATE chat_jobs
          SET status = 'failed',
              error = $2,
              completed_at = $3::timestamptz,
              updated_at = $3::timestamptz
          WHERE id = $1;
        `,
        [input.jobId, input.error, input.completedAt]
      );
      await client.query(
        `
          UPDATE chat_attempts
          SET run_id = $2,
              status = 'failed',
              error = $3,
              completed_at = $4::timestamptz,
              updated_at = $4::timestamptz
          WHERE id = $1;
        `,
        [input.attemptId, input.runId, input.error, input.completedAt]
      );
      await client.query(
        `
          UPDATE chat_runs
          SET status = 'failed',
              error = $2,
              completed_at = $3::timestamptz,
              updated_at = $3::timestamptz
          WHERE id = $1;
        `,
        [input.runId, input.error, input.completedAt]
      );
      await client.query(
        `
          DELETE FROM chat_results
          WHERE turn_id = $1;
        `,
        [input.turnId]
      );
      await this.touchConversation(input.conversationId, input.completedAt, client);
    });
  }

  async turnExists(userId: string, conversationId: string, turnId: string) {
    await this.ensureReady();
    const result = await this.pool.query(
      `
        SELECT 1
        FROM chat_turns
        WHERE id = $1
          AND conversation_id = $2
          AND is_hidden = FALSE
          AND conversation_id IN (
            SELECT id
            FROM chat_conversations
            WHERE user_id = $3
          )
        LIMIT 1;
      `,
      [turnId, conversationId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async ensureReady() {
    if (!this.initPromise) {
      this.initPromise = this.runMigrations();
    }
    await this.initPromise;
  }

  private async runMigrations() {
    for (const migration of MIGRATIONS) {
      const existing = await this.pool.query<{ name: string }>(
        `
          SELECT name
          FROM chat_schema_migrations
          WHERE name = $1
          LIMIT 1;
        `,
        [migration.name]
      ).catch(() => ({ rows: [] as Array<{ name: string }> }));

      if (existing.rows[0]) {
        continue;
      }

      await this.withTransaction(async (client) => {
        await client.query(migration.sql);
        await client.query(
          `
            INSERT INTO chat_schema_migrations (name)
            VALUES ($1)
            ON CONFLICT (name) DO NOTHING;
          `,
          [migration.name]
        );
      });
    }
  }

  private async touchConversation(
    conversationId: string,
    updatedAt = new Date().toISOString(),
    client?: PoolClient
  ) {
    if (!client) {
      await this.ensureReady();
    }
    const queryable = client ?? this.pool;
    await queryable.query(
      `
        UPDATE chat_conversations
        SET updated_at = $2::timestamptz
        WHERE id = $1;
      `,
      [conversationId, updatedAt]
    );
  }

  private async withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private buildCreativeBrief(
    turns: PersistedGenerationTurn[],
    promptState: PersistedConversationCreativeState
  ) {
    const latestTurn = turns[0] ?? null;

    return {
      latestPrompt: latestTurn?.prompt ?? null,
      latestModelId: latestTurn?.modelId ?? null,
      acceptedAssetId: promptState.baseAssetId ?? null,
      selectedAssetIds: latestTurn?.primaryAssetIds ?? [],
      recentAssetRefIds: latestTurn?.referencedAssetIds ?? [],
    };
  }
}
