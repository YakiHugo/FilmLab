import type { PoolClient } from "pg";
import {
  buildCreativeBrief,
  parseCreativeState,
  parsePromptState,
} from "./rows";
import { createInitialConversationCreativeState } from "../../../gateway/prompt/types";
import { createId } from "../../../../../shared/createId";
import type { PersistedConversationCreativeState, PersistedImageSession } from "../models";
import type {
  AcceptConversationTurnInput,
  CompleteChatGenerationFailureInput,
  CompleteChatGenerationSuccessInput,
} from "../types";
import { ChatConversationNotFoundError } from "../types";

type TransactionRunner = <T>(callback: (client: PoolClient) => Promise<T>) => Promise<T>;
type TouchConversation = (
  conversationId: string,
  updatedAt?: string,
  client?: PoolClient
) => Promise<void>;

export const clearActiveConversationQuery = async (input: {
  userId: string;
  withTransaction: TransactionRunner;
}): Promise<PersistedImageSession> => {
  const createdAt = new Date().toISOString();
  const conversationId = createId("conversation");

  await input.withTransaction(async (client) => {
    await client.query(
      `
        UPDATE chat_conversations
        SET is_active = FALSE,
            updated_at = $2::timestamptz
        WHERE user_id = $1
          AND is_active = TRUE;
      `,
      [input.userId, createdAt]
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
        input.userId,
        JSON.stringify(createInitialConversationCreativeState()),
        createdAt,
        createdAt,
      ]
    );
  });

  const promptState = createInitialConversationCreativeState();
  return {
    id: conversationId,
    thread: {
      id: conversationId,
      creativeBrief: buildCreativeBrief([], promptState),
      promptState,
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
};

export const deleteTurnQuery = async (input: {
  userId: string;
  turnId: string;
  withTransaction: TransactionRunner;
  touchConversation: TouchConversation;
  getConversationSnapshot: (userId: string, conversationId?: string) => Promise<PersistedImageSession>;
}): Promise<PersistedImageSession | null> => {
  const row = await input.withTransaction(async (client) => {
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
      [input.turnId, input.userId]
    );

    const updatedRow = result.rows[0] ?? null;
    if (!updatedRow) {
      return null;
    }
    await input.touchConversation(updatedRow.conversation_id, undefined, client);
    return updatedRow;
  });

  if (!row) {
    return null;
  }

  return input.getConversationSnapshot(input.userId, row.conversation_id);
};

const resolveAcceptedCreativeState = async (input: {
  client: PoolClient;
  conversationId: string;
  startingTurnId: string;
}): Promise<PersistedConversationCreativeState["committed"] | null> => {
  const visited = new Set<string>();
  let semanticTurnId: string | null = input.startingTurnId;

  while (semanticTurnId && !visited.has(semanticTurnId)) {
    visited.add(semanticTurnId);

    const versionResult = await input.client.query<{
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
      [input.conversationId, semanticTurnId]
    );
    const versionRow = versionResult.rows[0];
    if (versionRow?.candidate_state_after) {
      return parseCreativeState(versionRow.candidate_state_after);
    }

    semanticTurnId =
      (
        await input.client.query<{ retry_of_turn_id: string | null }>(
          `
            SELECT retry_of_turn_id
            FROM chat_turns
            WHERE id = $1
              AND conversation_id = $2
            LIMIT 1;
          `,
          [semanticTurnId, input.conversationId]
        )
      ).rows[0]?.retry_of_turn_id ?? null;
  }

  return null;
};

export const acceptConversationTurnMutation = async (input: {
  params: AcceptConversationTurnInput;
  withTransaction: TransactionRunner;
  getConversationSnapshot: (userId: string, conversationId?: string) => Promise<PersistedImageSession>;
}): Promise<PersistedImageSession> => {
  const conversationId = await input.withTransaction(async (client) => {
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
      [input.params.turnId, input.params.userId]
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
      [input.params.assetId, turnRow.conversation_id]
    );
    const assetRow = assetResult.rows[0];
    if (!assetRow) {
      throw new Error(
        `Asset ${input.params.assetId} was not found in conversation ${turnRow.conversation_id}.`
      );
    }

    const nextPromptState = parsePromptState(turnRow.prompt_state);
    const previousBaseAssetId = nextPromptState.baseAssetId;
    const acceptedCreativeState =
      nextPromptState.candidate && nextPromptState.candidateTurnId === input.params.turnId
        ? parseCreativeState(nextPromptState.candidate)
        : await resolveAcceptedCreativeState({
            client,
            conversationId: turnRow.conversation_id,
            startingTurnId: turnRow.retry_of_turn_id ?? input.params.turnId,
          });

    if (!acceptedCreativeState) {
      throw new Error(`Turn ${input.params.turnId} is missing prompt compiler state.`);
    }

    nextPromptState.committed = acceptedCreativeState;
    nextPromptState.candidate = null;
    nextPromptState.candidateTurnId = null;
    nextPromptState.baseAssetId = input.params.assetId;
    nextPromptState.revision += 1;

    await client.query(
      `
        UPDATE chat_conversations
        SET prompt_state = $2::jsonb,
            updated_at = $3::timestamptz
        WHERE id = $1;
      `,
      [turnRow.conversation_id, JSON.stringify(nextPromptState), input.params.acceptedAt]
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
        createId("accepted-edge"),
        turnRow.conversation_id,
        previousBaseAssetId ?? input.params.assetId,
        input.params.assetId,
        input.params.turnId,
        assetRow.run_id,
        input.params.acceptedAt,
      ]
    );

    return turnRow.conversation_id;
  });

  return input.getConversationSnapshot(input.params.userId, conversationId);
};

