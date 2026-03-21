import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { getCurrentUserId } from "@/lib/authToken";
import { selectionIdsEqual } from "@/features/canvas/selectionModel";
import {
  applyCanvasWorkbenchPatch,
  executeCanvasCommand,
  getCanvasDescendantIds,
  getCanvasNodeWorldTransform,
  getCanvasWorkbenchSnapshot,
  worldPointToLocalPoint,
} from "@/features/canvas/documentGraph";
import {
  createDefaultCanvasWorkbenchFields,
  normalizeCanvasWorkbench,
  normalizeCanvasWorkbenchWithCleanup,
} from "@/features/canvas/studioPresets";
import {
  deleteCanvasWorkbench,
  loadCanvasWorkbenchesByUser,
  saveCanvasWorkbench,
} from "@/lib/db";
import { on } from "@/lib/storeEvents";
import { createId } from "@/utils";
import type {
  CanvasCommand,
  CanvasHistoryEntry,
  CanvasNode,
  CanvasNodeId,
  CanvasRenderableElement,
  CanvasShapeType,
  CanvasWorkbench,
} from "@/types";

export type CanvasTool = "select" | "text" | "hand" | "shape";
export type CanvasFloatingPanel =
  | "edit"
  | "layers"
  | "library"
  | "story"
  | "properties"
  | "workbench"
  | null;

interface CanvasHistoryState {
  past: CanvasHistoryEntry[];
  future: CanvasHistoryEntry[];
}

interface ExecuteCommandOptions {
  trackHistory?: boolean;
}

type CanvasHistoryTransitionMode = "undo" | "redo";

interface CreateWorkbenchOptions {
  activate?: boolean;
}

interface DeleteWorkbenchOptions {
  nextActiveWorkbenchId?: string | null;
}

interface BaseWorkbenchCommitDescriptor {
  workbenchId: string;
  nextWorkbench: CanvasWorkbench;
}

interface CommandCommitDescriptor extends BaseWorkbenchCommitDescriptor {
  historyMode: "command";
  historyEntry: CanvasHistoryEntry;
  trackHistory: boolean;
}

interface HistoryTransitionCommitDescriptor extends BaseWorkbenchCommitDescriptor {
  historyMode: CanvasHistoryTransitionMode;
  historyEntry: CanvasHistoryEntry;
  historyState: CanvasHistoryState;
}

type WorkbenchCommitDescriptor =
  | CommandCommitDescriptor
  | HistoryTransitionCommitDescriptor;

