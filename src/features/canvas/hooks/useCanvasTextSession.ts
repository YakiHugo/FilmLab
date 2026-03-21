import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEventHandler,
  type RefObject,
} from "react";
import type {
  CanvasCommand,
  CanvasRenderableNode,
  CanvasRenderableTextElement,
  CanvasTextElement,
} from "@/types";
import { isCanvasTextElementEditable } from "../elements/TextElement";
import {
  resolveTextCommitKind,
  shouldMaterializeCreatedText,
  shouldPersistTextSessionOnWorkbenchSwitch,
  shouldRenderEditingTextOnActiveWorkbench,
  type EditingTextMode,
} from "../textSession";
import { fitCanvasTextElementToContent } from "../textStyle";
import { createTextMutationQueue } from "../textMutationQueue";

type CanvasTextSessionElement = CanvasTextElement | CanvasRenderableTextElement;

interface UseCanvasTextSessionOptions {
  activeWorkbenchId: string | null;
  elementById: Map<string, CanvasRenderableNode>;
  singleSelectedTextElement: CanvasRenderableTextElement | null;
  selectElement: (elementId: string) => void;
  clearSelection: () => void;
  upsertElementInWorkbench: (
    workbenchId: string,
    element: CanvasTextElement | CanvasRenderableTextElement
  ) => Promise<void>;
  executeCommandInWorkbench: (
    workbenchId: string,
    command: CanvasCommand
  ) => Promise<unknown>;
  textEditorRef: RefObject<HTMLDivElement>;
  textToolbarRef: RefObject<HTMLDivElement>;
}

interface UseCanvasTextSessionResult {
  editingTextId: string | null;
  editingTextDraft: CanvasTextElement | null;
  editingTextValue: string;
  editingTextWorkbenchId: string | null;
  activeTextElement: CanvasTextSessionElement | null;
  activeTextElementIsEditable: boolean;
  editingTextRenderElement: CanvasTextSessionElement | null;
  trackedTextOverlayElement: CanvasTextSessionElement | null;
  beginTextEdit: (element: CanvasTextElement, options?: { mode?: EditingTextMode }) => void;
  cancelTextEdit: () => void;
  commitTextEdit: () => void;
  handleTextValueChange: (nextValue: string) => void;
  handleTextInputKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  updateSelectedTextElement: (updater: (element: CanvasTextElement) => CanvasTextElement) => void;
}

