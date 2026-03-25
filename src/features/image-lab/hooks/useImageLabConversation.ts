import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageLabConversationView } from "../../../../shared/imageLabViews";
import { fetchImageConversation } from "@/lib/ai/imageConversation";

export function useImageLabConversation() {
  const [conversation, setConversation] = useState<ImageLabConversationView | null>(null);
  const [isLoadingConversation, setIsLoadingConversation] = useState(true);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);

  const applyConversation = useCallback((nextConversation: ImageLabConversationView) => {
    conversationIdRef.current = nextConversation.conversationId;
    setConversation(nextConversation);
    setConversationError(null);
    setIsLoadingConversation(false);
    return nextConversation;
  }, []);

  const refreshConversation = useCallback(
    async (conversationId?: string) => {
      const requestVersion = requestVersionRef.current + 1;
      requestVersionRef.current = requestVersion;
      requestAbortRef.current?.abort();
      const controller = new AbortController();
      requestAbortRef.current = controller;
      setIsLoadingConversation((previous) => previous || !conversation);
      setConversationError(null);

      try {
        const nextConversation = await fetchImageConversation(
          conversationId ?? conversationIdRef.current ?? undefined,
          { signal: controller.signal }
        );
        if (controller.signal.aborted || requestVersionRef.current !== requestVersion) {
          return null;
        }
        return applyConversation(nextConversation);
      } catch (error) {
        if (controller.signal.aborted) {
          return null;
        }

        setConversationError(
          error instanceof Error ? error.message : "Image conversation could not be loaded."
        );
        setIsLoadingConversation(false);
        return null;
      } finally {
        if (requestAbortRef.current === controller) {
          requestAbortRef.current = null;
        }
      }
    },
    [applyConversation, conversation]
  );

  useEffect(() => {
    void refreshConversation().catch(() => undefined);
    return () => {
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
    };
  }, [refreshConversation]);

  return {
    conversation,
    conversationIdRef,
    isLoadingConversation,
    conversationError,
    applyConversation,
    refreshConversation,
  };
}
