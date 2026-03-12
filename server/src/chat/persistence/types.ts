import type {
  GenerationJobSnapshot,
  PersistedGenerationTurn,
  PersistedImageSession,
  PersistedResultItem,
} from "../../../../shared/chatImageTypes";

export interface ChatConversationRecord {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export class ChatConversationNotFoundError extends Error {
  constructor(conversationId?: string) {
    super(
      conversationId
        ? `Conversation ${conversationId} was not found.`
        : "Conversation was not found."
    );
    this.name = "ChatConversationNotFoundError";
  }
}

export interface ChatAttemptRecord {
  id: string;
  jobId: string;
  attemptNo: number;
  status: "running" | "succeeded" | "failed";
  error: string | null;
  providerRequestId: string | null;
  providerTaskId: string | null;
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface CreateChatGenerationInput {
  conversationId: string;
  turn: PersistedGenerationTurn;
  job: GenerationJobSnapshot;
  attempt: ChatAttemptRecord;
}

export interface CompleteChatGenerationSuccessInput {
  conversationId: string;
  turnId: string;
  jobId: string;
  attemptId: string;
  logicalModel: string;
  deploymentId: string;
  runtimeProvider: string;
  providerModel: string;
  providerRequestId?: string;
  providerTaskId?: string;
  warnings: string[];
  results: PersistedResultItem[];
  completedAt: string;
}

export interface CompleteChatGenerationFailureInput {
  conversationId: string;
  turnId: string;
  jobId: string;
  attemptId: string;
  error: string;
  completedAt: string;
}

export interface ChatStateRepository {
  getConversationById(userId: string, conversationId: string): Promise<ChatConversationRecord | null>;
  getOrCreateActiveConversation(userId: string): Promise<ChatConversationRecord>;
  getConversationSnapshot(userId: string, conversationId?: string): Promise<PersistedImageSession>;
  clearActiveConversation(userId: string): Promise<PersistedImageSession>;
  deleteTurn(userId: string, turnId: string): Promise<PersistedImageSession | null>;
  createGeneration(input: CreateChatGenerationInput): Promise<void>;
  completeGenerationSuccess(input: CompleteChatGenerationSuccessInput): Promise<void>;
  completeGenerationFailure(input: CompleteChatGenerationFailureInput): Promise<void>;
  turnExists(userId: string, conversationId: string, turnId: string): Promise<boolean>;
}
