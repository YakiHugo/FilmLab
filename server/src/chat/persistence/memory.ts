import type {
  PersistedAssetEdgeRecord,
  PersistedAssetRecord,
  PersistedConversationCreativeState,
  GenerationJobSnapshot,
  PersistedGenerationTurn,
  PersistedImageSession,
  PromptObservabilitySummaryResponse,
  TurnPromptArtifactsResponse,
  PersistedRunRecord,
  PersistedResultItem,
} from "./models";
import {
  cloneConversationCreativeState,
  cloneCreativeState,
  createInitialConversationCreativeState,
} from "../../gateway/prompt/types";
import type { PromptVersionRecord } from "../../gateway/prompt/types";
import { createId } from "../../../../shared/createId";
import {
  ChatConversationNotFoundError,
  ChatPromptStateConflictError,
} from "./types";
import type {
  AcceptConversationTurnInput,
  ChatAttemptRecord,
  ChatConversationRecord,
  ChatStateRepository,
  CompleteChatGenerationFailureInput,
  CompleteChatGenerationSuccessInput,
  CreateChatRunInput,
  CreatePromptVersionsInput,
  CreateChatGenerationInput,
  UpdateConversationPromptStateInput,
} from "./types";
import { buildPromptObservabilitySummary } from "./promptObservability";

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