export function useCanvasTextSession({
  activeWorkbenchId,
  elementById,
  singleSelectedTextElement,
  selectElement,
  clearSelection,
  upsertElementInWorkbench,
  executeCommandInWorkbench,
  textEditorRef,
  textToolbarRef,
}: UseCanvasTextSessionOptions): UseCanvasTextSessionResult {
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextMode, setEditingTextMode] = useState<EditingTextMode | null>(null);
  const [editingTextWorkbenchId, setEditingTextWorkbenchId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const [editingTextDraft, setEditingTextDraft] = useState<CanvasTextElement | null>(null);
  const textMutationQueueRef = useRef<ReturnType<typeof createTextMutationQueue> | null>(null);
  const textElementDraftRef = useRef<CanvasTextElement | null>(null);
  const createdTextElementRef = useRef(false);
  const resolvingTextSessionRef = useRef(false);
  const textSessionVersionRef = useRef(0);

  const editingTextElement = useMemo(() => {
    if (!editingTextId) {
      return null;
    }

    const element = elementById.get(editingTextId);
    return element?.type === "text" ? element : null;
  }, [editingTextId, elementById]);

  const activeTextElement =
    editingTextDraft ??
    editingTextElement ??
    (editingTextId ? textElementDraftRef.current : null) ??
    singleSelectedTextElement;
  const activeTextElementIsEditable = isCanvasTextElementEditable(activeTextElement);

  if (!textMutationQueueRef.current) {
    textMutationQueueRef.current = createTextMutationQueue();
  }

  const cancelTextEdit = useCallback(() => {
    resolvingTextSessionRef.current = false;
    setEditingTextMode(null);
    setEditingTextId(null);
    setEditingTextWorkbenchId(null);
    setEditingTextValue("");
    setEditingTextDraft(null);
    createdTextElementRef.current = false;
    textElementDraftRef.current = null;
  }, []);

  useEffect(() => {
    if (editingTextDraft) {
      textElementDraftRef.current = editingTextDraft;
      return;
    }
    if (editingTextElement) {
      textElementDraftRef.current = editingTextElement;
      return;
    }
    if (singleSelectedTextElement) {
      textElementDraftRef.current = singleSelectedTextElement;
      return;
    }
    if (!editingTextId) {
      textElementDraftRef.current = null;
    }
  }, [editingTextDraft, editingTextElement, editingTextId, singleSelectedTextElement]);

  useEffect(() => {
    if (editingTextMode === "create" && editingTextElement) {
      createdTextElementRef.current = true;
    }
  }, [editingTextElement, editingTextMode]);

  const beginTextEdit = useCallback(
    (element: CanvasTextElement, options?: { mode?: EditingTextMode }) => {
      if (!activeWorkbenchId || !isCanvasTextElementEditable(element)) {
        return;
      }

      const mode = options?.mode ?? "existing";
      const nextElement = fitCanvasTextElementToContent(element);
      textSessionVersionRef.current += 1;
      resolvingTextSessionRef.current = false;
      createdTextElementRef.current = mode === "existing";
      textElementDraftRef.current = nextElement;
      setEditingTextDraft(nextElement);
      setEditingTextId(nextElement.id);
      setEditingTextMode(mode);
      setEditingTextWorkbenchId(activeWorkbenchId);
      setEditingTextValue(nextElement.content);
    },
    [activeWorkbenchId]
  );

  const persistCurrentTextDraftToWorkbench = useCallback(
    async (workbenchId: string) => {
      const currentTextElement = textElementDraftRef.current ?? activeTextElement;
      if (!currentTextElement || !isCanvasTextElementEditable(currentTextElement)) {
        return;
      }

      const nextContent = editingTextValue.trim();
      const commitKind = resolveTextCommitKind({
        hasCreatedElement: createdTextElementRef.current,
        mode: editingTextMode,
        value: editingTextValue,
      });
      if (commitKind === "upsert") {
        const nextElement = fitCanvasTextElementToContent({
          ...currentTextElement,
          content: nextContent,
        });
        textElementDraftRef.current = nextElement;
        await textMutationQueueRef.current!.enqueue(() =>
          upsertElementInWorkbench(workbenchId, nextElement)
        );
        return;
      }

      if (commitKind === "delete") {
        await textMutationQueueRef.current!.enqueue(() =>
          executeCommandInWorkbench(workbenchId, {
            type: "DELETE_NODES",
            ids: [currentTextElement.id],
          })
        );
      }
    },
    [
      activeTextElement,
      editingTextMode,
      editingTextValue,
      executeCommandInWorkbench,
      upsertElementInWorkbench,
    ]
  );

  const commitTextEdit = useCallback(() => {
    const currentTextElement = textElementDraftRef.current ?? activeTextElement;
    if (
      !currentTextElement ||
      !activeWorkbenchId ||
      editingTextWorkbenchId !== activeWorkbenchId ||
      !isCanvasTextElementEditable(currentTextElement)
    ) {
      cancelTextEdit();
      return;
    }

    const commitKind = resolveTextCommitKind({
      hasCreatedElement: createdTextElementRef.current,
      mode: editingTextMode,
      value: editingTextValue,
    });
    const sessionWorkbenchId = editingTextWorkbenchId;
    const nextContent = editingTextValue.trim();

    if (commitKind === "upsert") {
      const nextElement = fitCanvasTextElementToContent({
        ...currentTextElement,
        content: nextContent,
      });
      textElementDraftRef.current = nextElement;
      setEditingTextDraft(nextElement);
      void textMutationQueueRef.current!.enqueue(() =>
        upsertElementInWorkbench(sessionWorkbenchId, nextElement)
      );
      selectElement(nextElement.id);
    } else if (commitKind === "delete") {
      clearSelection();
      void textMutationQueueRef.current!.enqueue(() =>
        executeCommandInWorkbench(sessionWorkbenchId, {
          type: "DELETE_NODES",
          ids: [currentTextElement.id],
        })
      );
    }

    cancelTextEdit();
  }, [
    activeWorkbenchId,
    activeTextElement,
    cancelTextEdit,
    clearSelection,
    editingTextWorkbenchId,
    editingTextMode,
    editingTextValue,
    executeCommandInWorkbench,
    selectElement,
    upsertElementInWorkbench,
  ]);

  const updateSelectedTextElement = useCallback(
    (updater: (element: CanvasTextElement) => CanvasTextElement) => {
      const currentTextElement = textElementDraftRef.current ?? activeTextElement;
      const targetWorkbenchId = editingTextWorkbenchId ?? activeWorkbenchId;
      if (
        !targetWorkbenchId ||
        !activeWorkbenchId ||
        (editingTextWorkbenchId !== null && editingTextWorkbenchId !== activeWorkbenchId) ||
        !currentTextElement ||
        !isCanvasTextElementEditable(currentTextElement)
      ) {
        return;
      }

      const nextElement = fitCanvasTextElementToContent(updater(currentTextElement));
      textElementDraftRef.current = nextElement;
      if (editingTextId === currentTextElement.id) {
        setEditingTextDraft(nextElement);
      }
      if (editingTextMode === "create" && !createdTextElementRef.current) {
        return;
      }

      void textMutationQueueRef.current!.enqueue(() =>
        upsertElementInWorkbench(targetWorkbenchId, nextElement)
      );
    },
    [
      activeWorkbenchId,
      activeTextElement,
      editingTextWorkbenchId,
      editingTextId,
      editingTextMode,
      upsertElementInWorkbench,
    ]
  );

  const editingTextRenderElement = useMemo(
    () =>
      shouldRenderEditingTextOnActiveWorkbench({
        activeTextElementIsEditable,
        activeTextElementType: activeTextElement?.type,
        activeWorkbenchId,
        editingTextId,
        sessionWorkbenchId: editingTextWorkbenchId,
      })
        ? activeTextElement
        : null,
    [
      activeTextElement,
      activeTextElementIsEditable,
      activeWorkbenchId,
      editingTextId,
      editingTextWorkbenchId,
    ]
  );
  const trackedTextOverlayElement =
    activeTextElementIsEditable && activeTextElement?.type === "text" ? activeTextElement : null;

  const handleTextValueChange = useCallback(
    (nextValue: string) => {
      setEditingTextValue(nextValue);

      const sourceElement = textElementDraftRef.current ?? editingTextRenderElement ?? activeTextElement;
      if (!sourceElement) {
        return;
      }

      const nextElement = fitCanvasTextElementToContent({
        ...sourceElement,
        content: nextValue,
      });
      textElementDraftRef.current = nextElement;
      setEditingTextDraft(nextElement);

      if (
        shouldMaterializeCreatedText({
          activeWorkbenchId,
          hasCreatedElement: createdTextElementRef.current,
          mode: editingTextMode,
          nextValue,
          sessionWorkbenchId: editingTextWorkbenchId,
        })
      ) {
        createdTextElementRef.current = true;
        selectElement(nextElement.id);
        void textMutationQueueRef.current!.enqueue(() =>
          upsertElementInWorkbench(activeWorkbenchId, nextElement)
        );
      }
    },
    [
      activeTextElement,
      activeWorkbenchId,
      editingTextMode,
      editingTextRenderElement,
      editingTextWorkbenchId,
      selectElement,
      upsertElementInWorkbench,
    ]
  );

  const handleTextInputKeyDown = useCallback<KeyboardEventHandler<HTMLTextAreaElement>>(
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelTextEdit();
      }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        commitTextEdit();
      }
    },
    [cancelTextEdit, commitTextEdit]
  );

  useEffect(() => {
    if (!editingTextId) {
      return;
    }

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cancelTextEdit();
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [cancelTextEdit, editingTextId]);

  useEffect(() => {
    if (!editingTextId) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (textEditorRef.current?.contains(target) || textToolbarRef.current?.contains(target)) {
        return;
      }
      commitTextEdit();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [commitTextEdit, editingTextId, textEditorRef, textToolbarRef]);

  useEffect(() => {
    if (resolvingTextSessionRef.current || !editingTextId) {
      return;
    }

    const shouldPersistSession = shouldPersistTextSessionOnWorkbenchSwitch({
      activeWorkbenchId,
      sessionWorkbenchId: editingTextWorkbenchId,
    });
    if (!activeTextElementIsEditable || shouldPersistSession) {
      const originatingWorkbenchId = editingTextWorkbenchId;
      const sessionVersion = textSessionVersionRef.current;
      if (shouldPersistSession && originatingWorkbenchId) {
        resolvingTextSessionRef.current = true;
        void persistCurrentTextDraftToWorkbench(originatingWorkbenchId).finally(() => {
          if (textSessionVersionRef.current === sessionVersion) {
            cancelTextEdit();
          }
        });
        return;
      }
      cancelTextEdit();
    }
  }, [
    activeTextElementIsEditable,
    activeWorkbenchId,
    cancelTextEdit,
    editingTextId,
    editingTextWorkbenchId,
    persistCurrentTextDraftToWorkbench,
  ]);

  return {
    editingTextId,
    editingTextDraft,
    editingTextValue,
    editingTextWorkbenchId,
    activeTextElement,
    activeTextElementIsEditable,
    editingTextRenderElement,
    trackedTextOverlayElement,
    beginTextEdit,
    cancelTextEdit,
    commitTextEdit,
    handleTextValueChange,
    handleTextInputKeyDown,
    updateSelectedTextElement,
  };
}
