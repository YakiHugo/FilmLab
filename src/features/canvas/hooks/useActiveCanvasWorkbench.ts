import { useCallback, useMemo } from "react";
import type {
  CanvasCommand,
  CanvasNode,
  CanvasRenderableElement,
  CanvasWorkbench,
} from "@/types";
import { useCanvasStore } from "@/stores/canvasStore";
import type {
  CanvasWorkbenchEditablePatch,
  ExecuteCommandOptions,
  PatchWorkbenchOptions,
} from "../store/canvasStoreTypes";
import {
  EMPTY_CANVAS_SLICES,
  selectActiveWorkbench,
  selectActiveWorkbenchRootCount,
  selectCanRedoOnActiveWorkbench,
  selectCanUndoOnActiveWorkbench,
} from "../store/canvasStoreSelectors";

const noopPromiseVoid = async () => undefined;
const noopPromiseFalse = async () => false;
const noopPromiseNull = async () => null;
const noopPromiseArray = async () => [] as string[];

export interface ActiveCanvasWorkbench {
  activeWorkbench: CanvasWorkbench | null;
  activeWorkbenchId: string | null;
  activeWorkbenchRootCount: number;
  canRedo: boolean;
  canUndo: boolean;
  slices: CanvasWorkbench["slices"];
  deleteNodes: (ids: string[]) => Promise<string[]>;
  duplicateNodes: (ids: string[]) => Promise<string[]>;
  executeCommand: (
    command: CanvasCommand,
    options?: ExecuteCommandOptions
  ) => Promise<CanvasWorkbench | null>;
  groupNodes: (ids: string[]) => Promise<string | null>;
  nudgeElements: (ids: string[], dx: number, dy: number) => Promise<void>;
  patchWorkbench: (
    patch: CanvasWorkbenchEditablePatch,
    options?: PatchWorkbenchOptions
  ) => Promise<CanvasWorkbench | null>;
  redo: () => Promise<boolean>;
  reorderElements: (orderedIds: string[], parentId?: string | null) => Promise<void>;
  reparentNodes: (ids: string[], parentId: string | null, index?: number) => Promise<void>;
  toggleElementLock: (id: string) => Promise<void>;
  toggleElementVisibility: (id: string) => Promise<void>;
  undo: () => Promise<boolean>;
  ungroupNode: (id: string) => Promise<void>;
  upsertElement: (element: CanvasNode | CanvasRenderableElement) => Promise<void>;
  upsertElements: (elements: Array<CanvasNode | CanvasRenderableElement>) => Promise<void>;
}

