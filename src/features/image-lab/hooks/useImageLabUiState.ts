import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ImageLabObservabilityView,
  ImageLabPromptArtifactsView,
  ImageLabTurnView,
} from "../../../../shared/imageLabViews";
import {
  fetchImagePromptArtifacts,
  fetchImagePromptObservability,
} from "@/lib/ai/imageConversation";
import {
  applyPromptArtifactsResponse,
  createPromptArtifactTurnState,
  invalidatePromptObservabilityState,
  shouldFetchPromptArtifacts,
  shouldFetchPromptObservability,
  type PendingConversationTurn,
  type PromptArtifactTurnStateMap,
  type PromptObservabilityState,
  type RuntimeResultState,
  type RuntimeResultStateMap,
} from "./imageLabViewState";

export function useImageLabUiState(
  getConversationId: () => string | null,
  getTurnById: (turnId: string) => ImageLabTurnView | null
) {
  const [savingTurnIds, setSavingTurnIds] = useState<Record<string, boolean>>({});
  const [runtimeResults, setRuntimeResults] = useState<RuntimeResultStateMap>({});
  const [promptArtifacts, setPromptArtifacts] = useState<PromptArtifactTurnStateMap>({});
  const [promptObservability, setPromptObservability] = useState<PromptObservabilityState | null>(
    null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingTurns, setPendingTurns] = useState<PendingConversationTurn[]>([]);

  const promptArtifactsRef = useRef(promptArtifacts);
  const promptObservabilityRef = useRef(promptObservability);
  const promptArtifactAbortRef = useRef(new Map<string, AbortController>());
  const promptObservabilityAbortRef = useRef<AbortController | null>(null);

  promptArtifactsRef.current = promptArtifacts;
  promptObservabilityRef.current = promptObservability;

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setNotice(null);
    }, 4_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notice]);

  const abortAllRequests = useCallback(() => {
    promptArtifactAbortRef.current.forEach((controller) => controller.abort());
    promptArtifactAbortRef.current.clear();
    promptObservabilityAbortRef.current?.abort();
    promptObservabilityAbortRef.current = null;
  }, []);

  useEffect(() => abortAllRequests, [abortAllRequests]);

  const resetPromptObservabilityState = useCallback((conversationId?: string | null) => {
    promptObservabilityAbortRef.current?.abort();
    promptObservabilityAbortRef.current = null;
    setPromptObservability((previous) =>
      invalidatePromptObservabilityState(conversationId ?? null, previous)
    );
  }, []);

  const syncConversationBoundary = useCallback(
    (conversationId?: string | null) => {
      resetPromptObservabilityState(conversationId ?? null);
    },
    [resetPromptObservabilityState]
  );

  const setTurnSavingState = useCallback((turnId: string, isSaving: boolean) => {
    setSavingTurnIds((previous) => {
      if (isSaving) {
        return {
          ...previous,
          [turnId]: true,
        };
      }

      if (!previous[turnId]) {
        return previous;
      }

      const next = { ...previous };
      delete next[turnId];
      return next;
    });
  }, []);

  const updateRuntimeResultState = useCallback(
    (
      turnId: string,
      index: number,
      updater: (state: RuntimeResultState) => RuntimeResultState
    ) => {
      setRuntimeResults((previous) => {
        const turnState = previous[turnId] ?? {};
        return {
          ...previous,
          [turnId]: {
            ...turnState,
            [index]: updater(turnState[index] ?? {}),
          },
        };
      });
    },
    []
  );

  const clearRuntimeTurnState = useCallback((turnId: string) => {
    setSavingTurnIds((previous) => {
      if (!previous[turnId]) {
        return previous;
      }
      const next = { ...previous };
      delete next[turnId];
      return next;
    });
    setRuntimeResults((previous) => {
      if (!previous[turnId]) {
        return previous;
      }
      const next = { ...previous };
      delete next[turnId];
      return next;
    });
  }, []);

  const clearPromptArtifactState = useCallback((turnId: string) => {
    promptArtifactAbortRef.current.get(turnId)?.abort();
    promptArtifactAbortRef.current.delete(turnId);
    setPromptArtifacts((previous) => {
      if (!previous[turnId]) {
        return previous;
      }

      const next = { ...previous };
      delete next[turnId];
      return next;
    });
  }, []);

  const clearAllPromptArtifactState = useCallback(() => {
    promptArtifactAbortRef.current.forEach((controller) => controller.abort());
    promptArtifactAbortRef.current.clear();
    setPromptArtifacts({});
  }, []);

  const loadPromptArtifacts = useCallback(
    async (turnId: string): Promise<ImageLabPromptArtifactsView["versions"] | null> => {
      const turn = getTurnById(turnId);
      if (!turn || turn.status === "loading") {
        return null;
      }

      const cachedState = promptArtifactsRef.current[turnId];
      if (!shouldFetchPromptArtifacts(turn.status, cachedState)) {
        return cachedState?.versions ?? null;
      }

      promptArtifactAbortRef.current.get(turnId)?.abort();
      const controller = new AbortController();
      promptArtifactAbortRef.current.set(turnId, controller);
      setPromptArtifacts((previous) => ({
        ...previous,
        [turnId]: createPromptArtifactTurnState({
          status: "loading",
          versions: previous[turnId]?.versions ?? null,
        }),
      }));

      try {
        const response = await fetchImagePromptArtifacts(turnId, {
          signal: controller.signal,
        });
        if (
          controller.signal.aborted ||
          promptArtifactAbortRef.current.get(turnId) !== controller
        ) {
          return null;
        }

        setPromptArtifacts((previous) => applyPromptArtifactsResponse(previous, response));
        return response.versions;
      } catch (error) {
        if (controller.signal.aborted) {
          return null;
        }

        const message =
          error instanceof Error ? error.message : "Prompt artifacts could not be loaded.";
        setPromptArtifacts((previous) => ({
          ...previous,
          [turnId]: createPromptArtifactTurnState({
            status: "error",
            error: message,
            versions: previous[turnId]?.versions ?? null,
          }),
        }));
        return null;
      } finally {
        if (promptArtifactAbortRef.current.get(turnId) === controller) {
          promptArtifactAbortRef.current.delete(turnId);
        }
      }
    },
    [getTurnById]
  );

  const loadPromptObservability = useCallback(async (): Promise<ImageLabObservabilityView | null> => {
    const conversationId = getConversationId();
    const cachedState = promptObservabilityRef.current;
    if (!shouldFetchPromptObservability(conversationId, cachedState)) {
      return cachedState?.summary ?? null;
    }
    if (!conversationId) {
      return null;
    }

    promptObservabilityAbortRef.current?.abort();
    const controller = new AbortController();
    promptObservabilityAbortRef.current = controller;
    setPromptObservability((previous) => ({
      conversationId,
      status: "loading",
      error: null,
      summary: previous?.conversationId === conversationId ? previous.summary : null,
    }));

    try {
      const response = await fetchImagePromptObservability(conversationId, {
        signal: controller.signal,
      });
      if (controller.signal.aborted || promptObservabilityAbortRef.current !== controller) {
        return null;
      }

      setPromptObservability({
        conversationId: response.conversationId,
        status: "loaded",
        error: null,
        summary: response,
      });
      return response;
    } catch (error) {
      if (controller.signal.aborted) {
        return null;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Prompt observability could not be loaded.";
      setPromptObservability((previous) => ({
        conversationId,
        status: "error",
        error: message,
        summary: previous?.conversationId === conversationId ? previous.summary : null,
      }));
      return null;
    } finally {
      if (promptObservabilityAbortRef.current === controller) {
        promptObservabilityAbortRef.current = null;
      }
    }
  }, [getConversationId]);

  const enqueuePendingTurn = useCallback((turn: PendingConversationTurn) => {
    setPendingTurns((previous) => [turn, ...previous.filter((entry) => entry.id !== turn.id)]);
  }, []);

  const clearPendingTurn = useCallback((turnId: string) => {
    setPendingTurns((previous) => previous.filter((entry) => entry.id !== turnId));
  }, []);

  const clearAllPendingTurns = useCallback(() => {
    setPendingTurns([]);
  }, []);

  return {
    savingTurnIds,
    runtimeResults,
    promptArtifacts,
    promptObservability,
    notice,
    pendingTurns,
    setNotice,
    setTurnSavingState,
    updateRuntimeResultState,
    clearRuntimeTurnState,
    clearPromptArtifactState,
    clearAllPromptArtifactState,
    resetPromptObservabilityState,
    syncConversationBoundary,
    loadPromptArtifacts,
    loadPromptObservability,
    enqueuePendingTurn,
    clearPendingTurn,
    clearAllPendingTurns,
  };
}