interface CanvasState {
  workbenches: CanvasWorkbench[];
  activeWorkbenchId: string | null;
  selectedElementIds: string[];
  tool: CanvasTool;
  activeShapeType: CanvasShapeType;
  zoom: number;
  viewport: { x: number; y: number };
  activePanel: CanvasFloatingPanel;
  isLoading: boolean;
  historyByWorkbenchId: Record<string, CanvasHistoryState>;
  init: () => Promise<void>;
  createWorkbench: (name?: string, options?: CreateWorkbenchOptions) => Promise<CanvasWorkbench>;
  setActiveWorkbenchId: (id: string | null) => void;
  setSelectedElementIds: (ids: string[]) => void;
  setTool: (tool: CanvasTool) => void;
  setActiveShapeType: (shapeType: CanvasShapeType) => void;
  setZoom: (zoom: number) => void;
  setViewport: (viewport: { x: number; y: number }) => void;
  setActivePanel: (panel: CanvasFloatingPanel) => void;
  togglePanel: (panel: CanvasFloatingPanel) => void;
  upsertWorkbench: (workbench: CanvasWorkbench) => Promise<void>;
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
  deleteWorkbench: (id: string, options?: DeleteWorkbenchOptions) => Promise<void>;
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

const nowIso = () => new Date().toISOString();
const EMPTY_SLICES: CanvasWorkbench["slices"] = [];

type StoredCanvasWorkbench = Awaited<ReturnType<typeof loadCanvasWorkbenchesByUser>>[number];

const clone = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

let canvasResetEpoch = 0;
let canvasInitPromise: Promise<void> | null = null;

const loadCanvasWorkbenchesForCurrentUser = async (): Promise<StoredCanvasWorkbench[]> => {
  return loadCanvasWorkbenchesByUser(getCurrentUserId());
};

export const getCanvasResetEpoch = () => canvasResetEpoch;

const persistCanvasWorkbenchSnapshot = async (
  workbench: CanvasWorkbench,
  epoch: number
): Promise<boolean> => {
  if (epoch !== canvasResetEpoch) {
    return false;
  }

  const saved = await saveCanvasWorkbench(getCanvasWorkbenchSnapshot(workbench));
  if (!saved) {
    return false;
  }

  if (epoch !== canvasResetEpoch) {
    await deleteCanvasWorkbench(workbench.id);
    return false;
  }

  return true;
};

const isRenderableElement = (
  entry: CanvasNode | CanvasRenderableElement
): entry is CanvasRenderableElement => "depth" in entry && "bounds" in entry;

const toNode = (
  workbench: CanvasWorkbench,
  entry: CanvasNode | CanvasRenderableElement
): CanvasNode => {
  const parentId = entry.parentId ?? null;
  const parentWorldTransform = parentId
    ? getCanvasNodeWorldTransform(workbench, parentId)
    : null;
  const localPosition = isRenderableElement(entry)
    ? worldPointToLocalPoint(workbench, parentId, {
        x: entry.x,
        y: entry.y,
      })
    : {
        x: entry.transform.x,
        y: entry.transform.y,
      };
  const rotation = isRenderableElement(entry)
    ? entry.rotation - (parentWorldTransform?.rotation ?? 0)
    : entry.transform.rotation;
  const baseNode = {
    id: entry.id,
    type: entry.type,
    parentId,
    transform: {
      x: localPosition.x,
      y: localPosition.y,
      width: Math.max(1, entry.width),
      height: Math.max(1, entry.height),
      rotation,
    },
    x: localPosition.x,
    y: localPosition.y,
    width: Math.max(1, entry.width),
    height: Math.max(1, entry.height),
    rotation,
    opacity: entry.opacity,
    locked: entry.locked,
    visible: entry.visible,
    zIndex: entry.zIndex,
  } satisfies Pick<
    CanvasNode,
    | "height"
    | "id"
    | "locked"
    | "opacity"
    | "parentId"
    | "rotation"
    | "transform"
    | "type"
    | "visible"
    | "width"
    | "x"
    | "y"
    | "zIndex"
  >;

  if (entry.type === "group") {
    return {
      ...baseNode,
      type: "group",
      childIds: entry.childIds.slice(),
      name: entry.name,
    };
  }

  if (entry.type === "image") {
    return {
      ...baseNode,
      type: "image",
      assetId: entry.assetId,
      adjustments: entry.adjustments,
      filmProfileId: entry.filmProfileId,
    };
  }

  if (entry.type === "text") {
    return {
      ...baseNode,
      type: "text",
      color: entry.color,
      content: entry.content,
      fontFamily: entry.fontFamily,
      fontSize: entry.fontSize,
      fontSizeTier: entry.fontSizeTier,
      textAlign: entry.textAlign,
    };
  }

  return {
    ...baseNode,
    type: "shape",
    arrowHead: entry.arrowHead,
    fill: entry.fill,
    points: entry.points ? clone(entry.points) : undefined,
    radius: entry.radius,
    shapeType: entry.shapeType,
    stroke: entry.stroke,
    strokeWidth: entry.strokeWidth,
  };
};

const claimUniqueNodeId = (usedIds: Set<CanvasNodeId>) => {
  let nextId = createId("node-id");
  while (usedIds.has(nextId)) {
    nextId = createId("node-id");
  }
  usedIds.add(nextId);
  return nextId;
};

const makeDefaultWorkbench = (name = "Untitled Workbench"): CanvasWorkbench => {
  const now = nowIso();
  const defaults = createDefaultCanvasWorkbenchFields();
  return normalizeCanvasWorkbench({
    id: createId("workbench-id"),
    version: 2,
    ownerRef: { userId: getCurrentUserId() },
    name,
    ...defaults,
    backgroundColor: "#050505",
    nodes: {},
    rootIds: [],
    createdAt: now,
    updatedAt: now,
  });
};

const MAX_CANVAS_HISTORY = 50;

const createEmptyHistoryState = (): CanvasHistoryState => ({
  past: [],
  future: [],
});

const replaceWorkbenchInState = (
  workbenches: CanvasWorkbench[],
  workbenchId: string,
  nextWorkbench: CanvasWorkbench
) =>
  workbenches.map((workbench) =>
    workbench.id === workbenchId ? nextWorkbench : workbench
  );

const createHistoryEntry = (
  command: CanvasCommand,
  result: Pick<CanvasHistoryEntry, "forwardPatch" | "inversePatch">
): CanvasHistoryEntry => ({
  commandType: command.type,
  forwardPatch: result.forwardPatch,
  inversePatch: result.inversePatch,
});

const applyCommandHistory = (
  historyByWorkbenchId: Record<string, CanvasHistoryState>,
  workbenchId: string,
  historyEntry: CanvasHistoryEntry,
  trackHistory: boolean
) => {
  if (!trackHistory) {
    return historyByWorkbenchId;
  }

  const history = historyByWorkbenchId[workbenchId] ?? createEmptyHistoryState();
  return {
    ...historyByWorkbenchId,
    [workbenchId]: {
      past: [...history.past, historyEntry].slice(-MAX_CANVAS_HISTORY),
      future: [],
    },
  };
};

const applyHistoryTransition = (
  historyByWorkbenchId: Record<string, CanvasHistoryState>,
  workbenchId: string,
  mode: CanvasHistoryTransitionMode,
  historyEntry: CanvasHistoryEntry,
  historyState: CanvasHistoryState
) => ({
  ...historyByWorkbenchId,
  [workbenchId]:
    mode === "undo"
      ? {
          past: historyState.past.slice(0, -1),
          future: [historyEntry, ...historyState.future].slice(0, MAX_CANVAS_HISTORY),
        }
      : {
          past: [...historyState.past, historyEntry].slice(-MAX_CANVAS_HISTORY),
          future: historyState.future.slice(1),
        },
});

const commitCommandResultToState = (
  state: CanvasState,
  descriptor: WorkbenchCommitDescriptor,
  selectedElementIds?: string[]
):
  | Pick<CanvasState, "workbenches" | "historyByWorkbenchId">
  | Pick<CanvasState, "workbenches" | "historyByWorkbenchId" | "selectedElementIds"> => {
  const workbenches = replaceWorkbenchInState(
    state.workbenches,
    descriptor.workbenchId,
    descriptor.nextWorkbench
  );
  const historyByWorkbenchId =
    descriptor.historyMode === "command"
      ? applyCommandHistory(
          state.historyByWorkbenchId,
          descriptor.workbenchId,
          descriptor.historyEntry,
          descriptor.trackHistory
        )
      : applyHistoryTransition(
          state.historyByWorkbenchId,
          descriptor.workbenchId,
          descriptor.historyMode,
          descriptor.historyEntry,
          descriptor.historyState
        );

  if (selectedElementIds === undefined) {
    return {
      workbenches,
      historyByWorkbenchId,
    };
  }

  return {
    workbenches,
    historyByWorkbenchId,
    selectedElementIds,
  };
};

const cloneNodeTree = (
  workbench: CanvasWorkbench,
  nodeId: CanvasNodeId,
  offset: { x: number; y: number },
  usedIds: Set<CanvasNodeId>,
  idMap = new Map<CanvasNodeId, CanvasNodeId>()
): CanvasNode[] => {
  const source = workbench.nodes[nodeId];
  if (!source) {
    return [];
  }

  const nextId = claimUniqueNodeId(usedIds);
  idMap.set(nodeId, nextId);
  const cloneNode: CanvasNode = {
    ...clone(source),
    id: nextId,
    transform: {
      ...source.transform,
      x: source.transform.x + offset.x,
      y: source.transform.y + offset.y,
    },
  };

  if (cloneNode.type === "group") {
    const sourceGroup = source.type === "group" ? source : null;
    if (!sourceGroup) {
      return [cloneNode];
    }
    const children = sourceGroup.childIds.flatMap((childId) =>
      cloneNodeTree(workbench, childId, { x: 0, y: 0 }, usedIds, idMap)
    );
    cloneNode.childIds = sourceGroup.childIds
      .map((childId) => idMap.get(childId))
      .filter((childId): childId is string => Boolean(childId));
    for (const child of children) {
      child.parentId = cloneNode.id;
    }
    return [cloneNode, ...children];
  }

  return [cloneNode];
};

export const selectActiveWorkbench = (state: CanvasState) =>
  state.activeWorkbenchId
    ? state.workbenches.find((workbench) => workbench.id === state.activeWorkbenchId) ?? null
    : null;

export const selectActiveWorkbenchName = (state: CanvasState) =>
  selectActiveWorkbench(state)?.name ?? "未命名工作台";

export const selectActiveWorkbenchExportState = (state: CanvasState) =>
  selectActiveWorkbench(state)?.slices ?? EMPTY_SLICES;

export const useCanvasStore = create<CanvasState>()(
  devtools(
    (set, get) => {
      const resolveCommandTarget = (workbenchId: string) =>
        get().workbenches.find((workbench) => workbench.id === workbenchId) ?? null;

      const runWorkbenchCommand = (
        workbenchId: string,
        existing: CanvasWorkbench,
        command: CanvasCommand,
        options?: ExecuteCommandOptions
      ) => {
        const result = executeCanvasCommand(existing, command);
        if (!result.didChange) {
          return { kind: "noop" as const, workbench: existing };
        }

        return {
          kind: "commit" as const,
          descriptor: {
            workbenchId,
            nextWorkbench: result.document,
            historyMode: "command",
            historyEntry: createHistoryEntry(command, result),
            trackHistory: options?.trackHistory !== false,
          } satisfies CommandCommitDescriptor,
        };
      };

      const persistCommittedWorkbench = async (
        workbench: CanvasWorkbench,
        epoch: number
      ) => persistCanvasWorkbenchSnapshot(workbench, epoch);

      const commitDescriptorToStore = async (
        descriptor: WorkbenchCommitDescriptor,
        epoch: number,
        selectedElementIds?: string[]
      ) => {
        if (!(await persistCommittedWorkbench(descriptor.nextWorkbench, epoch))) {
          return false;
        }

        let didCommit = false;
        set((state) => {
          if (epoch !== canvasResetEpoch) {
            return state;
          }

          didCommit = true;
          return commitCommandResultToState(state, descriptor, selectedElementIds);
        });

        return didCommit;
      };

      const createHistoryTransitionDescriptor = (
        workbenchId: string,
        workbench: CanvasWorkbench,
        historyMode: CanvasHistoryTransitionMode,
        historyEntry: CanvasHistoryEntry,
        historyState: CanvasHistoryState
      ): HistoryTransitionCommitDescriptor => ({
        workbenchId,
        nextWorkbench: applyCanvasWorkbenchPatch(
          workbench,
          historyMode === "undo" ? historyEntry.inversePatch : historyEntry.forwardPatch
        ),
        historyMode,
        historyEntry,
        historyState,
      });

      const executeWorkbenchCommand = async (
        workbenchId: string,
        command: CanvasCommand,
        options?: ExecuteCommandOptions
      ) => {
        const existing = resolveCommandTarget(workbenchId);
        if (!existing) {
          return null;
        }

        const epoch = getCanvasResetEpoch();
        const commandResult = runWorkbenchCommand(workbenchId, existing, command, options);
        if (commandResult.kind === "noop") {
          return commandResult.workbench;
        }

        if (!(await commitDescriptorToStore(commandResult.descriptor, epoch))) {
          return null;
        }

        return commandResult.descriptor.nextWorkbench;
      };

      const getActiveWorkbench = () => selectActiveWorkbench(get());
      const hasWorkbench = (workbenchId: string | null) =>
        Boolean(workbenchId && get().workbenches.some((workbench) => workbench.id === workbenchId));

      return {
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
        init: async () => {
          if (canvasInitPromise) {
            return canvasInitPromise;
          }

          canvasInitPromise = (async () => {
            set({ isLoading: true });
            const epoch = getCanvasResetEpoch();
            try {
              const loadedWorkbenches = await loadCanvasWorkbenchesForCurrentUser();
              if (epoch !== canvasResetEpoch) {
                return;
              }
              const normalizedWorkbenches = loadedWorkbenches.map((workbench) =>
                normalizeCanvasWorkbenchWithCleanup(workbench)
              );
              const workbenches = normalizedWorkbenches.map((entry) => entry.document);

              await Promise.all(
                normalizedWorkbenches.map((entry, index) => {
                  const original = loadedWorkbenches[index];
                  if (!original) {
                    return Promise.resolve(false);
                  }
                  const normalizedSnapshot = getCanvasWorkbenchSnapshot(entry.document);
                  return JSON.stringify(original) === JSON.stringify(normalizedSnapshot)
                    ? Promise.resolve(false)
                    : persistCanvasWorkbenchSnapshot(entry.document, epoch);
                })
              );

              if (epoch !== canvasResetEpoch) {
                return;
              }

              set({
                workbenches,
                activeWorkbenchId: workbenches[0]?.id ?? null,
                isLoading: false,
              });
            } catch (error) {
              if (epoch === canvasResetEpoch) {
                set({ isLoading: false });
              }
              console.warn("Canvas store initialization failed.", error);
            }
          })().finally(() => {
            canvasInitPromise = null;
          });

          return canvasInitPromise;
        },
        createWorkbench: async (name, options) => {
          const epoch = getCanvasResetEpoch();
          const workbench = makeDefaultWorkbench(name);
          if (!(await persistCanvasWorkbenchSnapshot(workbench, epoch))) {
            return workbench;
          }
          if (epoch !== canvasResetEpoch) {
            return workbench;
          }

          set((state) => ({
            workbenches: [workbench, ...state.workbenches],
            activeWorkbenchId: options?.activate === false ? state.activeWorkbenchId : workbench.id,
            selectedElementIds: options?.activate === false ? state.selectedElementIds : [],
            historyByWorkbenchId: {
              ...state.historyByWorkbenchId,
              [workbench.id]: { past: [], future: [] },
            },
            viewport: options?.activate === false ? state.viewport : { x: 0, y: 0 },
            zoom: options?.activate === false ? state.zoom : 1,
          }));
          return workbench;
        },
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
        upsertWorkbench: async (workbench) => {
          const normalized = normalizeCanvasWorkbench(getCanvasWorkbenchSnapshot(workbench));
          const existing = get().workbenches.find((item) => item.id === normalized.id);
          if (!existing) {
            const epoch = getCanvasResetEpoch();
            if (!(await persistCanvasWorkbenchSnapshot(normalized, epoch))) {
              return;
            }
            if (epoch !== canvasResetEpoch) {
              return;
            }
            set((state) => ({
              workbenches: [normalized, ...state.workbenches],
            }));
            return;
          }

          await executeWorkbenchCommand(
            normalized.id,
            {
              type: "PATCH_DOCUMENT",
              patch: {
                backgroundColor: normalized.backgroundColor,
                guides: normalized.guides,
                height: normalized.height,
                name: normalized.name,
                presetId: normalized.presetId,
                safeArea: normalized.safeArea,
                slices: normalized.slices,
                thumbnailBlob: normalized.thumbnailBlob,
                width: normalized.width,
              },
            },
            { trackHistory: false }
          );
        },
        executeCommandInWorkbench: executeWorkbenchCommand,
        upsertElementInWorkbench: async (workbenchId, element) => {
          const activeWorkbench = resolveCommandTarget(workbenchId);
          if (!activeWorkbench) {
            return;
          }

          const existingNode = activeWorkbench.nodes[element.id];
          if (existingNode) {
            if (existingNode.type !== element.type) {
              return;
            }
            const nextNode = toNode(activeWorkbench, element);
            await executeWorkbenchCommand(workbenchId, {
              type: "UPDATE_NODE_PROPS",
              updates: [
                {
                  id: element.id,
                  patch: {
                    ...nextNode.transform,
                    ...(element.type === "text"
                      ? {
                          color: element.color,
                          content: element.content,
                          fontFamily: element.fontFamily,
                          fontSize: element.fontSize,
                          fontSizeTier: element.fontSizeTier,
                          textAlign: element.textAlign,
                        }
                      : {}),
                    ...(element.type === "image"
                      ? {
                          adjustments: element.adjustments,
                          filmProfileId: element.filmProfileId,
                        }
                      : {}),
                    ...(element.type === "shape"
                      ? {
                          arrowHead: element.arrowHead,
                          fill: element.fill,
                          points: element.points,
                          radius: element.radius,
                          shapeType: element.shapeType,
                          stroke: element.stroke,
                          strokeWidth: element.strokeWidth,
                        }
                      : {}),
                    locked: element.locked,
                    opacity: element.opacity,
                    visible: element.visible,
                  },
                },
              ],
            });
            return;
          }

          const nextNode = toNode(activeWorkbench, element);
          await executeWorkbenchCommand(workbenchId, {
            type: "INSERT_NODES",
            nodes: [nextNode],
            parentId: nextNode.parentId,
          });
        },
        upsertElementsInWorkbench: async (workbenchId, elements) => {
          for (const element of elements) {
            await get().upsertElementInWorkbench(workbenchId, element);
          }
        },
        upsertElement: async (element) => {
          const activeWorkbenchId = get().activeWorkbenchId;
          if (!activeWorkbenchId) {
            return;
          }
          await get().upsertElementInWorkbench(activeWorkbenchId, element);
        },
        upsertElements: async (elements) => {
          const activeWorkbenchId = get().activeWorkbenchId;
          if (!activeWorkbenchId) {
            return;
          }
          await get().upsertElementsInWorkbench(activeWorkbenchId, elements);
        },
        deleteElements: async (ids) => {
          const activeWorkbench = getActiveWorkbench();
          if (!activeWorkbench || ids.length === 0) {
            return;
          }

          const deleteIds = Array.from(
            new Set(
              ids.flatMap((nodeId) => [nodeId, ...getCanvasDescendantIds(activeWorkbench, nodeId)])
            )
          ).filter((nodeId) => Boolean(activeWorkbench.nodes[nodeId]));
          if (deleteIds.length === 0) {
            return;
          }

          const result = await executeWorkbenchCommand(activeWorkbench.id, {
            type: "DELETE_NODES",
            ids: deleteIds,
          });
          if (!result) {
            return;
          }
          const deleteIdSet = new Set(deleteIds);
          set((state) => ({
            selectedElementIds: state.selectedElementIds.filter((id) => !deleteIdSet.has(id)),
          }));
        },
        duplicateElements: async (ids) => {
          const activeWorkbench = getActiveWorkbench();
          if (!activeWorkbench || ids.length === 0) {
            return [];
          }

          const uniqueIds = Array.from(new Set(ids));
          const selectedRoots = uniqueIds.filter(
            (nodeId) =>
              !uniqueIds.some((candidateId) =>
                getCanvasDescendantIds(activeWorkbench, candidateId).includes(nodeId)
              )
          );
          const usedIds = new Set(Object.keys(activeWorkbench.nodes));
          const duplicatedTrees = selectedRoots.map((nodeId) =>
            cloneNodeTree(activeWorkbench, nodeId, { x: 24, y: 24 }, usedIds)
          );
          const duplicates = duplicatedTrees.flat();
          const duplicatedIds = duplicatedTrees
            .map((nodes) => nodes[0]?.id ?? null)
            .filter((nodeId): nodeId is string => Boolean(nodeId));

          const result = await executeWorkbenchCommand(activeWorkbench.id, {
            type: "INSERT_NODES",
            nodes: duplicates,
          });
          if (!result) {
            return [];
          }
          set({ selectedElementIds: duplicatedIds });
          return duplicatedIds;
        },
        reorderElements: async (orderedIds, parentId = null) => {
          const activeWorkbench = getActiveWorkbench();
          if (!activeWorkbench || orderedIds.length === 0) {
            return;
          }

          await executeWorkbenchCommand(activeWorkbench.id, {
            type: "REORDER_CHILDREN",
            parentId,
            orderedIds,
          });
        },
        reparentNodes: async (ids, parentId, index) => {
          const activeWorkbench = getActiveWorkbench();
          if (!activeWorkbench || ids.length === 0) {
            return;
          }

          await executeWorkbenchCommand(activeWorkbench.id, {
            type: "REPARENT_NODES",
            ids,
            index,
            parentId,
          });
        },
        toggleElementVisibility: async (id) => {
          const activeWorkbench = getActiveWorkbench();
          if (!activeWorkbench) {
            return;
          }

          await executeWorkbenchCommand(activeWorkbench.id, {
            type: "TOGGLE_NODE_VISIBILITY",
            id,
          });
        },
        toggleElementLock: async (id) => {
          const activeWorkbench = getActiveWorkbench();
          if (!activeWorkbench) {
            return;
          }

          await executeWorkbenchCommand(activeWorkbench.id, {
            type: "TOGGLE_NODE_LOCK",
            id,
          });
        },
        nudgeElements: async (ids, dx, dy) => {
          const activeWorkbench = getActiveWorkbench();
          if (!activeWorkbench || ids.length === 0 || (dx === 0 && dy === 0)) {
            return;
          }

          await executeWorkbenchCommand(activeWorkbench.id, {
            type: "MOVE_NODES",
            ids,
            dx,
            dy,
          });
        },
        groupElements: async (ids) => {
          const activeWorkbench = getActiveWorkbench();
          const uniqueIds = Array.from(new Set(ids));
          if (!activeWorkbench || uniqueIds.length < 2) {
            return null;
          }

          const groupId = claimUniqueNodeId(new Set(Object.keys(activeWorkbench.nodes)));
          const result = await executeWorkbenchCommand(activeWorkbench.id, {
            type: "GROUP_NODES",
            ids: uniqueIds,
            groupId,
          });
          if (!result?.nodes[groupId] || result.nodes[groupId].type !== "group") {
            return null;
          }

          set({ selectedElementIds: [groupId] });
          return groupId;
        },
        ungroupElement: async (id) => {
          const activeWorkbench = getActiveWorkbench();
          if (!activeWorkbench) {
            return;
          }

          const result = await executeWorkbenchCommand(activeWorkbench.id, {
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
        undo: async () => {
          const activeWorkbenchId = get().activeWorkbenchId;
          const activeWorkbench = getActiveWorkbench();
          if (!activeWorkbenchId || !activeWorkbench) {
            return false;
          }
          const epoch = getCanvasResetEpoch();

          const history =
            get().historyByWorkbenchId[activeWorkbenchId] ?? createEmptyHistoryState();
          const previous = history.past[history.past.length - 1];
          if (!previous) {
            return false;
          }

          const descriptor = createHistoryTransitionDescriptor(
            activeWorkbenchId,
            activeWorkbench,
            "undo",
            previous,
            history
          );
          if (
            !(await commitDescriptorToStore(descriptor, epoch, []))
          ) {
            return false;
          }
          return true;
        },
        redo: async () => {
          const activeWorkbenchId = get().activeWorkbenchId;
          const activeWorkbench = getActiveWorkbench();
          if (!activeWorkbenchId || !activeWorkbench) {
            return false;
          }
          const epoch = getCanvasResetEpoch();

          const history =
            get().historyByWorkbenchId[activeWorkbenchId] ?? createEmptyHistoryState();
          const nextEntry = history.future[0];
          if (!nextEntry) {
            return false;
          }

          const descriptor = createHistoryTransitionDescriptor(
            activeWorkbenchId,
            activeWorkbench,
            "redo",
            nextEntry,
            history
          );
          if (
            !(await commitDescriptorToStore(descriptor, epoch, []))
          ) {
            return false;
          }
          return true;
        },
        deleteWorkbench: async (id, options) => {
          const epoch = getCanvasResetEpoch();
          await deleteCanvasWorkbench(id);
          if (epoch !== canvasResetEpoch) {
            return;
          }
          set((state) => {
            const workbenches = state.workbenches.filter((item) => item.id !== id);
            const isValidNextActiveWorkbenchId = (candidate: string | null | undefined) =>
              candidate !== null && candidate !== undefined
                ? workbenches.some((workbench) => workbench.id === candidate)
                : candidate === null;
            const nextActiveWorkbenchId =
              options?.nextActiveWorkbenchId !== undefined
                ? options.nextActiveWorkbenchId === null
                  ? state.activeWorkbenchId === id
                    ? null
                    : state.activeWorkbenchId
                  : isValidNextActiveWorkbenchId(options.nextActiveWorkbenchId)
                    ? options.nextActiveWorkbenchId
                    : null
                : state.activeWorkbenchId === id
                  ? (workbenches[0]?.id ?? null)
                  : state.activeWorkbenchId;
            const nextHistory = { ...state.historyByWorkbenchId };
            delete nextHistory[id];
            const activeChanged = nextActiveWorkbenchId !== state.activeWorkbenchId;
            return {
              workbenches,
              activeWorkbenchId: nextActiveWorkbenchId,
              selectedElementIds: activeChanged ? [] : state.selectedElementIds,
              historyByWorkbenchId: nextHistory,
            };
          });
        },
      };
    },
    { name: "CanvasStore", enabled: process.env.NODE_ENV === "development" }
  )
);

on("currentUser:reset", () => {
  canvasResetEpoch += 1;
  canvasInitPromise = null;
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