export const completeGenerationSuccessMutation = async (input: {
  params: CompleteChatGenerationSuccessInput;
  withTransaction: TransactionRunner;
  touchConversation: TouchConversation;
}): Promise<void> => {
  await input.withTransaction(async (client) => {
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
        input.params.turnId,
        input.params.logicalModel,
        input.params.deploymentId,
        input.params.runtimeProvider,
        input.params.providerModel,
        JSON.stringify(input.params.warnings),
        input.params.completedAt,
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
        input.params.jobId,
        input.params.runId,
        input.params.logicalModel,
        input.params.deploymentId,
        input.params.runtimeProvider,
        input.params.providerModel,
        input.params.completedAt,
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
        input.params.runId,
        input.params.run.status,
        JSON.stringify(input.params.run.executedTarget),
        JSON.stringify(input.params.run.prompt),
        JSON.stringify(input.params.warnings),
        JSON.stringify(input.params.run.assetIds),
        JSON.stringify(input.params.run.referencedAssetIds),
        JSON.stringify(input.params.run.telemetry),
        input.params.completedAt,
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
        input.params.attemptId,
        input.params.runId,
        input.params.providerRequestId ?? null,
        input.params.providerTaskId ?? null,
        input.params.completedAt,
      ]
    );
    await client.query(
      `
        DELETE FROM chat_results
        WHERE turn_id = $1;
      `,
      [input.params.turnId]
    );
    await client.query(
      `
        DELETE FROM chat_asset_edges
        WHERE run_id = $1;
      `,
      [input.params.runId]
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
      [input.params.runId]
    );
    await client.query(
      `
        DELETE FROM chat_assets
        WHERE run_id = $1;
      `,
      [input.params.runId]
    );

    for (const asset of input.params.assets) {
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
          input.params.conversationId,
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

    for (const edge of input.params.assetEdges) {
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
          input.params.conversationId,
          edge.sourceAssetId,
          edge.targetAssetId,
          edge.edgeType,
          edge.turnId,
          edge.runId,
          edge.createdAt,
        ]
      );
    }

    for (const result of input.params.results) {
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
          input.params.conversationId,
          input.params.turnId,
          input.params.jobId,
          result.index,
          result.imageUrl,
          result.imageId,
          result.assetId,
          result.runtimeProvider,
          result.providerModel,
          result.mimeType ?? null,
          result.revisedPrompt ?? null,
          input.params.completedAt,
        ]
      );
    }

    await input.touchConversation(input.params.conversationId, input.params.completedAt, client);
  });
};

export const completeGenerationFailureMutation = async (input: {
  params: CompleteChatGenerationFailureInput;
  withTransaction: TransactionRunner;
  touchConversation: TouchConversation;
}): Promise<void> => {
  await input.withTransaction(async (client) => {
    await client.query(
      `
        UPDATE chat_turns
        SET status = 'error',
            error = $2,
            warnings = '[]'::jsonb,
            updated_at = $3::timestamptz
        WHERE id = $1;
      `,
      [input.params.turnId, input.params.error, input.params.completedAt]
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
      [input.params.jobId, input.params.error, input.params.completedAt]
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
      [input.params.attemptId, input.params.runId, input.params.error, input.params.completedAt]
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
      [input.params.runId, input.params.error, input.params.completedAt]
    );
    await client.query(
      `
        DELETE FROM chat_results
        WHERE turn_id = $1;
      `,
      [input.params.turnId]
    );
    await input.touchConversation(input.params.conversationId, input.params.completedAt, client);
  });
};
