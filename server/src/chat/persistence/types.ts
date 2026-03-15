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
} from "../../../../shared/chatImageTypes";
import type { PromptVersionRecord } from "../../gateway/prompt/types";

export interface ChatConversationRecord {
  id: string;
  userId: string;
  promptState: PersistedConversationCreativeState;
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

export class ChatPromptStateConflictError extends Error {
  constructor(conversationId: string) {
    super(`Prompt state for conversation ${conversationId} was updated concurrently.`);
    this.name = "ChatPromptStateConflictError";
  }
}

export interface ChatAttemptRecord {
  id: string;
  jobId: string;
  runId: string | null;
  attemptNo: number;
  status: "running" | "succeeded" | "failed";
  error: string | null;
  providerRequestId: string | null;
  providerTaskId: string | null;
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface PersistedGeneratedImageRecord {
  id: string;
  ownerUserId: string;
  conversationId: string;
  turnId: string;
  mimeType: string;
  sizeBytes: number;
  blobData: Buffer;
  visibility: "private";
  privateTokenHash: string;
  createdAt: string;
}

export interface GeneratedImageContent {
  buffer: Buffer;
  mimeType: string;
}

export interface CreateChatGenerationInput {
  conversationId: string;
  turn: PersistedGenerationTurn;
  job: GenerationJobSnapshot;
  run: PersistedRunRecord;
  attempt: ChatAttemptRecord;
}

export interface CreateChatTurnInput {
  conversationId: string;
  turn: PersistedGenerationTurn;
}

export interface CreateChatRunInput {
  conversationId: string;
  run: PersistedRunRecord;
  attempt?: ChatAttemptRecord | null;
}

export interface CreatePromptVersionsInput {
  conversationId: string;
  versions: PromptVersionRecord[];
}

export interface UpdateConversationPromptStateInput {
  conversationId: string;
  promptState: PersistedConversationCreativeState;
  expectedRevision: number;
  updatedAt: string;
}

export interface AcceptConversationTurnInput {
  userId: string;
  turnId: string;
  assetId: string;
  acceptedAt: string;
}

export interface CompleteChatGenerationSuccessInput {
  conversationId: string;
  turnId: string;
  jobId: string;
  runId: string;
  attemptId: string;
  logicalModel: string;
  deploymentId: string;
  runtimeProvider: string;
  providerModel: string;
  providerRequestId?: string;
  providerTaskId?: string;
  warnings: string[];
  generatedImages: PersistedGeneratedImageRecord[];
  results: PersistedResultItem[];
  assets: PersistedAssetRecord[];
  assetEdges: PersistedAssetEdgeRecord[];
  run: Pick<
    PersistedRunRecord,
    "status" | "prompt" | "assetIds" | "referencedAssetIds" | "telemetry" | "executedTarget"
  >;
  completedAt: string;
}

export interface CompleteChatGenerationFailureInput {
  conversationId: string;
  turnId: string;
  jobId: string;
  runId: string;
  attemptId: string;
  error: string;
  completedAt: string;
}

export interface ChatStateRepository {
  close(): Promise<void>;
  getConversationById(userId: string, conversationId: string): Promise<ChatConversationRecord | null>;
  getOrCreateActiveConversation(userId: string): Promise<ChatConversationRecord>;
  getConversationSnapshot(userId: string, conversationId?: string): Promise<PersistedImageSession>;
  getPromptArtifactsForTurn(userId: string, turnId: string): Promise<TurnPromptArtifactsResponse | null>;
  getPromptObservabilityForConversation(
    userId: string,
    conversationId?: string
  ): Promise<PromptObservabilitySummaryResponse | null>;
  clearActiveConversation(userId: string): Promise<PersistedImageSession>;
  deleteTurn(userId: string, turnId: string): Promise<PersistedImageSession | null>;
  getGeneratedImageByCapability(
    imageId: string,
    token: string
  ): Promise<GeneratedImageContent | null>;
  createTurn(input: CreateChatTurnInput): Promise<void>;
  createGeneration(input: CreateChatGenerationInput): Promise<void>;
  createRun(input: CreateChatRunInput): Promise<void>;
  createPromptVersions(input: CreatePromptVersionsInput): Promise<void>;
  updateConversationPromptState(input: UpdateConversationPromptStateInput): Promise<void>;
  acceptConversationTurn(input: AcceptConversationTurnInput): Promise<PersistedImageSession>;
  completeGenerationSuccess(input: CompleteChatGenerationSuccessInput): Promise<void>;
  completeGenerationFailure(input: CompleteChatGenerationFailureInput): Promise<void>;
  turnExists(userId: string, conversationId: string, turnId: string): Promise<boolean>;
}
