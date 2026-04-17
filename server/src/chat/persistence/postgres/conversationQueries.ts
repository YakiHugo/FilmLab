import type { Pool } from "pg";
import { ChatConversationNotFoundError, type ChatConversationRecord } from "../types";
import type {
  GenerationJobSnapshot,
  PersistedAssetEdgeRecord,
  PersistedAssetLocatorRecord,
  PersistedAssetRecord,
  PersistedGenerationTurn,
  PersistedImageSession,
  PersistedResultItem,
} from "../models";
import {
  type ChatAssetEdgeRow,
  type ChatAssetLocatorRow,
  type ChatAssetRow,
  type ChatJobRow,
  type ChatResultRow,
  type ChatRunRow,
  type ChatTurnRow,
  clonePromptState,
  mapLocatorRows,
  mapResultRows,
  parsePromptSnapshot,
  parseRunTarget,
  parseStringArray,
  parseTelemetry,
} from "./rows";
import {
  buildCreativeBrief,
  filterAssetEdgesByVisibleAssets,
  filterAssetsByVisibleScope,
} from "../../domain/snapshot";

export const getConversationSnapshotQuery = async (input: {
  pool: Pool;
  userId: string;
  conversationId?: string;
  getConversationById: (userId: string, conversationId: string) => Promise<ChatConversationRecord | null>;
  getOrCreateActiveConversation: (userId: string) => Promise<ChatConversationRecord>;
}): Promise<PersistedImageSession> => {
  const conversation = input.conversationId
    ? await input.getConversationById(input.userId, input.conversationId)
    : await input.getOrCreateActiveConversation(input.userId);
  if (!conversation) {
    throw new ChatConversationNotFoundError(input.conversationId);
  }

  const [
    turnsResult,
    jobsResult,
    resultsResult,
    runsResult,
    assetsResult,
    locatorsResult,
    assetEdgesResult,
  ] = await Promise.all([
    input.pool.query<ChatTurnRow>(
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
    input.pool.query<ChatJobRow>(
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
    input.pool.query<ChatResultRow>(
      `
        SELECT
          id,
          turn_id,
          image_url,
          image_id,
          thread_asset_id AS asset_id,
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
    input.pool.query<ChatRunRow>(
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
    input.pool.query<ChatAssetRow>(
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
    input.pool.query<ChatAssetLocatorRow>(
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
    input.pool.query<ChatAssetEdgeRow>(
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

  const resultsByTurnId = mapResultRows(resultsResult.rows);
  const locatorsByAssetId = mapLocatorRows(locatorsResult.rows);
  const turns = mapTurnRows({
    turnRows: turnsResult.rows,
    runRows: runsResult.rows,
    resultsByTurnId,
  });
  const visibleTurnIds = new Set(turns.map((turn) => turn.id));
  const visibleRunIds = new Set(
    runsResult.rows.filter((run) => visibleTurnIds.has(run.turn_id)).map((run) => run.id)
  );
  const assets = mapAssetRows({
    assetRows: assetsResult.rows,
    locatorRowsByAssetId: locatorsByAssetId,
    visibleTurnIds,
    visibleRunIds,
  });
  const assetEdges = mapAssetEdgeRows(assetEdgesResult.rows, assets);

  return {
    id: conversation.id,
    thread: {
      id: conversation.id,
      creativeBrief: buildCreativeBrief(turns, conversation.promptState),
      promptState: clonePromptState(conversation.promptState),
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
};

const mapTurnRows = (input: {
  turnRows: ChatTurnRow[];
  runRows: ChatRunRow[];
  resultsByTurnId: Map<string, PersistedResultItem[]>;
}): PersistedGenerationTurn[] =>
  input.turnRows.map((row) => ({
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
    runIds: input.runRows.filter((run) => run.turn_id === row.id).map((run) => run.id),
    referencedAssetIds: input.runRows
      .filter((run) => run.turn_id === row.id)
      .flatMap((run) => parseStringArray(run.referenced_asset_ids)),
    primaryAssetIds: input.runRows
      .filter((run) => run.turn_id === row.id && run.operation === "image.generate")
      .flatMap((run) => parseStringArray(run.asset_ids)),
    results: input.resultsByTurnId.get(row.id) ?? [],
  }));

const mapAssetRows = (input: {
  assetRows: ChatAssetRow[];
  locatorRowsByAssetId: Map<string, PersistedAssetLocatorRecord[]>;
  visibleTurnIds: Set<string>;
  visibleRunIds: Set<string>;
}): PersistedAssetRecord[] => {
  const mapped = input.assetRows.map((row) => ({
    id: row.id,
    turnId: row.turn_id,
    runId: row.run_id,
    assetType: row.asset_type,
    label: row.label,
    metadata: row.metadata,
    locators: input.locatorRowsByAssetId.get(row.id) ?? [],
    createdAt: new Date(row.created_at).toISOString(),
  }));
  return filterAssetsByVisibleScope(mapped, input.visibleTurnIds, input.visibleRunIds);
};

const mapAssetEdgeRows = (
  rows: ChatAssetEdgeRow[],
  assets: PersistedAssetRecord[]
): PersistedAssetEdgeRecord[] => {
  const assetIds = new Set(assets.map((asset) => asset.id));
  const mapped = rows.map((row) => ({
    id: row.id,
    sourceAssetId: row.source_asset_id,
    targetAssetId: row.target_asset_id,
    edgeType: row.edge_type,
    turnId: row.turn_id,
    runId: row.run_id,
    createdAt: new Date(row.created_at).toISOString(),
  }));
  return filterAssetEdgesByVisibleAssets(mapped, assetIds);
};
