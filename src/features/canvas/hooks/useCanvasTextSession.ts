import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEventHandler,
} from "react";
import type {
  CanvasCommand,
  CanvasRenderableNode,
  CanvasRenderableTextElement,
  CanvasTextElement,
} from "@/types";
import { isCanvasTextElementEditable } from "../elements/TextElement";
import {
  resolveTextCancelKind,
  resolveTextCommitKind,
  resolveTextSessionWorkbenchTransition,
  shouldMaterializeCreatedText,
  shouldSelectMaterializedCreatedText,
  type EditingTextMode,
} from "../textSession";
import { fitCanvasTextElementToContent } from "../textStyle";
import { createTextMutationQueue } from "../textMutationQueue";

interface UseCanvasTextSessionOptions {
  activeWorkbenchId: string | null;
  availableWorkbenchIds: string[];
  elementById: Map<string, CanvasRenderableNode>;
  selectedElementIds: string[];
  singleSelectedTextElement: CanvasRenderableTextElement | null;
  selectElement: (elementId: string) => void;
  clearSelection: () => void;
  upsertElementInWorkbench: (
    workbenchId: string,
    element: CanvasTextElement | CanvasRenderableTextElement
  ) => Promise<void>;
  executeCommandInWorkbench: (
    workbenchId: string,
    command: CanvasCommand,
    options?: { trackHistory?: boolean }
  ) => Promise<unknown>;
}

interface UseCanvasTextSessionResult {
  editingTextId: string | null;
  editingTextDraft: CanvasTextElement | null;
  editingTextValue: string;
  editingTextWorkbenchId: string | null;
  beginTextEdit: (element: CanvasTextElement, options?: { mode?: EditingTextMode }) => void;
  cancelTextEdit: () => void;
  commitTextEdit: () => void;
  handleTextValueChange: (nextValue: string) => void;
  handleTextInputKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  updateSelectedTextElement: (updater: (element: CanvasTextElement) => CanvasTextElement) => void;
}

const toTextRollbackPatch = (
  element: CanvasTextElement | CanvasRenderableTextElement
): CanvasCommand & { type: "UPDATE_NODE_PROPS" } => ({
  type: "UPDATE_NODE_PROPS",
  updates: [
    {
      id: element.id,
      patch: {
        ...element.transform,
        color: element.color,
        content: element.content,
        fontFamily: element.fontFamily,
        fontSize: element.fontSize,
        fontSizeTier: element.fontSizeTier,
        textAlign: element.textAlign,
        locked: element.locked,
        opacity: element.opacity,
        visible: element.visible,
      },
    },
  ],
});

