import type {
  PersistedAssetEdgeRecord,
  PersistedAssetRecord,
  GenerationJobSnapshot,
  PersistedGenerationTurn,
  PersistedImageSession,
  PersistedRunRecord,
  PersistedResultItem,
} from "../../../../shared/chatImageTypes";
import { ChatConversationNotFoundError } from "./types";
import type {
  ChatAttemptRecord,
  ChatConversationRecord,
  ChatStateRepository,
  CompleteChatGenerationFailureInput,
  CompleteChatGenerationSuccessInput,
  CreateChatGenerationInput,
} from "./types";

interface MemoryTurnRecord extends PersistedGenerationTurn {
  conversationId: string;
  isHidden: boolean;
  updatedAt: string;
}

interface MemoryJobRecord extends GenerationJobSnapshot {
  conversationId: string;
  updatedAt: string;
}

interface MemoryRunRecord extends PersistedRunRecord {
  conversationId: string;
  updatedAt: string;
}

interface MemoryAssetRecord extends PersistedAssetRecord {
  conversationId: string;
}

interface MemoryAssetEdgeRecord extends PersistedAssetEdgeRecord {
  conversationId: string;
}

interface MemoryConversationRecord extends ChatConversationRecord {
  isActive: boolean;
}

const sortNewestFirst = <T extends { createdAt: string }>(items: T[]) =>
  [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

export class MemoryChatStateRepository implements ChatStateRepository {
  private readonly conversations = new Map<string, MemoryConversationRecord>();
  private readonly activeConversationByUserId = new Map<string, string>();
  private readonly turns = new Map<string, MemoryTurnRecord>();
  private readonly jobs = new Map<string, MemoryJobRecord>();
  private readonly runs = new Map<string, MemoryRunRecord>();
  private readonly attempts = new Map<string, ChatAttemptRecord & { conversationId: string }>();
  private readonly assets = new Map<string, MemoryAssetRecord>();
  private readonly assetEdges = new Map<string, MemoryAssetEdgeRecord>();
  private readonly resultsByTurnId = new Map<string, PersistedResultItem[]>();

  async getConversationById(userId: string, conversationId: string) {
    const conversation = this.conversations.get(conversationId) ?? null;
    if (!conversation || conversation.userId !== userId) {
      return null;
    }
    return this.toConversationRecord(conversation);
  }

  async getOrCreateActiveConversation(userId: string) {
    const activeConversationId = this.activeConversationByUserId.get(userId);
    if (activeConversationId) {
      const existing = this.conversations.get(activeConversationId);
      if (existing) {
        return this.toConversationRecord(existing);
      }
    }

    const createdAt = new Date().toISOString();
    const conversation: MemoryConversationRecord = {
      id: crypto.randomUUID(),
      userId,
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    };
    this.conversations.set(conversation.id, conversation);
    this.activeConversationByUserId.set(userId, conversation.id);
    return this.toConversationRecord(conversation);
  }

  async getConversationSnapshot(userId: string, conversationId?: string) {
    const conversation = conversationId
      ? await this.getConversationById(userId, conversationId)
      : await this.getOrCreateActiveConversation(userId);
    if (!conversation) {
      throw new ChatConversationNotFoundError(conversationId);
    }

    const visibleTurns = Array.from(this.turns.values()).filter(
      (turn) => turn.conversationId === conversation.id && !turn.isHidden
    );
    const visibleTurnIds = new Set(visibleTurns.map((turn) => turn.id));
    const turns = sortNewestFirst(
      visibleTurns.map((turn) => ({
          ...turn,
          results: [...(this.resultsByTurnId.get(turn.id) ?? [])],
        }))
    );
    const jobs = sortNewestFirst(
      Array.from(this.jobs.values())
        .filter((job) => job.conversationId === conversation.id && visibleTurnIds.has(job.turnId))
        .map((job) => ({ ...job }))
    );
    const runs = sortNewestFirst(
      Array.from(this.runs.values())
        .filter((run) => run.conversationId === conversation.id && visibleTurnIds.has(run.turnId))
        .map((run) => ({ ...run }))
    );
    const visibleRunIds = new Set(runs.map((run) => run.id));
    const assets = sortNewestFirst(
      Array.from(this.assets.values())
        .filter(
          (asset) =>
            asset.conversationId === conversation.id &&
            ((asset.turnId && visibleTurnIds.has(asset.turnId)) ||
              (asset.runId && visibleRunIds.has(asset.runId)))
        )
        .map((asset) => ({
          ...asset,
          locators: asset.locators.map((locator) => ({ ...locator })),
        }))
    );
    const assetIds = new Set(assets.map((asset) => asset.id));
    const assetEdges = sortNewestFirst(
      Array.from(this.assetEdges.values())
        .filter(
          (edge) =>
            edge.conversationId === conversation.id &&
            assetIds.has(edge.sourceAssetId) &&
            assetIds.has(edge.targetAssetId)
        )
        .map((edge) => ({ ...edge }))
    );

    return {
      id: conversation.id,
      thread: {
        id: conversation.id,
        creativeBrief: this.buildCreativeBrief(turns),
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
      turns,
      runs,
      assets,
      assetEdges,
      jobs,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    } satisfies PersistedImageSession;
  }

  async clearActiveConversation(userId: string) {
    const current = await this.getOrCreateActiveConversation(userId);
    const storedCurrent = this.conversations.get(current.id);
    if (storedCurrent) {
      this.conversations.set(current.id, {
        ...storedCurrent,
        isActive: false,
        updatedAt: new Date().toISOString(),
      });
    }
    if (this.activeConversationByUserId.get(userId) === current.id) {
      this.activeConversationByUserId.delete(userId);
    }

    const nextConversation = await this.getOrCreateActiveConversation(userId);
    return {
      id: nextConversation.id,
      thread: {
        id: nextConversation.id,
        creativeBrief: this.buildCreativeBrief([]),
        createdAt: nextConversation.createdAt,
        updatedAt: nextConversation.updatedAt,
      },
      turns: [],
      runs: [],
      assets: [],
      assetEdges: [],
      jobs: [],
      createdAt: nextConversation.createdAt,
      updatedAt: nextConversation.updatedAt,
    } satisfies PersistedImageSession;
  }

  async deleteTurn(userId: string, turnId: string) {
    const turn = this.turns.get(turnId);
    if (!turn) {
      return null;
    }

    const conversation = await this.getConversationById(userId, turn.conversationId);
    if (!conversation) {
      return null;
    }

    this.turns.set(turnId, {
      ...turn,
      isHidden: true,
      updatedAt: new Date().toISOString(),
    });

    this.touchConversation(conversation.id);
    return this.getConversationSnapshot(userId, conversation.id);
  }

  async createGeneration(input: CreateChatGenerationInput) {
    this.turns.set(input.turn.id, {
      ...input.turn,
      conversationId: input.conversationId,
      isHidden: false,
      updatedAt: input.turn.createdAt,
    });
    this.jobs.set(input.job.id, {
      ...input.job,
      conversationId: input.conversationId,
      updatedAt: input.job.createdAt,
    });
    this.runs.set(input.run.id, {
      ...input.run,
      conversationId: input.conversationId,
      updatedAt: input.run.createdAt,
    });
    this.attempts.set(input.attempt.id, {
      ...input.attempt,
      conversationId: input.conversationId,
    });
    this.resultsByTurnId.set(input.turn.id, [...input.turn.results]);
    this.touchConversation(input.conversationId, input.turn.createdAt);
  }

  async completeGenerationSuccess(input: CompleteChatGenerationSuccessInput) {
    const turn = this.turns.get(input.turnId);
    const job = this.jobs.get(input.jobId);
    const run = this.runs.get(input.runId);
    const attempt = this.attempts.get(input.attemptId);
    if (!turn || !job || !run || !attempt) {
      throw new Error(`Chat generation ${input.turnId} could not be completed.`);
    }

    this.turns.set(input.turnId, {
      ...turn,
      logicalModel: input.logicalModel as PersistedGenerationTurn["logicalModel"],
      deploymentId: input.deploymentId,
      runtimeProvider: input.runtimeProvider,
      providerModel: input.providerModel,
      status: "done",
      error: null,
      warnings: [...input.warnings],
      runIds: [...turn.runIds],
      referencedAssetIds: [...input.run.referencedAssetIds],
      primaryAssetIds: [...input.run.assetIds],
      results: [...input.results],
      updatedAt: input.completedAt,
    });
    this.jobs.set(input.jobId, {
      ...job,
      runId: input.runId,
      logicalModel: input.logicalModel as GenerationJobSnapshot["logicalModel"],
      deploymentId: input.deploymentId,
      runtimeProvider: input.runtimeProvider,
      providerModel: input.providerModel,
      status: "succeeded",
      error: null,
      completedAt: input.completedAt,
      updatedAt: input.completedAt,
    });
    this.attempts.set(input.attemptId, {
      ...attempt,
      status: "succeeded",
      error: null,
      providerRequestId: input.providerRequestId ?? null,
      providerTaskId: input.providerTaskId ?? null,
      completedAt: input.completedAt,
      updatedAt: input.completedAt,
    });
    this.runs.set(input.runId, {
      ...run,
      status: input.run.status,
      prompt: input.run.prompt,
      assetIds: [...input.run.assetIds],
      referencedAssetIds: [...input.run.referencedAssetIds],
      telemetry: { ...input.run.telemetry },
      executedTarget: input.run.executedTarget,
      warnings: [...input.warnings],
      completedAt: input.completedAt,
      updatedAt: input.completedAt,
    });
    input.assets.forEach((asset) => {
      this.assets.set(asset.id, {
        ...asset,
        conversationId: input.conversationId,
        locators: asset.locators.map((locator) => ({ ...locator })),
      });
    });
    input.assetEdges.forEach((edge) => {
      this.assetEdges.set(edge.id, {
        ...edge,
        conversationId: input.conversationId,
      });
    });
    this.resultsByTurnId.set(input.turnId, [...input.results]);
    this.touchConversation(input.conversationId, input.completedAt);
  }

  async completeGenerationFailure(input: CompleteChatGenerationFailureInput) {
    const turn = this.turns.get(input.turnId);
    const job = this.jobs.get(input.jobId);
    const run = this.runs.get(input.runId);
    const attempt = this.attempts.get(input.attemptId);
    if (!turn || !job || !run || !attempt) {
      throw new Error(`Chat generation ${input.turnId} could not be failed.`);
    }

    this.turns.set(input.turnId, {
      ...turn,
      status: "error",
      error: input.error,
      results: [],
      updatedAt: input.completedAt,
    });
    this.jobs.set(input.jobId, {
      ...job,
      status: "failed",
      error: input.error,
      completedAt: input.completedAt,
      updatedAt: input.completedAt,
    });
    this.runs.set(input.runId, {
      ...run,
      status: "failed",
      error: input.error,
      completedAt: input.completedAt,
      updatedAt: input.completedAt,
    });
    this.attempts.set(input.attemptId, {
      ...attempt,
      status: "failed",
      error: input.error,
      completedAt: input.completedAt,
      updatedAt: input.completedAt,
    });
    this.resultsByTurnId.set(input.turnId, []);
    this.touchConversation(input.conversationId, input.completedAt);
  }

  async turnExists(userId: string, conversationId: string, turnId: string) {
    const conversation = await this.getConversationById(userId, conversationId);
    if (!conversation) {
      return false;
    }

    const turn = this.turns.get(turnId);
    return Boolean(turn && turn.conversationId === conversationId && !turn.isHidden);
  }

  private touchConversation(conversationId: string, updatedAt = new Date().toISOString()) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return;
    }

    this.conversations.set(conversationId, {
      ...conversation,
      updatedAt,
    });
  }

  private toConversationRecord(conversation: MemoryConversationRecord): ChatConversationRecord {
    return {
      id: conversation.id,
      userId: conversation.userId,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  private buildCreativeBrief(turns: PersistedGenerationTurn[]) {
    const latestTurn = turns[0] ?? null;
    const latestAcceptedResult =
      latestTurn?.results.find((result) => result.threadAssetId) ?? null;

    return {
      latestPrompt: latestTurn?.prompt ?? null,
      latestModelId: latestTurn?.modelId ?? null,
      acceptedAssetId: latestAcceptedResult?.threadAssetId ?? null,
      selectedAssetIds: latestTurn?.primaryAssetIds ?? [],
      recentAssetRefIds: latestTurn?.referencedAssetIds ?? [],
    };
  }
}
