import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { selectionIdsEqual } from "@/features/canvas/selectionModel";
import {
  createCanvasWorkbenchService,
  resetCanvasWorkbenchService,
} from "@/features/canvas/store/canvasWorkbenchService";
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
  CanvasNode,
  CanvasRenderableElement,
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
  upsertElement: (element: CanvasNode | CanvasRenderableElement) => Promise<void>;
  upsertElements: (elements: Array<CanvasNode | CanvasRenderableElement>) => Promise<void>;
  deleteElements: (ids: string[]) => Promise<void>;
  duplicateElements: (ids: string[]) => Promise<string[]>;
  reorderElements: (orderedIds: string[], parentId?: string | null) => Promise<void>;
  reparentNodes: (ids: string[], parentId: string | null, index?: number) => Promise<void>;
  toggleElementVisibility: (id: string) => Promise<void>;
  toggleElementLock: (id: string) => Promise<void>;
  nudgeElements: (ids: string[], dx: number, dy: number) => Promise<void>;
  groupElements: (ids: string[]) => Promise<string | null>;
  ungroupElement: (id: string) => Promise<void>;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  deleteWorkbench: (id: string, options?: DeleteWorkbenchOptions) => Promise<boolean>;
  executeCommandInWorkbench: (
    workbenchId: string,
    command: CanvasCommand,
    options?: ExecuteCommandOptions
  ) => Promise<CanvasWorkbench | null>;
  upsertElementInWorkbench: (
    workbenchId: string,
    element: CanvasNode | CanvasRenderableElement
  ) => Promise<void>;
  upsertElementsInWorkbench: (
    workbenchId: string,
    elements: Array<CanvasNode | CanvasRenderableElement>
  ) => Promise<void>;
}

const EMPTY_SLICES: CanvasWorkbench["slices"] = [];

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

export const selectActiveWorkbench = (state: CanvasState) =>
  state.activeWorkbenchId
    ? state.workbenches.find((workbench) => workbench.id === state.activeWorkbenchId) ?? null
    : null;

export const selectActiveWorkbenchName = (state: CanvasState) =>
  selectActiveWorkbench(state)?.name ?? "Untitled Workbench";

export const selectActiveWorkbenchExportState = (state: CanvasState) =>
  selectActiveWorkbench(state)?.slices ?? EMPTY_SLICES;

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
        upsertElement: async (element) => {
          const activeWorkbenchId = get().activeWorkbenchId;
          if (!activeWorkbenchId) {
            return;
          }
          await service.upsertElementInWorkbench(activeWorkbenchId, element);
        },
        upsertElements: async (elements) => {
          const activeWorkbenchId = get().activeWorkbenchId;
          if (!activeWorkbenchId) {
            return;
          }
          await service.upsertElementsInWorkbench(activeWorkbenchId, elements);
        },
        deleteElements: async (ids) => {
          const activeWorkbenchId = get().activeWorkbenchId;
          if (!activeWorkbenchId || ids.length === 0) {
            return;
          }
          await service.deleteNodesInWorkbench(activeWorkbenchId, ids);
        },
        duplicateElements: async (ids) => {
          const activeWorkbenchId = get().activeWorkbenchId;
          if (!activeWorkbenchId || ids.length === 0) {
            return [];
          }

          return service.duplicateNodesInWorkbench(activeWorkbenchId, ids);
        },
        reorderElements: async (orderedIds, parentId = null) => {
          const activeWorkbenchId = get().activeWorkbenchId;
          if (!activeWorkbenchId || orderedIds.length === 0) {
            return;
          }

          await service.executeCommandInWorkbench(activeWorkbenchId, {
            type: "REORDER_CHILDREN",
            parentId,
            orderedIds,
          });
        },
        reparentNodes: async (ids, parentId, index) => {
          const activeWorkbenchId = get().activeWorkbenchId;
          if (!activeWorkbenchId || ids.length === 0) {
            return;
          }

          await service.executeCommandInWorkbench(activeWorkbenchId, {
            type: "REPARENT_NODES",
            ids,
            index,
            parentId,
          });
        },
        toggleElementVisibility: async (id) => {
          const activeWorkbenchId = get().activeWorkbenchId;
          if (!activeWorkbenchId) {
            return;
          }

          await service.executeCommandInWorkbench(activeWorkbenchId, {
            type: "TOGGLE_NODE_VISIBILITY",
            id,
          });
        },
        toggleElementLock: async (id) => {
          const activeWorkbenchId = get().activeWorkbenchId;
          if (!activeWorkbenchId) {
            return;
          }

          await service.executeCommandInWorkbench(activeWorkbenchId, {
            type: "TOGGLE_NODE_LOCK",
            id,
          });
        },
        nudgeElements: async (ids, dx, dy) => {
          const activeWorkbenchId = get().activeWorkbenchId;
          if (!activeWorkbenchId || ids.length === 0 || (dx === 0 && dy === 0)) {
            return;
          }

          await service.executeCommandInWorkbench(activeWorkbenchId, {
            type: "MOVE_NODES",
            ids,
            dx,
            dy,
          });
        },
        groupElements: async (ids) => {
          const activeWorkbenchId = get().activeWorkbenchId;
          const uniqueIds = Array.from(new Set(ids));
          if (!activeWorkbenchId || uniqueIds.length < 2) {
            return null;
          }
          return service.groupNodesInWorkbench(activeWorkbenchId, uniqueIds);
        },
        ungroupElement: async (id) => {
          const activeWorkbenchId = get().activeWorkbenchId;
          if (!activeWorkbenchId) {
            return;
          }

          const result = await service.executeCommandInWorkbench(activeWorkbenchId, {
            type: "UNGROUP_NODE",
            id,
          });
          if (!result || result.nodes[id]) {
            return;
          }

          set({ selectedElementIds: [] });
        },
        canUndo: () => {
          const activeWorkbenchId = get().activeWorkbenchId;
          if (!activeWorkbenchId) {
            return false;
          }
          const history = get().historyByWorkbenchId[activeWorkbenchId];
          return Boolean(history && history.past.length > 0);
        },
        canRedo: () => {
          const activeWorkbenchId = get().activeWorkbenchId;
          if (!activeWorkbenchId) {
            return false;
          }
          const history = get().historyByWorkbenchId[activeWorkbenchId];
          return Boolean(history && history.future.length > 0);
        },
        undo: async () => service.undo(get().activeWorkbenchId),
        redo: async () => service.redo(get().activeWorkbenchId),
        deleteWorkbench: service.deleteWorkbench,
        executeCommandInWorkbench: service.executeCommandInWorkbench,
        upsertElementInWorkbench: service.upsertElementInWorkbench,
        upsertElementsInWorkbench: service.upsertElementsInWorkbench,
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
