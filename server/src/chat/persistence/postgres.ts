import type { Pool, PoolClient } from "pg";
import { createInitialConversationCreativeState } from "../../gateway/prompt/types";
import {
  ChatConversationNotFoundError,
  ChatPromptStateConflictError,
} from "./types";
import { createId } from "../../../../shared/createId";
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
import { getConversationSnapshotQuery } from "./postgres/conversationQueries";
import {
  acceptConversationTurnMutation,
  clearActiveConversationQuery,
  completeGenerationFailureMutation,
  completeGenerationSuccessMutation,
  deleteTurnQuery,
} from "./postgres/mutations";
import {
  getPromptArtifactsForTurnQuery,
  getPromptObservabilityForConversationQuery,
} from "./postgres/promptQueries";
import { type ChatConversationRow, toConversationRecord } from "./postgres/rows";

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
  {
    name: "006_prompt_trace_id",
    sql: `
      ALTER TABLE chat_prompt_versions
      ADD COLUMN IF NOT EXISTS trace_id TEXT NULL;
    `,
  },
] as const;

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

    return toConversationRecord(row);
  }

  private async getActiveConversation(userId: string) {
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
    if (!row) {
      return null;
    }

    return toConversationRecord(row);
  }

  async getOrCreateActiveConversation(userId: string) {
    const existing = await this.getActiveConversation(userId);
    if (existing) {
      return existing;
    }

    const createdAt = new Date().toISOString();
    const conversationId = createId("conversation");
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
    return getConversationSnapshotQuery({
      pool: this.pool,
      userId,
      conversationId,
      getConversationById: (nextUserId, nextConversationId) =>
        this.getConversationById(nextUserId, nextConversationId),
      getOrCreateActiveConversation: (nextUserId) => this.getOrCreateActiveConversation(nextUserId),
    });
  }

  async getPromptArtifactsForTurn(
    userId: string,
    turnId: string
  ) {
    await this.ensureReady();
    return getPromptArtifactsForTurnQuery({
      pool: this.pool,
      userId,
      turnId,
    });
  }

  async getPromptObservabilityForConversation(
    userId: string,
    conversationId?: string
  ) {
    await this.ensureReady();
    return getPromptObservabilityForConversationQuery({
      pool: this.pool,
      userId,
      conversationId,
      getConversationById: (nextUserId, nextConversationId) =>
        this.getConversationById(nextUserId, nextConversationId),
      getActiveConversation: (nextUserId) => this.getActiveConversation(nextUserId),
    });
  }

  async clearActiveConversation(userId: string) {
    await this.ensureReady();
    return clearActiveConversationQuery({
      userId,
      withTransaction: (callback) => this.withTransaction(callback),
    });
  }

  async deleteTurn(userId: string, turnId: string) {
    await this.ensureReady();
    return deleteTurnQuery({
      userId,
      turnId,
      withTransaction: (callback) => this.withTransaction(callback),
      touchConversation: (conversationId, updatedAt, client) =>
        this.touchConversation(conversationId, updatedAt, client),
      getConversationSnapshot: (nextUserId, conversationId) =>
        this.getConversationSnapshot(nextUserId, conversationId),
    });
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
              trace_id,
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
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb,
              $15::jsonb, $16::jsonb, $17::jsonb, $18, $19, $20, $21::jsonb, $22::jsonb,
              $23::jsonb, $24::timestamptz
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
            version.traceId,
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

  async acceptConversationTurn(input: AcceptConversationTurnInput) {
    await this.ensureReady();
    return acceptConversationTurnMutation({
      params: input,
      withTransaction: (callback) => this.withTransaction(callback),
      getConversationSnapshot: (nextUserId, conversationId) =>
        this.getConversationSnapshot(nextUserId, conversationId),
    });
  }

  async completeGenerationSuccess(input: CompleteChatGenerationSuccessInput) {
    await this.ensureReady();
    await completeGenerationSuccessMutation({
      params: input,
      withTransaction: (callback) => this.withTransaction(callback),
      touchConversation: (conversationId, updatedAt, client) =>
        this.touchConversation(conversationId, updatedAt, client),
    });
  }

  async completeGenerationFailure(input: CompleteChatGenerationFailureInput) {
    await this.ensureReady();
    await completeGenerationFailureMutation({
      params: input,
      withTransaction: (callback) => this.withTransaction(callback),
      touchConversation: (conversationId, updatedAt, client) =>
        this.touchConversation(conversationId, updatedAt, client),
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
}