const PROMPT_STAGE_PRIORITY = {
  rewrite: 0,
  compile: 1,
  dispatch: 2,
} as const;

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
  private readonly promptVersions = new Map<string, PromptVersionRecord[]>();

  async close() {
    return Promise.resolve();
  }

  async getConversationById(userId: string, conversationId: string) {
    const conversation = this.conversations.get(conversationId) ?? null;
    if (!conversation || conversation.userId !== userId) {
      return null;
    }
    return this.toConversationRecord(conversation);
  }

  private async getActiveConversation(userId: string) {
    const activeConversationId = this.activeConversationByUserId.get(userId);
    if (!activeConversationId) {
      return null;
    }

    const existing = this.conversations.get(activeConversationId) ?? null;
    if (!existing || existing.userId !== userId) {
      return null;
    }

    return this.toConversationRecord(existing);
  }

  async getOrCreateActiveConversation(userId: string) {
    const existing = await this.getActiveConversation(userId);
    if (existing) {
      return existing;
    }

    const createdAt = new Date().toISOString();
    const conversation: MemoryConversationRecord = {
      id: createId("conversation"),
      userId,
      promptState: createInitialConversationCreativeState(),
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
        creativeBrief: this.buildCreativeBrief(turns, conversation.promptState),
        promptState: cloneConversationCreativeState(conversation.promptState),
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

  async getPromptArtifactsForTurn(
    userId: string,
    turnId: string
  ): Promise<TurnPromptArtifactsResponse | null> {
    const turn = this.turns.get(turnId);
    if (!turn || turn.isHidden) {
      return null;
    }

    const conversation = await this.getConversationById(userId, turn.conversationId);
    if (!conversation) {
      return null;
    }

    const versions = [...(this.promptVersions.get(turn.conversationId) ?? [])]
      .filter((version) => version.turnId === turnId)
      .sort((left, right) => {
        const versionDelta = left.version - right.version;
        if (versionDelta !== 0) {
          return versionDelta;
        }
        return left.createdAt.localeCompare(right.createdAt);
      })
      .map((version) => structuredClone(version));

    return {
      turnId,
      versions,
    };
  }

  async getPromptObservabilityForConversation(
    userId: string,
    conversationId?: string
  ): Promise<PromptObservabilitySummaryResponse | null> {
    const conversation = conversationId
      ? await this.getConversationById(userId, conversationId)
      : await this.getActiveConversation(userId);
    if (!conversation) {
      return null;
    }

    const turns = sortNewestFirst(
      Array.from(this.turns.values())
        .filter((turn) => turn.conversationId === conversation.id && !turn.isHidden)
        .map((turn) => ({
          id: turn.id,
          prompt: turn.prompt,
          createdAt: turn.createdAt,
        }))
    );
    const visibleTurnIds = new Set(turns.map((turn) => turn.id));
    const runs = sortNewestFirst(
      Array.from(this.runs.values()).filter(
        (run) => run.conversationId === conversation.id && visibleTurnIds.has(run.turnId)
      )
    );
    const artifacts = [...(this.promptVersions.get(conversation.id) ?? [])]
      .filter((version) => visibleTurnIds.has(version.turnId))
      .sort((left, right) => {
        const versionDelta = left.version - right.version;
        if (versionDelta !== 0) {
          return versionDelta;
        }
        return left.createdAt.localeCompare(right.createdAt);
      })
      .map((version) => structuredClone(version));

    return buildPromptObservabilitySummary({
      conversationId: conversation.id,
      turns,
      runs,
      artifacts,
    });
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
        creativeBrief: this.buildCreativeBrief([], nextConversation.promptState),
        promptState: cloneConversationCreativeState(nextConversation.promptState),
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
    if (!this.turns.has(input.turn.id)) {
      this.turns.set(input.turn.id, {
        ...input.turn,
        conversationId: input.conversationId,
        isHidden: false,
        updatedAt: input.turn.createdAt,
      });
    }
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
    for (const additionalRun of input.additionalRuns ?? []) {
      this.runs.set(additionalRun.id, {
        ...additionalRun,
        conversationId: input.conversationId,
        updatedAt: additionalRun.createdAt,
      });
    }
    for (const version of input.promptVersions ?? []) {
      const existing = this.promptVersions.get(input.conversationId) ?? [];
      this.promptVersions.set(input.conversationId, [...existing, version]);
    }
    this.touchConversation(input.conversationId, input.turn.createdAt);
  }

  async createTurn(input: { conversationId: string; turn: PersistedGenerationTurn }) {
    if (this.turns.has(input.turn.id)) {
      return;
    }
    this.turns.set(input.turn.id, {
      ...input.turn,
      conversationId: input.conversationId,
      isHidden: false,
      updatedAt: input.turn.createdAt,
    });
    this.resultsByTurnId.set(input.turn.id, [...input.turn.results]);
    this.touchConversation(input.conversationId, input.turn.createdAt);
  }

  async createRun(input: CreateChatRunInput) {
    this.runs.set(input.run.id, {
      ...input.run,
      conversationId: input.conversationId,
      updatedAt: input.run.createdAt,
    });
    if (input.attempt) {
      this.attempts.set(input.attempt.id, {
        ...input.attempt,
        conversationId: input.conversationId,
      });
    }
    this.touchConversation(input.conversationId, input.run.createdAt);
  }

  async createPromptVersions(input: CreatePromptVersionsInput) {
    const existing = this.promptVersions.get(input.conversationId) ?? [];
    this.promptVersions.set(input.conversationId, [
      ...existing,
      ...input.versions.map((version) => structuredClone(version)),
    ]);
  }

  async updateConversationPromptState(input: UpdateConversationPromptStateInput) {
    const conversation = this.conversations.get(input.conversationId);
    if (!conversation) {
      throw new ChatConversationNotFoundError(input.conversationId);
    }

    if (conversation.promptState.revision !== input.expectedRevision) {
      throw new ChatPromptStateConflictError(input.conversationId);
    }

    this.conversations.set(input.conversationId, {
      ...conversation,
      promptState: cloneConversationCreativeState(input.promptState),
      updatedAt: input.updatedAt,
    });
  }

  private resolveAcceptedCreativeState(
    conversationId: string,
    turnId: string
  ): PersistedConversationCreativeState["committed"] | null {
    const initialTurn = this.turns.get(turnId);
    if (!initialTurn) {
      return null;
    }

    const promptVersions = this.promptVersions.get(conversationId) ?? [];
    const visited = new Set<string>();
    let semanticTurnId: string | null = initialTurn.retryOfTurnId ?? turnId;

    while (semanticTurnId && !visited.has(semanticTurnId)) {
      visited.add(semanticTurnId);

      const matchedVersion = [...promptVersions]
        .filter(
          (version) => version.turnId === semanticTurnId && version.candidateStateAfter !== null
        )
        .sort((left, right) => {
          const stageDelta =
            PROMPT_STAGE_PRIORITY[right.stage] - PROMPT_STAGE_PRIORITY[left.stage];
          if (stageDelta !== 0) {
            return stageDelta;
          }
          const attemptDelta = (right.attempt ?? 0) - (left.attempt ?? 0);
          if (attemptDelta !== 0) {
            return attemptDelta;
          }
          const versionDelta = right.version - left.version;
          if (versionDelta !== 0) {
            return versionDelta;
          }
          return right.createdAt.localeCompare(left.createdAt);
        })[0];

      if (matchedVersion?.candidateStateAfter) {
        return cloneCreativeState(matchedVersion.candidateStateAfter);
      }

      semanticTurnId = this.turns.get(semanticTurnId)?.retryOfTurnId ?? null;
    }

    return null;
  }

  async acceptConversationTurn(input: AcceptConversationTurnInput) {
    const turn = this.turns.get(input.turnId);
    if (!turn) {
      throw new ChatConversationNotFoundError();
    }

    const conversation = this.conversations.get(turn.conversationId);
    if (!conversation || conversation.userId !== input.userId) {
      throw new ChatConversationNotFoundError(turn.conversationId);
    }

    const asset = this.assets.get(input.assetId);
    if (!asset || asset.conversationId !== conversation.id) {
      throw new Error(`Asset ${input.assetId} was not found in conversation ${conversation.id}.`);
    }

    const previousBaseAssetId = conversation.promptState.baseAssetId;
    const nextPromptState = cloneConversationCreativeState(conversation.promptState);
    const acceptedCreativeState =
      nextPromptState.candidate && nextPromptState.candidateTurnId === input.turnId
        ? cloneCreativeState(nextPromptState.candidate)
        : this.resolveAcceptedCreativeState(conversation.id, input.turnId);

    if (!acceptedCreativeState) {
      throw new Error(`Turn ${input.turnId} is missing prompt compiler state.`);
    }

    nextPromptState.committed = acceptedCreativeState;
    nextPromptState.candidate = null;
    nextPromptState.candidateTurnId = null;
    nextPromptState.baseAssetId = input.assetId;
    nextPromptState.revision += 1;

    this.conversations.set(conversation.id, {
      ...conversation,
      promptState: nextPromptState,
      updatedAt: input.acceptedAt,
    });

    const edgeId = createId("accepted-edge");
    this.assetEdges.set(edgeId, {
      id: edgeId,
      conversationId: conversation.id,
      sourceAssetId: previousBaseAssetId ?? input.assetId,
      targetAssetId: input.assetId,
      edgeType: "accepted_as_final",
      turnId: input.turnId,
      runId: asset.runId,
      createdAt: input.acceptedAt,
    });

    this.touchConversation(conversation.id, input.acceptedAt);
    return this.getConversationSnapshot(input.userId, conversation.id);
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
      promptState: cloneConversationCreativeState(conversation.promptState),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
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
