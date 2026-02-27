import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AVAILABLE_MODELS, DEFAULT_MODEL, type ModelOption } from "@/lib/ai/provider";
import { useChatStore } from "@/stores/chatStore";
import type { ChatConversation } from "@/types";
import type { ChatToolResult } from "../types";
import { useChatTools } from "./useChatTools";

const MODEL_STORAGE_KEY = "filmlab:hub:model";

const loadSavedModel = (): ModelOption => {
  if (typeof window === "undefined") {
    return DEFAULT_MODEL;
  }
  try {
    const raw = localStorage.getItem(MODEL_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_MODEL;
    }
    return JSON.parse(raw) as ModelOption;
  } catch {
    return DEFAULT_MODEL;
  }
};

const messageText = (message: UIMessage) =>
  message.parts
    ?.filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim() ?? "";

const messageSignature = (messages: UIMessage[]) =>
  messages
    .map((message) => `${message.id}|${message.role}|${message.parts?.length ?? 0}|${messageText(message)}`)
    .join("||");

interface UseChatSessionResult {
  messages: UIMessage[];
  status: string;
  isLoading: boolean;
  error: Error | undefined;
  stop: () => void;
  activeConversationId: string | null;
  conversations: ChatConversation[];
  selectedModel: ModelOption;
  setSelectedModel: (modelId: string) => void;
  sendUserMessage: (text: string) => void;
  newConversation: () => Promise<void>;
  setActiveConversationId: (id: string | null) => void;
  removeConversation: (id: string) => Promise<void>;
  toolResults: ChatToolResult[];
}

export function useChatSession(): UseChatSessionResult {
  const {
    conversations,
    activeConversationId,
    isLoading: isStoreLoading,
    init,
    createConversation,
    setActiveConversationId,
    setMessages: persistMessages,
    deleteConversation,
  } = useChatStore((state) => ({
    conversations: state.conversations,
    activeConversationId: state.activeConversationId,
    isLoading: state.isLoading,
    init: state.init,
    createConversation: state.createConversation,
    setActiveConversationId: state.setActiveConversationId,
    setMessages: state.setMessages,
    deleteConversation: state.deleteConversation,
  }));
  const { dispatchTool } = useChatTools();
  const [selectedModel, setSelectedModelState] = useState<ModelOption>(loadSavedModel);
  const [toolResults, setToolResults] = useState<ChatToolResult[]>([]);
  const hydratedConversationIdRef = useRef<string | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const stableTransportBody = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.id,
    }),
    [selectedModel.id, selectedModel.provider]
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai-chat",
        body: stableTransportBody,
      }),
    [stableTransportBody]
  );

  const {
    messages,
    sendMessage,
    setMessages,
    status,
    stop,
    error,
  } = useChat({
    id: activeConversationId ?? "hub-default",
    transport,
    onToolCall: async ({ toolCall }) => {
      const args =
        "args" in toolCall && toolCall.args && typeof toolCall.args === "object"
          ? (toolCall.args as Record<string, unknown>)
          : {};
      const result = await dispatchTool({
        toolName: toolCall.toolName,
        args,
      });
      setToolResults((previous) => [result, ...previous].slice(0, 12));
    },
  });

  useEffect(() => {
    void init("hub");
  }, [init]);

  useEffect(() => {
    if (isStoreLoading || activeConversationId) {
      return;
    }
    void createConversation();
  }, [isStoreLoading, activeConversationId, createConversation]);

  useEffect(() => {
    if (!activeConversation || !activeConversationId) {
      return;
    }
    if (hydratedConversationIdRef.current === activeConversationId) {
      return;
    }
    hydratedConversationIdRef.current = activeConversationId;
    setMessages(activeConversation.messages);
  }, [activeConversation, activeConversationId, setMessages]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!activeConversationId) {
      return;
    }
    const persistedMessages = conversations.find((item) => item.id === activeConversationId)?.messages ?? [];
    if (messageSignature(messages) === messageSignature(persistedMessages)) {
      return;
    }
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      void persistMessages(activeConversationId, messages);
    }, 250);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [activeConversationId, conversations, messages, persistMessages]);

  const setSelectedModel = useCallback((modelId: string) => {
    const matched =
      AVAILABLE_MODELS.find((model) => `${model.provider}:${model.id}` === modelId || model.id === modelId) ??
      DEFAULT_MODEL;
    setSelectedModelState(matched);
    if (typeof window !== "undefined") {
      localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(matched));
    }
  }, []);

  const sendUserMessage = useCallback(
    (text: string) => {
      if (!text.trim()) {
        return;
      }
      void sendMessage(
        { text },
        {
          body: {
            provider: selectedModel.provider,
            model: selectedModel.id,
          },
        }
      );
    },
    [selectedModel.id, selectedModel.provider, sendMessage]
  );

  const newConversation = useCallback(async () => {
    const conversation = await createConversation();
    setActiveConversationId(conversation.id);
    setMessages([]);
  }, [createConversation, setActiveConversationId, setMessages]);

  const removeConversation = useCallback(
    async (id: string) => {
      await deleteConversation(id);
    },
    [deleteConversation]
  );

  return {
    messages,
    status,
    isLoading: status === "submitted" || status === "streaming" || isStoreLoading,
    error,
    stop,
    activeConversationId,
    conversations,
    selectedModel,
    setSelectedModel,
    sendUserMessage,
    newConversation,
    setActiveConversationId,
    removeConversation,
    toolResults,
  };
}
