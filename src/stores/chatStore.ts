import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { UIMessage } from "ai";
import {
  deleteChatSession,
  loadChatSessionsByScope,
  saveChatSession,
  type PersistedChatMessage,
  type ChatSessionRecord,
} from "@/lib/db";
import { DEFAULT_MODEL } from "@/lib/ai/provider";
import type { ChatConversation, ChatScope } from "@/types";

interface ChatState {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  scope: ChatScope;
  isLoading: boolean;
  init: (scope?: ChatScope) => Promise<void>;
  createConversation: (title?: string) => Promise<ChatConversation>;
  setActiveConversationId: (id: string | null) => void;
  setMessages: (conversationId: string, messages: UIMessage[]) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  clearScopeConversations: () => Promise<void>;
}

const nowIso = () => new Date().toISOString();

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `chat-${Date.now()}`;
};

const messagePreview = (message: UIMessage | undefined) => {
  if (!message) {
    return "";
  }
  const text = message.parts
    ?.filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
  return text ?? "";
};

const toUiMessage = (message: PersistedChatMessage, index: number): UIMessage => {
  const parts: UIMessage["parts"] =
    Array.isArray(message.parts) && message.parts.length > 0
      ? (message.parts as UIMessage["parts"])
      : typeof message.content === "string"
        ? ([{ type: "text", text: message.content }] as UIMessage["parts"])
        : [];
  return {
    id: message.id ?? `restored-${index}-${Date.now()}`,
    role: message.role as UIMessage["role"],
    parts,
  };
};

const toPersistedMessage = (message: UIMessage): PersistedChatMessage => ({
  id: message.id,
  role: message.role,
  parts: message.parts,
  content: messagePreview(message),
});

const toConversation = (record: ChatSessionRecord): ChatConversation => ({
  id: record.id,
  title: record.title ?? "New chat",
  scope: record.scope ?? "hub",
  messages: record.messages.map(toUiMessage),
  model: record.model,
  provider: record.provider,
  createdAt: record.createdAt ?? record.updatedAt,
  updatedAt: record.updatedAt,
});

const toRecord = (conversation: ChatConversation): ChatSessionRecord => ({
  id: conversation.id,
  title: conversation.title,
  scope: conversation.scope,
  messages: conversation.messages.map(toPersistedMessage),
  model: conversation.model,
  provider: conversation.provider,
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
});

export const useChatStore = create<ChatState>()(
  devtools(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      scope: "hub",
      isLoading: false,
      init: async (scope = "hub") => {
        set({ isLoading: true, scope });
        const records = await loadChatSessionsByScope(scope);
        const conversations = records.map(toConversation);
        set({
          conversations,
          activeConversationId: conversations[0]?.id ?? null,
          isLoading: false,
        });
      },
      createConversation: async (title = "New chat") => {
        const now = nowIso();
        const conversation: ChatConversation = {
          id: createId(),
          title,
          scope: get().scope,
          messages: [],
          model: DEFAULT_MODEL.id,
          provider: DEFAULT_MODEL.provider,
          createdAt: now,
          updatedAt: now,
        };
        await saveChatSession(toRecord(conversation));
        set((state) => ({
          conversations: [conversation, ...state.conversations],
          activeConversationId: conversation.id,
        }));
        return conversation;
      },
      setActiveConversationId: (activeConversationId) => set({ activeConversationId }),
      setMessages: async (conversationId, messages) => {
        const conversation = get().conversations.find((item) => item.id === conversationId);
        if (!conversation) {
          return;
        }
        const nextConversation: ChatConversation = {
          ...conversation,
          messages,
          updatedAt: nowIso(),
          title:
            conversation.title === "New chat" && messages[0]?.role === "user"
              ? messagePreview(messages[0]).slice(0, 42) || "New chat"
              : conversation.title,
        };
        await saveChatSession(toRecord(nextConversation));
        set((state) => ({
          conversations: state.conversations.map((item) =>
            item.id === conversationId ? nextConversation : item
          ),
        }));
      },
      deleteConversation: async (id) => {
        await deleteChatSession(id);
        set((state) => {
          const conversations = state.conversations.filter((item) => item.id !== id);
          const activeConversationId =
            state.activeConversationId === id ? (conversations[0]?.id ?? null) : state.activeConversationId;
          return {
            conversations,
            activeConversationId,
          };
        });
      },
      clearScopeConversations: async () => {
        const ids = get().conversations.map((item) => item.id);
        await Promise.all(ids.map((id) => deleteChatSession(id)));
        set({
          conversations: [],
          activeConversationId: null,
        });
      },
    }),
    { name: "ChatStore", enabled: process.env.NODE_ENV === "development" }
  )
);