export function useCanvasTextSession({
  activeWorkbenchId,
  availableWorkbenchIds,
  elementById,
  selectedElementIds,
  singleSelectedTextElement,
  selectElement,
  clearSelection,
  upsertElementInWorkbench,
  executeCommandInWorkbench,
}: UseCanvasTextSessionOptions): UseCanvasTextSessionResult {
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextMode, setEditingTextMode] = useState<EditingTextMode | null>(null);
  const [editingTextWorkbenchId, setEditingTextWorkbenchId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const [editingTextDraft, setEditingTextDraft] = useState<CanvasTextElement | null>(null);
  const textMutationQueueRef = useRef<ReturnType<typeof createTextMutationQueue> | null>(null);
  const textElementDraftRef = useRef<CanvasTextElement | null>(null);
  const initialTextElementRef = useRef<CanvasTextElement | CanvasRenderableTextElement | null>(null);
  const createdTextElementRef = useRef(false);
  const persistedExistingTextDraftRef = useRef(false);
  const pendingPersistSourceCountRef = useRef(0);
  const resolvingTextSessionRef = useRef(false);
  const textSessionVersionRef = useRef(0);
  const textSessionTransitionVersionRef = useRef(0);
  const availableWorkbenchIdSet = useMemo(
    () => new Set(availableWorkbenchIds),
    [availableWorkbenchIds]
  );
  const activeWorkbenchIdRef = useRef(activeWorkbenchId);
  const editingTextWorkbenchIdRef = useRef(editingTextWorkbenchId);
  const availableWorkbenchIdSetRef = useRef(availableWorkbenchIdSet);

  activeWorkbenchIdRef.current = activeWorkbenchId;
  editingTextWorkbenchIdRef.current = editingTextWorkbenchId;
  availableWorkbenchIdSetRef.current = availableWorkbenchIdSet;

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

  const resetTextEditState = useCallback(() => {
    textSessionVersionRef.current += 1;
    textSessionTransitionVersionRef.current += 1;
    resolvingTextSessionRef.current = false;
    setEditingTextMode(null);
    setEditingTextId(null);
    setEditingTextWorkbenchId(null);
    setEditingTextValue("");
    setEditingTextDraft(null);
    createdTextElementRef.current = false;
    persistedExistingTextDraftRef.current = false;
    pendingPersistSourceCountRef.current = 0;
    initialTextElementRef.current = null;
    textElementDraftRef.current = null;
  }, []);

  const resolveCurrentWorkbenchTransition = useCallback(() => {
    const currentActiveWorkbenchId = activeWorkbenchIdRef.current;
    const currentEditingTextWorkbenchId = editingTextWorkbenchIdRef.current;
    const currentAvailableWorkbenchIdSet = availableWorkbenchIdSetRef.current;

    return resolveTextSessionWorkbenchTransition({
      activeWorkbenchId: currentActiveWorkbenchId,
      hasActiveWorkbench:
        currentActiveWorkbenchId !== null &&
        currentAvailableWorkbenchIdSet.has(currentActiveWorkbenchId),
      hasSessionWorkbench:
        currentEditingTextWorkbenchId !== null &&
        currentAvailableWorkbenchIdSet.has(currentEditingTextWorkbenchId),
      sessionWorkbenchId: currentEditingTextWorkbenchId,
    });
  }, []);

  const cancelTextEdit = useCallback(() => {
    const currentTextElement = textElementDraftRef.current ?? activeTextElement;
    const initialTextElement = initialTextElementRef.current;
    const sessionWorkbenchId = editingTextWorkbenchId;
    const hasSessionWorkbench =
      sessionWorkbenchId !== null && availableWorkbenchIdSet.has(sessionWorkbenchId);
    const cancelKind = resolveTextCancelKind({
      hasCreatedElement: createdTextElementRef.current,
      mode: editingTextMode,
    });

    if (
      cancelKind === "rollback-delete" &&
      currentTextElement &&
      sessionWorkbenchId &&
      hasSessionWorkbench &&
      isCanvasTextElementEditable(currentTextElement)
    ) {
      clearSelection();
      void textMutationQueueRef.current!.enqueue(() =>
        executeCommandInWorkbench(
          sessionWorkbenchId,
          {
            type: "DELETE_NODES",
            ids: [currentTextElement.id],
          },
          { trackHistory: false }
        )
      );
    } else if (
      editingTextMode === "existing" &&
      (
        persistedExistingTextDraftRef.current ||
        resolvingTextSessionRef.current ||
        pendingPersistSourceCountRef.current > 0
      ) &&
      initialTextElement &&
      sessionWorkbenchId &&
      hasSessionWorkbench &&
      isCanvasTextElementEditable(initialTextElement)
    ) {
      void textMutationQueueRef.current!.enqueue(() =>
        executeCommandInWorkbench(
          sessionWorkbenchId,
          toTextRollbackPatch(initialTextElement),
          { trackHistory: false }
        )
      );
    }

    resetTextEditState();
  }, [
    activeTextElement,
    clearSelection,
    editingTextMode,
    editingTextWorkbenchId,
    executeCommandInWorkbench,
    resetTextEditState,
    availableWorkbenchIdSet,
  ]);

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

  const isEditingTextSelected =
    editingTextId !== null && selectedElementIds.includes(editingTextId);

  useEffect(() => {
    if (
      !shouldSelectMaterializedCreatedText({
        activeWorkbenchId,
        editingTextId,
        hasEditingTextElement: Boolean(editingTextElement),
        isEditingTextSelected,
        mode: editingTextMode,
        sessionWorkbenchId: editingTextWorkbenchId,
      })
    ) {
      return;
    }

    selectElement(editingTextId!);
  }, [
    activeWorkbenchId,
    editingTextElement,
    editingTextId,
    editingTextMode,
    editingTextWorkbenchId,
    isEditingTextSelected,
    selectElement,
  ]);

  const beginTextEdit = useCallback(
    (element: CanvasTextElement, options?: { mode?: EditingTextMode }) => {
      if (!activeWorkbenchId || !isCanvasTextElementEditable(element)) {
        return;
      }

      const mode = options?.mode ?? "existing";
      const nextElement = fitCanvasTextElementToContent(element);
      textSessionVersionRef.current += 1;
      textSessionTransitionVersionRef.current += 1;
      resolvingTextSessionRef.current = false;
      createdTextElementRef.current = mode === "existing";
      initialTextElementRef.current = mode === "existing" ? element : null;
      persistedExistingTextDraftRef.current = false;
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
        return false;
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
        return true;
      }

      if (commitKind === "delete") {
        await textMutationQueueRef.current!.enqueue(() =>
          executeCommandInWorkbench(workbenchId, {
            type: "DELETE_NODES",
            ids: [currentTextElement.id],
          })
        );
        return true;
      }

      return false;
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
      resetTextEditState();
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

    resetTextEditState();
  }, [
    activeWorkbenchId,
    activeTextElement,
    clearSelection,
    editingTextWorkbenchId,
    editingTextMode,
    editingTextValue,
    executeCommandInWorkbench,
    resetTextEditState,
    selectElement,
    upsertElementInWorkbench,
  ]);

  const updateSelectedTextElement = useCallback(
    (updater: (element: CanvasTextElement) => CanvasTextElement) => {
      const currentTextElement = textElementDraftRef.current ?? activeTextElement;
      if (
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
    },
    [
      activeWorkbenchId,
      activeTextElement,
      editingTextWorkbenchId,
      editingTextId,
    ]
  );

  const handleTextValueChange = useCallback(
    (nextValue: string) => {
      setEditingTextValue(nextValue);

      const sourceElement = textElementDraftRef.current ?? activeTextElement;
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
        const currentWorkbenchId = activeWorkbenchId;
        void textMutationQueueRef.current!.enqueue(() =>
          upsertElementInWorkbench(currentWorkbenchId!, nextElement)
        );
      }
    },
    [
      activeTextElement,
      activeWorkbenchId,
      editingTextMode,
      editingTextWorkbenchId,
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

    const workbenchTransition = resolveCurrentWorkbenchTransition();

    if (!activeTextElementIsEditable) {
      resetTextEditState();
      return;
    }

    if (resolvingTextSessionRef.current) {
      if (workbenchTransition === "noop" || workbenchTransition === "wait") {
        resolvingTextSessionRef.current = false;
        textSessionTransitionVersionRef.current += 1;
      } else if (workbenchTransition === "reset") {
        resetTextEditState();
      }
      return;
    }

    if (workbenchTransition === "noop" || workbenchTransition === "wait") {
      return;
    }

    const originatingWorkbenchId = editingTextWorkbenchId;
    const sessionVersion = textSessionVersionRef.current;
    const transitionVersion = textSessionTransitionVersionRef.current + 1;
    if (workbenchTransition === "persist-source" && originatingWorkbenchId) {
      textSessionTransitionVersionRef.current = transitionVersion;
      pendingPersistSourceCountRef.current += 1;
      resolvingTextSessionRef.current = true;
      void persistCurrentTextDraftToWorkbench(originatingWorkbenchId)
        .then((didPersistDraft) => {
          if (
            didPersistDraft &&
            editingTextMode === "existing" &&
            textSessionVersionRef.current === sessionVersion
          ) {
            persistedExistingTextDraftRef.current = true;
          }
        })
        .finally(() => {
          if (textSessionVersionRef.current === sessionVersion) {
            pendingPersistSourceCountRef.current = Math.max(
              0,
              pendingPersistSourceCountRef.current - 1
            );
          }

          if (
            textSessionVersionRef.current !== sessionVersion ||
            textSessionTransitionVersionRef.current !== transitionVersion
          ) {
            return;
          }

          const currentWorkbenchTransition = resolveCurrentWorkbenchTransition();
          if (
            currentWorkbenchTransition === "persist-source" ||
            currentWorkbenchTransition === "reset"
          ) {
            resetTextEditState();
            return;
          }

          resolvingTextSessionRef.current = false;
        });
      return;
    }

    resetTextEditState();
  }, [
    activeWorkbenchId,
    activeTextElementIsEditable,
    availableWorkbenchIdSet,
    editingTextId,
    editingTextMode,
    editingTextWorkbenchId,
    persistCurrentTextDraftToWorkbench,
    resetTextEditState,
    resolveCurrentWorkbenchTransition,
  ]);

  return {
    editingTextId,
    editingTextDraft,
    editingTextValue,
    editingTextWorkbenchId,
    beginTextEdit,
    cancelTextEdit,
    commitTextEdit,
    handleTextValueChange,
    handleTextInputKeyDown,
    updateSelectedTextElement,
  };
}
