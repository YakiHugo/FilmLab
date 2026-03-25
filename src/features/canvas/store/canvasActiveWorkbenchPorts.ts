import type {
  CanvasCommand,
  CanvasEditableElement,
  CanvasWorkbench,
} from "@/types";
import type {
  CanvasWorkbenchEditablePatch,
  ExecuteCommandOptions,
  PatchWorkbenchOptions,
} from "./canvasStoreTypes";

const noopPromiseVoid = async () => undefined;
const noopPromiseFalse = async () => false;
const noopPromiseNull = async () => null;
const noopPromiseArray = async () => [] as string[];

export interface CanvasActiveWorkbenchCommands {
  patchWorkbench: (
    patch: CanvasWorkbenchEditablePatch,
    options?: PatchWorkbenchOptions
  ) => Promise<CanvasWorkbench | null>;
  executeCommand: (
    command: CanvasCommand,
    options?: ExecuteCommandOptions
  ) => Promise<CanvasWorkbench | null>;
  upsertElement: (element: CanvasEditableElement) => Promise<void>;
  upsertElements: (elements: CanvasEditableElement[]) => Promise<void>;
}

export interface CanvasActiveWorkbenchStructure {
  deleteNodes: (ids: string[]) => Promise<string[]>;
  duplicateNodes: (ids: string[]) => Promise<string[]>;
  groupNodes: (ids: string[]) => Promise<string | null>;
  nudgeElements: (ids: string[], dx: number, dy: number) => Promise<void>;
  reorderElements: (orderedIds: string[], parentId?: string | null) => Promise<void>;
  reparentNodes: (ids: string[], parentId: string | null, index?: number) => Promise<void>;
  toggleElementLock: (id: string) => Promise<void>;
  toggleElementVisibility: (id: string) => Promise<void>;
  ungroupNode: (id: string) => Promise<void>;
}

export interface CanvasActiveWorkbenchHistory {
  canRedo: boolean;
  canUndo: boolean;
  redo: () => Promise<boolean>;
  undo: () => Promise<boolean>;
}

export interface CanvasActiveWorkbenchHistoryActions {
  redo: () => Promise<boolean>;
  undo: () => Promise<boolean>;
}

export interface CanvasActiveWorkbenchCommandStoreApi {
  patchWorkbench: (
    workbenchId: string,
    patch: CanvasWorkbenchEditablePatch,
    options?: PatchWorkbenchOptions
  ) => Promise<CanvasWorkbench | null>;
  executeCommandInWorkbench: (
    workbenchId: string,
    command: CanvasCommand,
    options?: ExecuteCommandOptions
  ) => Promise<CanvasWorkbench | null>;
  upsertElementInWorkbench: (
    workbenchId: string,
    element: CanvasEditableElement
  ) => Promise<void>;
  upsertElementsInWorkbench: (
    workbenchId: string,
    elements: CanvasEditableElement[]
  ) => Promise<void>;
}

export interface CanvasActiveWorkbenchStructureStoreApi {
  deleteNodesInWorkbench: (workbenchId: string, ids: string[]) => Promise<string[]>;
  duplicateNodesInWorkbench: (workbenchId: string, ids: string[]) => Promise<string[]>;
  groupNodesInWorkbench: (workbenchId: string, ids: string[]) => Promise<string | null>;
  nudgeElementsInWorkbench: (
    workbenchId: string,
    ids: string[],
    dx: number,
    dy: number
  ) => Promise<void>;
  reorderElementsInWorkbench: (
    workbenchId: string,
    orderedIds: string[],
    parentId?: string | null
  ) => Promise<void>;
  reparentNodesInWorkbench: (
    workbenchId: string,
    ids: string[],
    parentId: string | null,
    index?: number
  ) => Promise<void>;
  toggleElementLockInWorkbench: (workbenchId: string, id: string) => Promise<void>;
  toggleElementVisibilityInWorkbench: (workbenchId: string, id: string) => Promise<void>;
  ungroupNodeInWorkbench: (workbenchId: string, id: string) => Promise<void>;
}

