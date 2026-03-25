import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { selectionIdsEqual } from "@/features/canvas/selectionModel";
import {
  createCanvasWorkbenchService,
  resetCanvasWorkbenchService,
} from "@/features/canvas/store/canvasWorkbenchService";
import {
  selectCanRedoInWorkbench,
  selectCanUndoInWorkbench,
} from "@/features/canvas/store/canvasStoreSelectors";
import type {
  CanvasFloatingPanel,
  CanvasStoreDataSetter,
  CanvasStoreDataState,
  CanvasTool,
  CanvasWorkbenchEditablePatch,
  CreateWorkbenchOptions,
  DeleteWorkbenchOptions,
  ExecuteCommandOptions,
  PatchWorkbenchOptions,
} from "@/features/canvas/store/canvasStoreTypes";
import { on } from "@/lib/storeEvents";
import type {
  CanvasCommand,
  CanvasEditableElement,
  CanvasShapeType,
  CanvasWorkbench,
} from "@/types";

export type { CanvasFloatingPanel, CanvasTool } from "@/features/canvas/store/canvasStoreTypes";
export { getCanvasResetEpoch } from "@/features/canvas/store/canvasWorkbenchService";

export interface CanvasState extends CanvasStoreDataState {
  init: () => Promise<void>;
  createWorkbench: (name?: string, options?: CreateWorkbenchOptions) => Promise<CanvasWorkbench | null>;
  patchWorkbench: (
    workbenchId: string,
    patch: CanvasWorkbenchEditablePatch,
    options?: PatchWorkbenchOptions
  ) => Promise<CanvasWorkbench | null>;
  setActiveWorkbenchId: (id: string | null) => void;
  setSelectedElementIds: (ids: string[]) => void;
  setTool: (tool: CanvasTool) => void;
  setActiveShapeType: (shapeType: CanvasShapeType) => void;
  setZoom: (zoom: number) => void;
  setViewport: (viewport: { x: number; y: number }) => void;
  setActivePanel: (panel: CanvasFloatingPanel) => void;
  togglePanel: (panel: CanvasFloatingPanel) => void;
  deleteWorkbench: (id: string, options?: DeleteWorkbenchOptions) => Promise<boolean>;
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
  deleteNodesInWorkbench: (workbenchId: string, ids: string[]) => Promise<string[]>;
  duplicateNodesInWorkbench: (workbenchId: string, ids: string[]) => Promise<string[]>;
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
  toggleElementVisibilityInWorkbench: (workbenchId: string, id: string) => Promise<void>;
  toggleElementLockInWorkbench: (workbenchId: string, id: string) => Promise<void>;
  nudgeElementsInWorkbench: (
    workbenchId: string,
    ids: string[],
    dx: number,
    dy: number
  ) => Promise<void>;
  groupNodesInWorkbench: (workbenchId: string, ids: string[]) => Promise<string | null>;
  ungroupNodeInWorkbench: (workbenchId: string, id: string) => Promise<void>;
  canUndoInWorkbench: (workbenchId: string | null) => boolean;
  canRedoInWorkbench: (workbenchId: string | null) => boolean;
  undoInWorkbench: (workbenchId: string | null) => Promise<boolean>;
  redoInWorkbench: (workbenchId: string | null) => Promise<boolean>;
}

const createInitialCanvasStoreDataState = (): CanvasStoreDataState => ({
  workbenches: [],
  activeWorkbenchId: null,
  selectedElementIds: [],
  tool: "select",
  activeShapeType: "rect",
  zoom: 1,
  viewport: { x: 0, y: 0 },
  activePanel: null,
  isLoading: false,
  historyByWorkbenchId: {},
});

