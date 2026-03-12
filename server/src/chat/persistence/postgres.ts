import type { Pool, PoolClient } from "pg";
import type {
  GenerationJobSnapshot,
  PersistedGenerationTurn,
  PersistedImageSession,
  PersistedResultItem,
} from "../../../../shared/chatImageTypes";
import { ChatConversationNotFoundError } from "./types";
import type {
  ChatConversationRecord,
  ChatStateRepository,
  CompleteChatGenerationFailureInput,
  CompleteChatGenerationSuccessInput,
  CreateChatGenerationInput,
} from "./types";

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
  runtime_provider: string;
  provider_model: string;
  mime_type: string | null;
  revised_prompt: string | null;
  image_index: number;
}

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

export class PostgresChatStateRepository implements ChatStateRepository {
  private initPromise: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  async getConversationById(userId: string, conversationId: string) {
    await this.ensureReady();
    const result = await this.pool.query<{
      id: string;
      user_id: string;
      created_at: string;
      updated_at: string;
    }>(
      `
        SELECT id, user_id, created_at, updated_at
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
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    } satisfies ChatConversationRecord;
  }

  async getOrCreateActiveConversation(userId: string) {
    await this.ensureReady();
    const existing = await this.pool.query<{
      id: string;
      user_id: string;
      created_at: string;
      updated_at: string;
    }>(
      `
        SELECT id, user_id, created_at, updated_at
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
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      } satisfies ChatConversationRecord;
    }

    const createdAt = new Date().toISOString();
    const conversationId = crypto.randomUUID();
    await this.pool.query(
      `
        INSERT INTO chat_conversations (id, user_id, is_active, created_at, updated_at)
        VALUES ($1, $2, TRUE, $3::timestamptz, $4::timestamptz);
      `,
      [conversationId, userId, createdAt, createdAt]
    );

    return {
      id: conversationId,
      userId,
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

    const [turnsResult, jobsResult, resultsResult] = await Promise.all([
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
    ]);

    const resultsByTurnId = resultsResult.rows.reduce<Map<string, PersistedResultItem[]>>(
      (map, row) => {
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
          assetId: null,
          saved: false,
        });
        map.set(row.turn_id, current);
        return map;
      },
      new Map()
    );

    return {
      id: conversation.id,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      turns: turnsResult.rows.map((row) => ({
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
        results: resultsByTurnId.get(row.id) ?? [],
      })),
      jobs: jobsResult.rows.map((row) => ({
        id: row.id,
        turnId: row.turn_id,
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
          INSERT INTO chat_conversations (id, user_id, is_active, created_at, updated_at)
          VALUES ($1, $2, TRUE, $3::timestamptz, $4::timestamptz);
        `,
        [conversationId, userId, createdAt, createdAt]
      );
    });

    return {
      id: conversationId,
      turns: [],
      jobs: [],
      createdAt,
      updatedAt: createdAt,
    } satisfies PersistedImageSession;
  }

  async deleteTurn(userId: string, turnId: string) {
    await this.ensureReady();
    const result = await this.pool.query<{ conversation_id: string }>(
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

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    await this.touchConversation(row.conversation_id);
    return this.getConversationSnapshot(userId, row.conversation_id);
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
          );
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
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12,
            $13::timestamptz, $14::timestamptz, $15::timestamptz
          );
        `,
        [
          input.job.id,
          input.conversationId,
          input.job.turnId,
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
          INSERT INTO chat_attempts (
            id,
            job_id,
            attempt_no,
            status,
            error,
            provider_request_id,
            provider_task_id,
            created_at,
            completed_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10::timestamptz);
        `,
        [
          input.attempt.id,
          input.attempt.jobId,
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
          SET logical_model = $2,
              deployment_id = $3,
              runtime_provider = $4,
              provider_model = $5,
              status = 'succeeded',
              error = NULL,
              completed_at = $6::timestamptz,
              updated_at = $6::timestamptz
          WHERE id = $1;
        `,
        [
          input.jobId,
          input.logicalModel,
          input.deploymentId,
          input.runtimeProvider,
          input.providerModel,
          input.completedAt,
        ]
      );
      await client.query(
        `
          UPDATE chat_attempts
          SET status = 'succeeded',
              error = NULL,
              provider_request_id = $2,
              provider_task_id = $3,
              completed_at = $4::timestamptz,
              updated_at = $4::timestamptz
          WHERE id = $1;
        `,
        [
          input.attemptId,
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
              runtime_provider,
              provider_model,
              mime_type,
              revised_prompt,
              created_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz
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
          SET status = 'failed',
              error = $2,
              completed_at = $3::timestamptz,
              updated_at = $3::timestamptz
          WHERE id = $1;
        `,
        [input.attemptId, input.error, input.completedAt]
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
}
