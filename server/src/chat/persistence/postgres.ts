import type { Pool, PoolClient } from "pg";
import { createInitialConversationCreativeState } from "../../domain/prompt";
import type { PromptVersionRecord } from "../../domain/prompt";
import {
  ChatConversationNotFoundError,
  ChatPromptStateConflictError,
} from "./types";
import { createId } from "../../../../shared/createId";
import type { PersistedRunRecord } from "./models";
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

export class PostgresChatStateRepository implements ChatStateRepository {

  constructor(private readonly pool: Pool) {}

  async close() {
    await this.pool.end();
  }

  async getConversationById(userId: string, conversationId: string) {

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

    return clearActiveConversationQuery({
      userId,
      withTransaction: (callback) => this.withTransaction(callback),
    });
  }

  async deleteTurn(userId: string, turnId: string) {

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

  async createGeneration(input: CreateChatGenerationInput) {

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
      for (const additionalRun of input.additionalRuns ?? []) {
        await this.insertRun(client, input.conversationId, additionalRun);
      }
      for (const version of input.promptVersions ?? []) {
        await this.insertPromptVersion(client, input.conversationId, version);
      }
      await this.touchConversation(input.conversationId, input.turn.createdAt, client);
    });
  }

  async createTurn(input: CreateChatTurnInput) {

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

    await this.withTransaction(async (client) => {
      await this.insertRun(client, input.conversationId, input.run);

      if (input.attempt) {
        await client.query(
          `
            INSERT INTO chat_attempts (
              id, job_id, run_id, attempt_no, status, error,
              provider_request_id, provider_task_id,
              created_at, completed_at, updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11::timestamptz
            );
          `,
          [
            input.attempt.id, input.attempt.jobId, input.attempt.runId,
            input.attempt.attemptNo, input.attempt.status, input.attempt.error,
            input.attempt.providerRequestId, input.attempt.providerTaskId,
            input.attempt.createdAt, input.attempt.completedAt, input.attempt.updatedAt,
          ]
        );
      }

      await this.touchConversation(input.conversationId, input.run.createdAt, client);
    });
  }

  async createPromptVersions(input: CreatePromptVersionsInput) {

    await this.withTransaction(async (client) => {
      for (const version of input.versions) {
        await this.insertPromptVersion(client, input.conversationId, version);
      }
    });
  }

  async updateConversationPromptState(input: UpdateConversationPromptStateInput) {

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

    return acceptConversationTurnMutation({
      params: input,
      withTransaction: (callback) => this.withTransaction(callback),
      getConversationSnapshot: (nextUserId, conversationId) =>
        this.getConversationSnapshot(nextUserId, conversationId),
    });
  }

  async completeGenerationSuccess(input: CompleteChatGenerationSuccessInput) {

    await completeGenerationSuccessMutation({
      params: input,
      withTransaction: (callback) => this.withTransaction(callback),
      touchConversation: (conversationId, updatedAt, client) =>
        this.touchConversation(conversationId, updatedAt, client),
    });
  }

  async completeGenerationFailure(input: CompleteChatGenerationFailureInput) {

    await completeGenerationFailureMutation({
      params: input,
      withTransaction: (callback) => this.withTransaction(callback),
      touchConversation: (conversationId, updatedAt, client) =>
        this.touchConversation(conversationId, updatedAt, client),
    });
  }

  async turnExists(userId: string, conversationId: string, turnId: string) {

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

  private async touchConversation(
    conversationId: string,
    updatedAt = new Date().toISOString(),
    client?: PoolClient
  ) {
    if (!client) {
      // Use pool directly when no explicit client is provided.
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

  private async insertRun(client: PoolClient, conversationId: string, run: PersistedRunRecord) {
    await client.query(
      `
        INSERT INTO chat_runs (
          id, conversation_id, turn_id, job_id, operation, status,
          requested_target, selected_target, executed_target, prompt_snapshot,
          error, warnings, asset_ids, referenced_asset_ids, telemetry,
          created_at, completed_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11,
          $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::timestamptz,
          $17::timestamptz, $18::timestamptz
        );
      `,
      [
        run.id, conversationId, run.turnId, run.jobId, run.operation, run.status,
        JSON.stringify(run.requestedTarget), JSON.stringify(run.selectedTarget),
        JSON.stringify(run.executedTarget), JSON.stringify(run.prompt),
        run.error, JSON.stringify(run.warnings), JSON.stringify(run.assetIds),
        JSON.stringify(run.referencedAssetIds), JSON.stringify(run.telemetry),
        run.createdAt, run.completedAt, run.createdAt,
      ]
    );
  }

  private async insertPromptVersion(client: PoolClient, conversationId: string, version: PromptVersionRecord) {
    await client.query(
      `
        INSERT INTO chat_prompt_versions (
          id, conversation_id, run_id, turn_id, version, stage, target_key,
          attempt, compiler_version, capability_version, original_prompt,
          trace_id, prompt_intent, turn_delta, committed_state_before,
          candidate_state_after, prompt_ir, compiled_prompt, dispatched_prompt,
          provider_effective_prompt, semantic_losses, warnings, hashes, created_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb,
          $15::jsonb, $16::jsonb, $17::jsonb, $18, $19, $20, $21::jsonb, $22::jsonb,
          $23::jsonb, $24::timestamptz
        );
      `,
      [
        version.id, conversationId, version.runId, version.turnId, version.version,
        version.stage, version.targetKey, version.attempt, version.compilerVersion,
        version.capabilityVersion, version.originalPrompt, version.traceId,
        JSON.stringify(version.promptIntent), JSON.stringify(version.turnDelta),
        JSON.stringify(version.committedStateBefore), JSON.stringify(version.candidateStateAfter),
        JSON.stringify(version.promptIR), version.compiledPrompt, version.dispatchedPrompt,
        version.providerEffectivePrompt, JSON.stringify(version.semanticLosses),
        JSON.stringify(version.warnings), JSON.stringify(version.hashes), version.createdAt,
      ]
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