export const useCanvasStore = create<CanvasState>()(
  devtools(
    (set, get) => {
      const setCanvasDataState: CanvasStoreDataSetter = (update) => {
        set((state) => (typeof update === "function" ? update(state) : update));
      };

      const service = createCanvasWorkbenchService({
        getState: () => get(),
        setState: setCanvasDataState,
      });

      const hasWorkbench = (workbenchId: string | null) =>
        Boolean(workbenchId && get().workbenches.some((workbench) => workbench.id === workbenchId));

      return {
        ...createInitialCanvasStoreDataState(),
        init: service.init,
        createWorkbench: service.createWorkbench,
        patchWorkbench: service.patchWorkbench,
        setActiveWorkbenchId: (activeWorkbenchId) =>
          set(() => {
            if (activeWorkbenchId !== null && !hasWorkbench(activeWorkbenchId)) {
              return { activeWorkbenchId: null, selectedElementIds: [] };
            }

            return { activeWorkbenchId, selectedElementIds: [] };
          }),
        setSelectedElementIds: (selectedElementIds) =>
          set((state) => {
            const nextSelectedElementIds = Array.from(new Set(selectedElementIds));
            return selectionIdsEqual(state.selectedElementIds, nextSelectedElementIds)
              ? state
              : { selectedElementIds: nextSelectedElementIds };
          }),
        setTool: (tool) =>
          set((state) => ({
            tool,
            activePanel: tool === "text" || tool === "shape" ? null : state.activePanel,
          })),
        setActiveShapeType: (activeShapeType) => set({ activeShapeType }),
        setZoom: (zoom) => set({ zoom }),
        setViewport: (viewport) => set({ viewport }),
        setActivePanel: (activePanel) =>
          set({
            activePanel,
            tool: "select",
          }),
        togglePanel: (panel) =>
          set((state) => ({
            activePanel: state.activePanel === panel ? null : panel,
            tool: "select",
          })),
        deleteWorkbench: service.deleteWorkbench,
        executeCommandInWorkbench: service.executeCommandInWorkbench,
        upsertElementInWorkbench: service.upsertElementInWorkbench,
        upsertElementsInWorkbench: service.upsertElementsInWorkbench,
        deleteNodesInWorkbench: async (workbenchId, ids) => {
          if (!hasWorkbench(workbenchId) || ids.length === 0) {
            return [];
          }

          return service.deleteNodesInWorkbench(workbenchId, ids);
        },
        duplicateNodesInWorkbench: async (workbenchId, ids) => {
          if (!hasWorkbench(workbenchId) || ids.length === 0) {
            return [];
          }

          return service.duplicateNodesInWorkbench(workbenchId, ids);
        },
        reorderElementsInWorkbench: async (workbenchId, orderedIds, parentId = null) => {
          if (!hasWorkbench(workbenchId) || orderedIds.length === 0) {
            return;
          }

          await service.executeCommandInWorkbench(workbenchId, {
            type: "REORDER_CHILDREN",
            parentId,
            orderedIds,
          });
        },
        reparentNodesInWorkbench: async (workbenchId, ids, parentId, index) => {
          if (!hasWorkbench(workbenchId) || ids.length === 0) {
            return;
          }

          await service.executeCommandInWorkbench(workbenchId, {
            type: "REPARENT_NODES",
            ids,
            index,
            parentId,
          });
        },
        toggleElementVisibilityInWorkbench: async (workbenchId, id) => {
          if (!hasWorkbench(workbenchId)) {
            return;
          }

          await service.executeCommandInWorkbench(workbenchId, {
            type: "TOGGLE_NODE_VISIBILITY",
            id,
          });
        },
        toggleElementLockInWorkbench: async (workbenchId, id) => {
          if (!hasWorkbench(workbenchId)) {
            return;
          }

          await service.executeCommandInWorkbench(workbenchId, {
            type: "TOGGLE_NODE_LOCK",
            id,
          });
        },
        nudgeElementsInWorkbench: async (workbenchId, ids, dx, dy) => {
          if (!hasWorkbench(workbenchId) || ids.length === 0 || (dx === 0 && dy === 0)) {
            return;
          }

          await service.executeCommandInWorkbench(workbenchId, {
            type: "MOVE_NODES",
            ids,
            dx,
            dy,
          });
        },
        groupNodesInWorkbench: async (workbenchId, ids) => {
          const uniqueIds = Array.from(new Set(ids));
          if (!hasWorkbench(workbenchId) || uniqueIds.length < 2) {
            return null;
          }

          return service.groupNodesInWorkbench(workbenchId, uniqueIds);
        },
        ungroupNodeInWorkbench: async (workbenchId, id) => {
          if (!hasWorkbench(workbenchId)) {
            return;
          }

          const result = await service.executeCommandInWorkbench(workbenchId, {
            type: "UNGROUP_NODE",
            id,
          });
          if (!result || result.nodes[id]) {
            return;
          }

          set({ selectedElementIds: [] });
        },
        canUndoInWorkbench: (workbenchId) =>
          hasWorkbench(workbenchId) && selectCanUndoInWorkbench(get(), workbenchId),
        canRedoInWorkbench: (workbenchId) =>
          hasWorkbench(workbenchId) && selectCanRedoInWorkbench(get(), workbenchId),
        undoInWorkbench: (workbenchId) => service.undo(workbenchId),
        redoInWorkbench: (workbenchId) => service.redo(workbenchId),
      };
    },
    { name: "CanvasStore", enabled: process.env.NODE_ENV === "development" }
  )
);

on("currentUser:reset", () => {
  resetCanvasWorkbenchService();
  useCanvasStore.setState({
    workbenches: [],
    activeWorkbenchId: null,
    selectedElementIds: [],
    historyByWorkbenchId: {},
    viewport: { x: 0, y: 0 },
    zoom: 1,
    activePanel: null,
    isLoading: false,
  });
});
