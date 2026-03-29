import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEventHandler,
} from "react";
import type { CanvasRenderableTextElement, CanvasTextElement } from "@/types";
import { fitCanvasTextElementToContent } from "../textStyle";
import {
  runCanvasTextSessionEffects,
  type CanvasTextSessionPort,
} from "../textSessionRunner";
import {
  createCanvasTextSessionSnapshot,
  reduceCanvasTextSession,
  type CanvasTextSessionEvent,
  type CanvasTextSessionReducerOptions,
  type CanvasTextSessionSnapshot,
} from "../textSessionState";

interface UseCanvasTextSessionOptions {
  port: CanvasTextSessionPort;
}

export interface CanvasTextSessionActions {
  begin: (
    element: CanvasRenderableTextElement | CanvasTextElement,
    options?: { mode?: "existing" | "create" }
  ) => void;
  cancel: () => void;
  changeValue: (nextValue: string) => void;
  commit: () => Promise<"committed" | "noop" | "skipped">;
  handleInputKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  updateDraft: (updater: (element: CanvasTextElement) => CanvasTextElement) => void;
}

interface UseCanvasTextSessionResult {
  actions: CanvasTextSessionActions;
  session: CanvasTextSessionSnapshot;
}

const TEXT_SESSION_REDUCER_OPTIONS: CanvasTextSessionReducerOptions = {
  fitDraft: fitCanvasTextElementToContent,
};

export function useCanvasTextSession({
  port,
}: UseCanvasTextSessionOptions): UseCanvasTextSessionResult {
  const [session, setSession] = useState(createCanvasTextSessionSnapshot);
  const sessionRef = useRef(session);
  const portRef = useRef(port);
  const commitPromiseRef = useRef<Promise<"committed" | "noop" | "skipped"> | null>(null);
  const queuedBeginRef = useRef<Parameters<CanvasTextSessionActions["begin"]> | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    portRef.current = port;
  }, [port]);

  const dispatchEvent = useCallback((event: CanvasTextSessionEvent) => {
    const previousSession = sessionRef.current;
    const result = reduceCanvasTextSession(previousSession, event, TEXT_SESSION_REDUCER_OPTIONS);

    if (result.session !== previousSession) {
      sessionRef.current = result.session;
      setSession(result.session);
    }

    return result;
  }, []);

  const beginSession = useCallback(
    (
      element: CanvasRenderableTextElement | CanvasTextElement,
      options?: { mode?: "existing" | "create" }
    ) => {
      dispatchEvent({
        type: "begin",
        activeWorkbenchId: portRef.current.getActiveWorkbenchId(),
        element,
        mode: options?.mode,
      });
    },
    [dispatchEvent]
  );

  useEffect(() => {
    if (!session.id) {
      return;
    }

    const activeWorkbenchId = port.getActiveWorkbenchId();
    if (session.workbenchId === activeWorkbenchId) {
      return;
    }

    const result = dispatchEvent({
      type: "sync-active-workbench",
      activeWorkbenchId,
    });
    if (result.effects.length > 0) {
      void runCanvasTextSessionEffects({
        effects: result.effects,
        port: portRef.current,
      });
    }
  }, [dispatchEvent, port, session.id, session.workbenchId]);

  const begin = useCallback<CanvasTextSessionActions["begin"]>(
    (element, options) => {
      if (sessionRef.current.status === "committing") {
        queuedBeginRef.current = [element, options];
        return;
      }

      queuedBeginRef.current = null;
      beginSession(element, options);
    },
    [beginSession]
  );

  const cancel = useCallback(() => {
    const result = dispatchEvent({
      type: "cancel",
    });
    if (result.effects.length === 0) {
      return;
    }

    void runCanvasTextSessionEffects({
      effects: result.effects,
      port: portRef.current,
    });
  }, [dispatchEvent]);

  const commit = useCallback(async () => {
    if (sessionRef.current.status === "committing" && commitPromiseRef.current) {
      return commitPromiseRef.current;
    }

    const result = dispatchEvent({
      type: "prepare-commit",
      activeWorkbenchId: portRef.current.getActiveWorkbenchId(),
    });

    if (result.outcome === "noop") {
      return "noop";
    }
    if (result.outcome !== "pending") {
      return "skipped";
    }

    const commitPromise = (async () => {
      try {
        await runCanvasTextSessionEffects({
          effects: result.effects,
          port: portRef.current,
        });
        dispatchEvent({
          type: "finish-commit",
          didCommit: true,
          sessionToken: result.session.sessionToken,
        });
        const queuedBegin = queuedBeginRef.current;
        queuedBeginRef.current = null;
        if (queuedBegin) {
          beginSession(...queuedBegin);
        }
        return "committed" as const;
      } catch {
        dispatchEvent({
          type: "finish-commit",
          didCommit: false,
          sessionToken: result.session.sessionToken,
        });
        queuedBeginRef.current = null;
        return "skipped" as const;
      } finally {
        commitPromiseRef.current = null;
      }
    })();

    commitPromiseRef.current = commitPromise;
    return commitPromise;
  }, [dispatchEvent]);

  const changeValue = useCallback(
    (nextValue: string) => {
      const result = dispatchEvent({
        type: "change-value",
        activeWorkbenchId: portRef.current.getActiveWorkbenchId(),
        nextValue,
      });

      if (result.effects.length === 0) {
        return;
      }

      void runCanvasTextSessionEffects({
        effects: result.effects,
        port: portRef.current,
      });
    },
    [dispatchEvent]
  );

  const updateDraft = useCallback(
    (updater: (element: CanvasTextElement) => CanvasTextElement) => {
      dispatchEvent({
        type: "update-draft",
        activeWorkbenchId: portRef.current.getActiveWorkbenchId(),
        updater,
      });
    },
    [dispatchEvent]
  );

  const handleInputKeyDown = useCallback<KeyboardEventHandler<HTMLTextAreaElement>>(
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void commit();
      }
    },
    [cancel, commit]
  );

  const actions = useMemo<CanvasTextSessionActions>(
    () => ({
      begin,
      cancel,
      changeValue,
      commit,
      handleInputKeyDown,
      updateDraft,
    }),
    [begin, cancel, changeValue, commit, handleInputKeyDown, updateDraft]
  );

  return {
    actions,
    session,
  };
}