export function useActiveCanvasWorkbench(): ActiveCanvasWorkbench {
  const activeWorkbenchId = useCanvasStore((state) => state.activeWorkbenchId);
  const activeWorkbench = useCanvasStore(selectActiveWorkbench);
  const activeWorkbenchRootCount = useCanvasStore(selectActiveWorkbenchRootCount);
  const canUndo = useCanvasStore(selectCanUndoOnActiveWorkbench);
  const canRedo = useCanvasStore(selectCanRedoOnActiveWorkbench);
  const patchWorkbenchInStore = useCanvasStore((state) => state.patchWorkbench);
  const executeCommandInWorkbench = useCanvasStore((state) => state.executeCommandInWorkbench);
  const upsertElementInWorkbench = useCanvasStore((state) => state.upsertElementInWorkbench);
  const upsertElementsInWorkbench = useCanvasStore((state) => state.upsertElementsInWorkbench);
  const deleteNodesInWorkbench = useCanvasStore((state) => state.deleteNodesInWorkbench);
  const duplicateNodesInWorkbench = useCanvasStore((state) => state.duplicateNodesInWorkbench);
  const reorderElementsInWorkbench = useCanvasStore((state) => state.reorderElementsInWorkbench);
  const reparentNodesInWorkbench = useCanvasStore((state) => state.reparentNodesInWorkbench);
  const toggleElementVisibilityInWorkbench = useCanvasStore(
    (state) => state.toggleElementVisibilityInWorkbench
  );
  const toggleElementLockInWorkbench = useCanvasStore(
    (state) => state.toggleElementLockInWorkbench
  );
  const nudgeElementsInWorkbench = useCanvasStore((state) => state.nudgeElementsInWorkbench);
  const groupNodesInWorkbench = useCanvasStore((state) => state.groupNodesInWorkbench);
  const ungroupNodeInWorkbench = useCanvasStore((state) => state.ungroupNodeInWorkbench);
  const undoInWorkbench = useCanvasStore((state) => state.undoInWorkbench);
  const redoInWorkbench = useCanvasStore((state) => state.redoInWorkbench);
  const boundWorkbenchId = activeWorkbench ? activeWorkbenchId : null;

  const deleteNodes = useCallback(
    (ids: string[]) =>
      boundWorkbenchId ? deleteNodesInWorkbench(boundWorkbenchId, ids) : noopPromiseArray(),
    [boundWorkbenchId, deleteNodesInWorkbench]
  );
  const duplicateNodes = useCallback(
    (ids: string[]) =>
      boundWorkbenchId ? duplicateNodesInWorkbench(boundWorkbenchId, ids) : noopPromiseArray(),
    [boundWorkbenchId, duplicateNodesInWorkbench]
  );
  const executeCommand = useCallback(
    (command: CanvasCommand, options?: ExecuteCommandOptions) =>
      boundWorkbenchId
        ? executeCommandInWorkbench(boundWorkbenchId, command, options)
        : noopPromiseNull(),
    [boundWorkbenchId, executeCommandInWorkbench]
  );
  const groupNodes = useCallback(
    (ids: string[]) =>
      boundWorkbenchId ? groupNodesInWorkbench(boundWorkbenchId, ids) : noopPromiseNull(),
    [boundWorkbenchId, groupNodesInWorkbench]
  );
  const nudgeElements = useCallback(
    (ids: string[], dx: number, dy: number) =>
      boundWorkbenchId
        ? nudgeElementsInWorkbench(boundWorkbenchId, ids, dx, dy)
        : noopPromiseVoid(),
    [boundWorkbenchId, nudgeElementsInWorkbench]
  );
  const patchWorkbench = useCallback(
    (patch: CanvasWorkbenchEditablePatch, options?: PatchWorkbenchOptions) =>
      boundWorkbenchId ? patchWorkbenchInStore(boundWorkbenchId, patch, options) : noopPromiseNull(),
    [boundWorkbenchId, patchWorkbenchInStore]
  );
  const redo = useCallback(
    () => (boundWorkbenchId ? redoInWorkbench(boundWorkbenchId) : noopPromiseFalse()),
    [boundWorkbenchId, redoInWorkbench]
  );
  const reorderElements = useCallback(
    (orderedIds: string[], parentId: string | null = null) =>
      boundWorkbenchId
        ? reorderElementsInWorkbench(boundWorkbenchId, orderedIds, parentId)
        : noopPromiseVoid(),
    [boundWorkbenchId, reorderElementsInWorkbench]
  );
  const reparentNodes = useCallback(
    (ids: string[], parentId: string | null, index?: number) =>
      boundWorkbenchId
        ? reparentNodesInWorkbench(boundWorkbenchId, ids, parentId, index)
        : noopPromiseVoid(),
    [boundWorkbenchId, reparentNodesInWorkbench]
  );
  const toggleElementLock = useCallback(
    (id: string) =>
      boundWorkbenchId ? toggleElementLockInWorkbench(boundWorkbenchId, id) : noopPromiseVoid(),
    [boundWorkbenchId, toggleElementLockInWorkbench]
  );
  const toggleElementVisibility = useCallback(
    (id: string) =>
      boundWorkbenchId
        ? toggleElementVisibilityInWorkbench(boundWorkbenchId, id)
        : noopPromiseVoid(),
    [boundWorkbenchId, toggleElementVisibilityInWorkbench]
  );
  const undo = useCallback(
    () => (boundWorkbenchId ? undoInWorkbench(boundWorkbenchId) : noopPromiseFalse()),
    [boundWorkbenchId, undoInWorkbench]
  );
  const ungroupNode = useCallback(
    (id: string) =>
      boundWorkbenchId ? ungroupNodeInWorkbench(boundWorkbenchId, id) : noopPromiseVoid(),
    [boundWorkbenchId, ungroupNodeInWorkbench]
  );
  const upsertElement = useCallback(
    (element: CanvasNode | CanvasRenderableElement) =>
      boundWorkbenchId ? upsertElementInWorkbench(boundWorkbenchId, element) : noopPromiseVoid(),
    [boundWorkbenchId, upsertElementInWorkbench]
  );
  const upsertElements = useCallback(
    (elements: Array<CanvasNode | CanvasRenderableElement>) =>
      boundWorkbenchId ? upsertElementsInWorkbench(boundWorkbenchId, elements) : noopPromiseVoid(),
    [boundWorkbenchId, upsertElementsInWorkbench]
  );

  return useMemo(() => {
    if (!boundWorkbenchId) {
      return {
        activeWorkbench: null,
        activeWorkbenchId: null,
        activeWorkbenchRootCount: 0,
        canRedo: false,
        canUndo: false,
        slices: EMPTY_CANVAS_SLICES,
        deleteNodes,
        duplicateNodes,
        executeCommand,
        groupNodes,
        nudgeElements,
        patchWorkbench,
        redo,
        reorderElements,
        reparentNodes,
        toggleElementLock,
        toggleElementVisibility,
        undo,
        ungroupNode,
        upsertElement,
        upsertElements,
      };
    }

    return {
      activeWorkbench,
      activeWorkbenchId: boundWorkbenchId,
      activeWorkbenchRootCount,
      canRedo,
      canUndo,
      slices: activeWorkbench?.slices ?? EMPTY_CANVAS_SLICES,
      deleteNodes,
      duplicateNodes,
      executeCommand,
      groupNodes,
      nudgeElements,
      patchWorkbench,
      redo,
      reorderElements,
      reparentNodes,
      toggleElementLock,
      toggleElementVisibility,
      undo,
      ungroupNode,
      upsertElement,
      upsertElements,
    };
  }, [
    activeWorkbench,
    activeWorkbenchRootCount,
    boundWorkbenchId,
    canRedo,
    canUndo,
    deleteNodes,
    duplicateNodes,
    executeCommand,
    groupNodes,
    nudgeElements,
    patchWorkbench,
    redo,
    reorderElements,
    reparentNodes,
    toggleElementLock,
    toggleElementVisibility,
    undo,
    ungroupNode,
    upsertElement,
    upsertElements,
  ]);
}