export interface CanvasActiveWorkbenchHistoryStoreApi {
  redoInWorkbench: (workbenchId: string | null) => Promise<boolean>;
  undoInWorkbench: (workbenchId: string | null) => Promise<boolean>;
}

export const bindCanvasActiveWorkbenchHistoryActions = ({
  storeApi,
  workbenchId,
}: {
  storeApi: CanvasActiveWorkbenchHistoryStoreApi;
  workbenchId: string | null;
}): CanvasActiveWorkbenchHistoryActions => ({
  redo: () => (workbenchId ? storeApi.redoInWorkbench(workbenchId) : noopPromiseFalse()),
  undo: () => (workbenchId ? storeApi.undoInWorkbench(workbenchId) : noopPromiseFalse()),
});

export const bindCanvasActiveWorkbenchCommands = ({
  storeApi,
  workbenchId,
}: {
  storeApi: CanvasActiveWorkbenchCommandStoreApi;
  workbenchId: string | null;
}): CanvasActiveWorkbenchCommands => ({
  patchWorkbench: (patch, options) =>
    workbenchId ? storeApi.patchWorkbench(workbenchId, patch, options) : noopPromiseNull(),
  executeCommand: (command, options) =>
    workbenchId
      ? storeApi.executeCommandInWorkbench(workbenchId, command, options)
      : noopPromiseNull(),
  upsertElement: (element) =>
    workbenchId ? storeApi.upsertElementInWorkbench(workbenchId, element) : noopPromiseVoid(),
  upsertElements: (elements) =>
    workbenchId ? storeApi.upsertElementsInWorkbench(workbenchId, elements) : noopPromiseVoid(),
});

export const bindCanvasActiveWorkbenchStructure = ({
  storeApi,
  workbenchId,
}: {
  storeApi: CanvasActiveWorkbenchStructureStoreApi;
  workbenchId: string | null;
}): CanvasActiveWorkbenchStructure => ({
  deleteNodes: (ids) =>
    workbenchId ? storeApi.deleteNodesInWorkbench(workbenchId, ids) : noopPromiseArray(),
  duplicateNodes: (ids) =>
    workbenchId ? storeApi.duplicateNodesInWorkbench(workbenchId, ids) : noopPromiseArray(),
  groupNodes: (ids) =>
    workbenchId ? storeApi.groupNodesInWorkbench(workbenchId, ids) : noopPromiseNull(),
  nudgeElements: (ids, dx, dy) =>
    workbenchId
      ? storeApi.nudgeElementsInWorkbench(workbenchId, ids, dx, dy)
      : noopPromiseVoid(),
  reorderElements: (orderedIds, parentId = null) =>
    workbenchId
      ? storeApi.reorderElementsInWorkbench(workbenchId, orderedIds, parentId)
      : noopPromiseVoid(),
  reparentNodes: (ids, parentId, index) =>
    workbenchId
      ? storeApi.reparentNodesInWorkbench(workbenchId, ids, parentId, index)
      : noopPromiseVoid(),
  toggleElementLock: (id) =>
    workbenchId ? storeApi.toggleElementLockInWorkbench(workbenchId, id) : noopPromiseVoid(),
  toggleElementVisibility: (id) =>
    workbenchId
      ? storeApi.toggleElementVisibilityInWorkbench(workbenchId, id)
      : noopPromiseVoid(),
  ungroupNode: (id) =>
    workbenchId ? storeApi.ungroupNodeInWorkbench(workbenchId, id) : noopPromiseVoid(),
});

export const bindCanvasActiveWorkbenchHistory = ({
  canRedo,
  canUndo,
  storeApi,
  workbenchId,
}: {
  canRedo: boolean;
  canUndo: boolean;
  storeApi: CanvasActiveWorkbenchHistoryStoreApi;
  workbenchId: string | null;
}): CanvasActiveWorkbenchHistory => ({
  canRedo,
  canUndo,
  ...bindCanvasActiveWorkbenchHistoryActions({
    storeApi,
    workbenchId,
  }),
});
