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
const noopNull = () => null;

export interface CanvasLoadedWorkbenchCommands {
  patchWorkbench: (
    patch: CanvasWorkbenchEditablePatch,
    options?: PatchWorkbenchOptions
  ) => Promise<CanvasWorkbench | null>;
  executeCommand: (
    command: CanvasCommand,
    options?: ExecuteCommandOptions
  ) => Promise<CanvasWorkbench | null>;
  beginInteraction: () => { interactionId: string } | null;
  previewCommand: (interactionId: string, command: CanvasCommand) => CanvasWorkbench | null;
  commitInteraction: (interactionId: string) => Promise<CanvasWorkbench | null>;
  rollbackInteraction: (interactionId: string) => CanvasWorkbench | null;
  upsertElement: (element: CanvasEditableElement) => Promise<void>;
  upsertElements: (elements: CanvasEditableElement[]) => Promise<void>;
}

export interface CanvasLoadedWorkbenchStructure {
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

export interface CanvasLoadedWorkbenchHistory {
  canRedo: boolean;
  canUndo: boolean;
  redo: () => Promise<boolean>;
  undo: () => Promise<boolean>;
}

export interface CanvasLoadedWorkbenchHistoryActions {
  redo: () => Promise<boolean>;
  undo: () => Promise<boolean>;
}

export interface CanvasLoadedWorkbenchCommandStoreApi {
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
  beginInteractionInWorkbench: (workbenchId: string) => { interactionId: string } | null;
  previewCommandInWorkbench: (
    workbenchId: string,
    interactionId: string,
    command: CanvasCommand
  ) => CanvasWorkbench | null;
  commitInteractionInWorkbench: (
    workbenchId: string,
    interactionId: string
  ) => Promise<CanvasWorkbench | null>;
  rollbackInteractionInWorkbench: (
    workbenchId: string,
    interactionId: string
  ) => CanvasWorkbench | null;
  upsertElementInWorkbench: (
    workbenchId: string,
    element: CanvasEditableElement
  ) => Promise<void>;
  upsertElementsInWorkbench: (
    workbenchId: string,
    elements: CanvasEditableElement[]
  ) => Promise<void>;
}

export interface CanvasLoadedWorkbenchStructureStoreApi {
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

export interface CanvasLoadedWorkbenchHistoryStoreApi {
  redoInWorkbench: (workbenchId: string | null) => Promise<boolean>;
  undoInWorkbench: (workbenchId: string | null) => Promise<boolean>;
}

export const bindCanvasLoadedWorkbenchHistoryActions = ({
  storeApi,
  workbenchId,
}: {
  storeApi: CanvasLoadedWorkbenchHistoryStoreApi;
  workbenchId: string | null;
}): CanvasLoadedWorkbenchHistoryActions => ({
  redo: () => (workbenchId ? storeApi.redoInWorkbench(workbenchId) : noopPromiseFalse()),
  undo: () => (workbenchId ? storeApi.undoInWorkbench(workbenchId) : noopPromiseFalse()),
});

export const bindCanvasLoadedWorkbenchCommands = ({
  storeApi,
  workbenchId,
}: {
  storeApi: CanvasLoadedWorkbenchCommandStoreApi;
  workbenchId: string | null;
}): CanvasLoadedWorkbenchCommands => ({
  patchWorkbench: (patch, options) =>
    workbenchId ? storeApi.patchWorkbench(workbenchId, patch, options) : noopPromiseNull(),
  executeCommand: (command, options) =>
    workbenchId
      ? storeApi.executeCommandInWorkbench(workbenchId, command, options)
      : noopPromiseNull(),
  beginInteraction: () =>
    workbenchId ? storeApi.beginInteractionInWorkbench(workbenchId) : noopNull(),
  previewCommand: (interactionId, command) =>
    workbenchId
      ? storeApi.previewCommandInWorkbench(workbenchId, interactionId, command)
      : null,
  commitInteraction: (interactionId) =>
    workbenchId
      ? storeApi.commitInteractionInWorkbench(workbenchId, interactionId)
      : noopPromiseNull(),
  rollbackInteraction: (interactionId) =>
    workbenchId
      ? storeApi.rollbackInteractionInWorkbench(workbenchId, interactionId)
      : null,
  upsertElement: (element) =>
    workbenchId ? storeApi.upsertElementInWorkbench(workbenchId, element) : noopPromiseVoid(),
  upsertElements: (elements) =>
    workbenchId ? storeApi.upsertElementsInWorkbench(workbenchId, elements) : noopPromiseVoid(),
});

export const bindCanvasLoadedWorkbenchStructure = ({
  storeApi,
  workbenchId,
}: {
  storeApi: CanvasLoadedWorkbenchStructureStoreApi;
  workbenchId: string | null;
}): CanvasLoadedWorkbenchStructure => ({
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

export const bindCanvasLoadedWorkbenchHistory = ({
  canRedo,
  canUndo,
  storeApi,
  workbenchId,
}: {
  canRedo: boolean;
  canUndo: boolean;
  storeApi: CanvasLoadedWorkbenchHistoryStoreApi;
  workbenchId: string | null;
}): CanvasLoadedWorkbenchHistory => ({
  canRedo,
  canUndo,
  ...bindCanvasLoadedWorkbenchHistoryActions({
    storeApi,
    workbenchId,
  }),
});
