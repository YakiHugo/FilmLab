import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AVAILABLE_MODELS, DEFAULT_MODEL, type ModelOption } from "@/lib/ai/provider";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { useChatStore } from "@/stores/chatStore";
import type { ChatConversation } from "@/types";
import type { ChatToolResult } from "../types";
import { useChatTools } from "./useChatTools";

const MODEL_STORAGE_KEY = "filmlab:hub:model";
const PERSIST_DEBOUNCE_MS = 250;

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

interface SendUserMessageInput {
  text: string;
  files?: FileList | null;
}

interface UseChatSessionResult {
  messages: UIMessage[];
  status: string;
  isLoading: boolean;
  error: Error | undefined;
  stop: () => void;
  retryLast: () => void;
  activeConversationId: string | null;
  conversations: ChatConversation[];
  selectedModel: ModelOption;
  setSelectedModel: (modelId: string) => void;
  sendUserMessage: (input: SendUserMessageInput) => void;
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
  const selectedAssetIds = useAssetStore((state) => state.selectedAssetIds);
  const assets = useAssetStore((state) => state.assets);
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const { dispatchTool } = useChatTools();
  const [selectedModel, setSelectedModelState] = useState<ModelOption>(loadSavedModel);
  const [toolResults, setToolResults] = useState<ChatToolResult[]>([]);
  const hydratedConversationIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeConversationIdRef = useRef<string | null>(activeConversationId);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const selectedAssetsContext = useMemo(
    () =>
      assets
        .filter((asset) => selectedAssetIds.includes(asset.id))
        .slice(0, 8)
        .map((asset) => ({
          id: asset.id,
          name: asset.name,
          tags: asset.tags ?? [],
          source: asset.source ?? "imported",
        })),
    [assets, selectedAssetIds]
  );

  const activeCanvas = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? null,
    [documents, activeDocumentId]
  );

  const stableTransportBody = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.id,
      context: {
        assetCount: assets.length,
        selectedAssetCount: selectedAssetIds.length,
        selectedAssets: selectedAssetsContext,
        activeCanvas: activeCanvas
          ? {
              id: activeCanvas.id,
              name: activeCanvas.name,
              elementCount: activeCanvas.elements.length,
              size: { width: activeCanvas.width, height: activeCanvas.height },
            }
          : null,
      },
    }),
    [activeCanvas, assets.length, selectedAssetIds.length, selectedAssetsContext, selectedModel.id, selectedModel.provider]
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai-chat",
        body: stableTransportBody,
      }),
    [stableTransportBody]
  );

  const { messages, sendMessage, setMessages, status, stop, error, regenerate, addToolOutput } = useChat({
    id: activeConversationId ?? "hub-default",
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: async ({ toolCall }) => {
      const args =
        "input" in toolCall && toolCall.input && typeof toolCall.input === "object"
          ? (toolCall.input as Record<string, unknown>)
          : {};

      const result = await dispatchTool({
        toolName: "toolName" in toolCall ? toolCall.toolName : "unknown",
        args,
        toolCallId: toolCall.toolCallId,
      });
      setToolResults((previous) => [result, ...previous].slice(0, 20));

      if (result.success) {
        await addToolOutput({
          tool: toolCall.toolName as never,
          toolCallId: toolCall.toolCallId,
          output: {
            success: true,
            ...result.data,
          },
        } as never);
      } else {
        await addToolOutput({
          state: "output-error",
          tool: toolCall.toolName as never,
          toolCallId: toolCall.toolCallId,
          errorText: result.error ?? "Tool execution failed.",
        } as never);
      }
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
    if (!activeConversationId) {
      hydratedConversationIdRef.current = null;
      setMessages([]);
      setToolResults([]);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      return;
    }

    setToolResults([]);
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    hydratedConversationIdRef.current = null;
  }, [activeConversationId, setMessages]);

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

  const persistedSignature = useMemo(
    () => messageSignature(activeConversation?.messages ?? []),
    [activeConversation?.messages]
  );

  useEffect(() => {
    if (!activeConversationId) {
      return;
    }

    const localSignature = messageSignature(messages);
    if (localSignature === persistedSignature) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    const scheduledConversationId = activeConversationId;
    saveTimerRef.current = setTimeout(() => {
      if (activeConversationIdRef.current !== scheduledConversationId) {
        return;
      }
      void persistMessages(scheduledConversationId, messages);
    }, PERSIST_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [activeConversationId, messages, persistedSignature, persistMessages]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    },
    []
  );

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
    (input: SendUserMessageInput) => {
      const text = input.text.trim();
      const files = input.files && input.files.length > 0 ? input.files : undefined;
      if (!text && !files) {
        return;
      }

      const payload = files ? (text ? { text, files } : { files }) : { text };
      void sendMessage(payload as never, {
        body: stableTransportBody,
      });
    },
    [sendMessage, stableTransportBody]
  );

  const newConversation = useCallback(async () => {
    const conversation = await createConversation();
    setActiveConversationId(conversation.id);
    setMessages([]);
    setToolResults([]);
  }, [createConversation, setActiveConversationId, setMessages]);

  const removeConversation = useCallback(
    async (id: string) => {
      await deleteConversation(id);
    },
    [deleteConversation]
  );

  const retryLast = useCallback(() => {
    void regenerate();
  }, [regenerate]);

  return {
    messages,
    status,
    isLoading: status === "submitted" || status === "streaming" || isStoreLoading,
    error,
    stop: () => {
      void stop();
    },
    retryLast,
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
