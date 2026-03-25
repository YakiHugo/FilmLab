import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEventHandler,
} from "react";
import type {
  CanvasRenderableNode,
  CanvasRenderableTextElement,
  CanvasTextElement,
} from "@/types";
import { isCanvasTextElementEditable } from "../elements/TextElement";
import { type EditingTextMode } from "../textSession";
import {
  hasCanvasTextSessionPersistEffect,
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
import { createTextMutationQueue, type TextMutationQueue } from "../textMutationQueue";
import { fitCanvasTextElementToContent } from "../textStyle";

interface UseCanvasTextSessionOptions {
  elementById: Map<string, CanvasRenderableNode>;
  port: CanvasTextSessionPort;
  selectedElementIds: string[];
  singleSelectedTextElement: CanvasRenderableTextElement | null;
}

export interface CanvasTextSessionActions {
  begin: (
    element: CanvasRenderableTextElement | CanvasTextElement,
    options?: { mode?: EditingTextMode }
  ) => void;
  cancel: () => void;
  changeValue: (nextValue: string) => void;
  commit: () => void;
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
  elementById,
  port,
  selectedElementIds,
  singleSelectedTextElement,
}: UseCanvasTextSessionOptions): UseCanvasTextSessionResult {
  const [session, setSession] = useState(createCanvasTextSessionSnapshot);
  const sessionRef = useRef(session);
  const textMutationQueueRef = useRef<TextMutationQueue | null>(null);
  const portRef = useRef(port);

  if (!textMutationQueueRef.current) {
    textMutationQueueRef.current = createTextMutationQueue();
  }

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

    runCanvasTextSessionEffects({
      effects: result.effects,
      mutationQueue: textMutationQueueRef.current!,
      onSourcePersistFinished: (payload) => {
        dispatchEvent({
          type: "source-persist-finished",
          activeWorkbenchId: portRef.current.getActiveWorkbenchId(),
          availableWorkbenchIds: portRef.current!.getAvailableWorkbenchIds(),
          didPersistDraft: payload.didPersistDraft,
          sessionToken: payload.sessionToken,
          transitionToken: payload.transitionToken,
        });
      },
      port: portRef.current!,
    });

    if (
      previousSession.status !== "persisting-source" &&
      result.session.status === "persisting-source" &&
      !hasCanvasTextSessionPersistEffect(result.effects)
    ) {
      dispatchEvent({
        type: "source-persist-finished",
        activeWorkbenchId: portRef.current.getActiveWorkbenchId(),
        availableWorkbenchIds: portRef.current!.getAvailableWorkbenchIds(),
        didPersistDraft: false,
        sessionToken: result.session.sessionToken,
        transitionToken: result.session.transitionToken,
      });
    }
  }, []);

  const editingTextElement = useMemo(() => {
    if (!session.id) {
      return null;
    }

    const element = elementById.get(session.id);
    return element?.type === "text" ? element : null;
  }, [elementById, session.id]);

  const activeTextElement =
    session.draft ??
    editingTextElement ??
    (session.id ? singleSelectedTextElement : null);
  const isSessionElementEditable = isCanvasTextElementEditable(activeTextElement);

  useEffect(() => {
    if (!session.id) {
      return;
    }

    dispatchEvent({
      type: "sync-environment",
      activeWorkbenchId: port.getActiveWorkbenchId(),
      availableWorkbenchIds: port.getAvailableWorkbenchIds(),
      hasEditingTextElement: Boolean(editingTextElement),
      isEditingTextSelected: selectedElementIds.includes(session.id),
      isSessionElementEditable,
    });
  }, [
    dispatchEvent,
    editingTextElement,
    isSessionElementEditable,
    port,
    selectedElementIds,
    session.id,
  ]);

  const begin = useCallback<CanvasTextSessionActions["begin"]>(
    (element, options) => {
      dispatchEvent({
        type: "begin",
        activeWorkbenchId: portRef.current.getActiveWorkbenchId(),
        element,
        mode: options?.mode,
      });
    },
    [dispatchEvent]
  );

  const cancel = useCallback(() => {
    dispatchEvent({
      type: "cancel",
      availableWorkbenchIds: portRef.current!.getAvailableWorkbenchIds(),
    });
  }, [dispatchEvent]);

  const commit = useCallback(() => {
    dispatchEvent({
      type: "commit",
      activeWorkbenchId: portRef.current.getActiveWorkbenchId(),
    });
  }, [dispatchEvent]);

  const changeValue = useCallback((nextValue: string) => {
    dispatchEvent({
      type: "change-value",
      activeWorkbenchId: portRef.current.getActiveWorkbenchId(),
      nextValue,
    });
  }, [dispatchEvent]);

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
        commit();
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
