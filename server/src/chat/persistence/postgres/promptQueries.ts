import type { Pool } from "pg";
import { buildPromptObservabilitySummary } from "../promptObservability";
import type {
  PromptObservabilitySummaryResponse,
  TurnPromptArtifactsResponse,
} from "../models";
import type { ChatConversationRecord } from "../types";
import {
  type ChatPromptArtifactRow,
  type ChatRunRow,
  type ChatTurnRow,
  parseRunTarget,
  toPromptArtifactRecord,
} from "./rows";

export const getPromptArtifactsForTurnQuery = async (input: {
  pool: Pool;
  userId: string;
  turnId: string;
}): Promise<TurnPromptArtifactsResponse | null> => {
  const turnResult = await input.pool.query<{
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
    [input.turnId, input.userId]
  );
  const turnRow = turnResult.rows[0];
  if (!turnRow) {
    return null;
  }

  const versionsResult = await input.pool.query<ChatPromptArtifactRow>(
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
      FROM chat_prompt_versions
      WHERE conversation_id = $1
        AND turn_id = $2
      ORDER BY version ASC, created_at ASC;
    `,
    [turnRow.conversation_id, input.turnId]
  );

  return {
    turnId: input.turnId,
    versions: versionsResult.rows.map(toPromptArtifactRecord),
  };
};

export const getPromptObservabilityForConversationQuery = async (input: {
  pool: Pool;
  userId: string;
  conversationId?: string;
  getConversationById: (userId: string, conversationId: string) => Promise<ChatConversationRecord | null>;
  getActiveConversation: (userId: string) => Promise<ChatConversationRecord | null>;
}): Promise<PromptObservabilitySummaryResponse | null> => {
  const conversation = input.conversationId
    ? await input.getConversationById(input.userId, input.conversationId)
    : await input.getActiveConversation(input.userId);
  if (!conversation) {
    return null;
  }

  const [turnsResult, runsResult, versionsResult] = await Promise.all([
    input.pool.query<Pick<ChatTurnRow, "id" | "prompt" | "created_at">>(
      `
        SELECT
          id,
          prompt,
          created_at
        FROM chat_turns
        WHERE conversation_id = $1
          AND is_hidden = FALSE
        ORDER BY created_at DESC;
      `,
      [conversation.id]
    ),
    input.pool.query<
      Pick<
        ChatRunRow,
        "turn_id" | "operation" | "selected_target" | "executed_target" | "created_at"
      >
    >(
      `
        SELECT
          turn_id,
          operation,
          selected_target,
          executed_target,
          created_at
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
    input.pool.query<ChatPromptArtifactRow>(
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
        FROM chat_prompt_versions
        WHERE conversation_id = $1
          AND turn_id IN (
            SELECT id
            FROM chat_turns
            WHERE conversation_id = $1
              AND is_hidden = FALSE
          )
        ORDER BY version ASC, created_at ASC;
      `,
      [conversation.id]
    ),
  ]);

  return buildPromptObservabilitySummary({
    conversationId: conversation.id,
    turns: turnsResult.rows.map((row) => ({
      id: row.id,
      prompt: row.prompt,
      createdAt: new Date(row.created_at).toISOString(),
    })),
    runs: runsResult.rows.map((row) => ({
      turnId: row.turn_id,
      operation: row.operation,
      selectedTarget: parseRunTarget(row.selected_target),
      executedTarget: parseRunTarget(row.executed_target),
      createdAt: new Date(row.created_at).toISOString(),
    })),
    artifacts: versionsResult.rows.map(toPromptArtifactRecord),
  });
};
