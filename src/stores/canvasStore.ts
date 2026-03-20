import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { selectionIdsEqual } from "@/features/canvas/selectionModel";
import {
  applyCanvasDocumentPatch,
  executeCanvasCommand,
  getCanvasNodeWorldTransform,
  getCanvasDescendantIds,
  getCanvasDocumentSnapshot,
  worldPointToLocalPoint,
} from "@/features/canvas/documentGraph";
import {
  createDefaultCanvasDocumentFields,
  normalizeCanvasDocument,
  normalizeCanvasDocumentWithCleanup,
} from "@/features/canvas/studioPresets";
import { deleteCanvasDocument, loadCanvasDocuments, saveCanvasDocument } from "@/lib/db";
import type {
  CanvasCommand,
  CanvasDocument,
  CanvasHistoryEntry,
  CanvasNode,
  CanvasNodeId,
  CanvasRenderableElement,
  CanvasShapeType,
} from "@/types";

export type CanvasTool = "select" | "text" | "hand" | "shape";
export type CanvasFloatingPanel =
  | "edit"
  | "layers"
  | "library"
  | "story"
  | "properties"
  | "project"
  | null;

interface CanvasHistoryState {
  past: CanvasHistoryEntry[];
  future: CanvasHistoryEntry[];
}

interface ExecuteCommandOptions {
  trackHistory?: boolean;
}

interface CanvasState {
  documents: CanvasDocument[];
  activeDocumentId: string | null;
  selectedElementIds: string[];
  tool: CanvasTool;
  activeShapeType: CanvasShapeType;
  zoom: number;
  viewport: { x: number; y: number };
  activePanel: CanvasFloatingPanel;
  isLoading: boolean;
  historyByDocumentId: Record<string, CanvasHistoryState>;
  init: () => Promise<void>;
  createDocument: (name?: string) => Promise<CanvasDocument>;
  setActiveDocumentId: (id: string | null) => void;
  setSelectedElementIds: (ids: string[]) => void;
  setTool: (tool: CanvasTool) => void;
  setActiveShapeType: (shapeType: CanvasShapeType) => void;
  setZoom: (zoom: number) => void;
  setViewport: (viewport: { x: number; y: number }) => void;
  setActivePanel: (panel: CanvasFloatingPanel) => void;
  togglePanel: (panel: CanvasFloatingPanel) => void;
  executeCommand: (
    documentId: string,
    command: CanvasCommand,
    options?: ExecuteCommandOptions
  ) => Promise<CanvasDocument | null>;
  upsertDocument: (document: CanvasDocument) => Promise<void>;
  upsertElement: (documentId: string, element: CanvasNode | CanvasRenderableElement) => Promise<void>;
  upsertElements: (
    documentId: string,
    elements: Array<CanvasNode | CanvasRenderableElement>
  ) => Promise<void>;
  deleteElements: (documentId: string, ids: string[]) => Promise<void>;
  duplicateElements: (documentId: string, ids: string[]) => Promise<string[]>;
  reorderElements: (documentId: string, orderedIds: string[], parentId?: string | null) => Promise<void>;
  toggleElementVisibility: (documentId: string, id: string) => Promise<void>;
  toggleElementLock: (documentId: string, id: string) => Promise<void>;
  nudgeElements: (documentId: string, ids: string[], dx: number, dy: number) => Promise<void>;
  groupElements: (documentId: string, ids: string[]) => Promise<string | null>;
  ungroupElement: (documentId: string, id: string) => Promise<void>;
  canUndo: (documentId: string) => boolean;
  canRedo: (documentId: string) => boolean;
  undo: (documentId: string) => Promise<boolean>;
  redo: (documentId: string) => Promise<boolean>;
  deleteDocument: (id: string) => Promise<void>;
}

const nowIso = () => new Date().toISOString();

const createDocumentId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `doc-${Date.now()}`;
};

const createNodeId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `node-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
};

const clone = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const isRenderableElement = (
  entry: CanvasNode | CanvasRenderableElement
): entry is CanvasRenderableElement => "depth" in entry && "bounds" in entry;

const toNode = (
  document: CanvasDocument,
  entry: CanvasNode | CanvasRenderableElement
): CanvasNode => {
  const parentId = entry.parentId ?? null;
  const parentWorldTransform = parentId
    ? getCanvasNodeWorldTransform(document, parentId)
    : null;
  const localPosition = isRenderableElement(entry)
    ? worldPointToLocalPoint(document, parentId, {
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

const makeDefaultDocument = (name = "Untitled board"): CanvasDocument => {
  const now = nowIso();
  const defaults = createDefaultCanvasDocumentFields();
  return normalizeCanvasDocument({
    id: createDocumentId(),
    version: 2,
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

const cloneNodeTree = (
  document: CanvasDocument,
  nodeId: CanvasNodeId,
  offset: { x: number; y: number },
  idMap = new Map<CanvasNodeId, CanvasNodeId>()
): CanvasNode[] => {
  const source = document.nodes[nodeId];
  if (!source) {
    return [];
  }

  const nextId = createNodeId();
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
    const children = sourceGroup.childIds.flatMap((childId: string) =>
      cloneNodeTree(document, childId, { x: 0, y: 0 }, idMap)
    );
    cloneNode.childIds = sourceGroup.childIds
      .map((childId: string) => idMap.get(childId))
      .filter((childId): childId is string => Boolean(childId));
    for (const child of children) {
      child.parentId = cloneNode.id;
    }
    return [cloneNode, ...children];
  }

  return [cloneNode];
};

export const useCanvasStore = create<CanvasState>()(
  devtools(
    (set, get) => ({
      documents: [],
      activeDocumentId: null,
      selectedElementIds: [],
      tool: "select",
      activeShapeType: "rect",
      zoom: 1,
      viewport: { x: 0, y: 0 },
      activePanel: null,
      isLoading: false,
      historyByDocumentId: {},
      init: async () => {
        set({ isLoading: true });
        const loadedDocuments = await loadCanvasDocuments();
        const normalizedDocuments = loadedDocuments.map((document) =>
          normalizeCanvasDocumentWithCleanup(document)
        );
        const documents = normalizedDocuments.map((entry) => entry.document);
        await Promise.all(
          normalizedDocuments.map((entry, index) => {
            const original = loadedDocuments[index];
            if (!original) {
              return Promise.resolve(false);
            }
            const normalizedSnapshot = getCanvasDocumentSnapshot(entry.document);
            return JSON.stringify(original) === JSON.stringify(normalizedSnapshot)
              ? Promise.resolve(false)
              : saveCanvasDocument(normalizedSnapshot);
          })
        );
        set({
          documents,
          activeDocumentId: documents[0]?.id ?? null,
          isLoading: false,
        });
      },
      createDocument: async (name) => {
        const document = makeDefaultDocument(name);
        await saveCanvasDocument(getCanvasDocumentSnapshot(document));
        set((state) => ({
          documents: [document, ...state.documents],
          activeDocumentId: document.id,
          selectedElementIds: [],
          historyByDocumentId: {
            ...state.historyByDocumentId,
            [document.id]: { past: [], future: [] },
          },
          viewport: { x: 0, y: 0 },
          zoom: 1,
        }));
        return document;
      },
      setActiveDocumentId: (activeDocumentId) =>
        set({ activeDocumentId, selectedElementIds: [] }),
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
      executeCommand: async (documentId, command, options) => {
        const existing = get().documents.find((document) => document.id === documentId);
        if (!existing) {
          return null;
        }

        const result = executeCanvasCommand(existing, command);
        if (!result.didChange) {
          return existing;
        }
        await saveCanvasDocument(getCanvasDocumentSnapshot(result.document));

        set((state) => {
          const history = state.historyByDocumentId[documentId] ?? { past: [], future: [] };
          const nextHistoryByDocumentId = { ...state.historyByDocumentId };
          nextHistoryByDocumentId[documentId] =
            options?.trackHistory === false
              ? history
              : {
                  past: [...history.past, result.forwardPatch && result.inversePatch
                    ? {
                        commandType: command.type,
                        forwardPatch: result.forwardPatch,
                        inversePatch: result.inversePatch,
                      }
                    : undefined]
                    .filter((entry): entry is CanvasHistoryEntry => Boolean(entry))
                    .slice(-MAX_CANVAS_HISTORY),
                  future: [],
                };

          return {
            documents: state.documents.map((document) =>
              document.id === documentId ? result.document : document
            ),
            historyByDocumentId: nextHistoryByDocumentId,
          };
        });

        return result.document;
      },
      upsertDocument: async (document) => {
        const normalized = normalizeCanvasDocument(getCanvasDocumentSnapshot(document));
        const existing = get().documents.find((item) => item.id === normalized.id);
        if (!existing) {
          await saveCanvasDocument(getCanvasDocumentSnapshot(normalized));
          set((state) => ({
            documents: [normalized, ...state.documents],
          }));
          return;
        }

        await get().executeCommand(normalized.id, {
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
        }, { trackHistory: false });
      },
      upsertElement: async (documentId, element) => {
        const document = get().documents.find((entry) => entry.id === documentId);
        if (!document) {
          return;
        }
        const existingNode = document.nodes[element.id];
        if (existingNode) {
          const nextNode = toNode(document, element);
          await get().executeCommand(documentId, {
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

        const nextNode = toNode(document, element);
        await get().executeCommand(documentId, {
          type: "INSERT_NODES",
          nodes: [nextNode],
          parentId: nextNode.parentId,
        });
      },
      upsertElements: async (documentId, elements) => {
        for (const element of elements) {
          await get().upsertElement(documentId, element);
        }
      },
      deleteElements: async (documentId, ids) => {
        if (ids.length === 0) {
          return;
        }
        await get().executeCommand(documentId, {
          type: "DELETE_NODES",
          ids,
        });
        set((state) => ({
          selectedElementIds: state.selectedElementIds.filter((id) => !ids.includes(id)),
        }));
      },
      duplicateElements: async (documentId, ids) => {
        const document = get().documents.find((entry) => entry.id === documentId);
        if (!document || ids.length === 0) {
          return [];
        }

        const selectedRoots = Array.from(new Set(ids)).filter(
          (nodeId) =>
            !ids.some((candidateId) =>
              getCanvasDescendantIds(document, candidateId).includes(nodeId)
            )
        );
        const duplicatedTrees = selectedRoots.map((nodeId) =>
          cloneNodeTree(document, nodeId, { x: 24, y: 24 })
        );
        const duplicates = duplicatedTrees.flat();
        const duplicatedIds = duplicatedTrees
          .map((nodes) => nodes[0]?.id ?? null)
          .filter((nodeId): nodeId is string => Boolean(nodeId));

        await get().executeCommand(documentId, {
          type: "INSERT_NODES",
          nodes: duplicates,
        });
        set({ selectedElementIds: duplicatedIds });
        return duplicatedIds;
      },
      reorderElements: async (documentId, orderedIds, parentId = null) => {
        if (orderedIds.length === 0) {
          return;
        }
        await get().executeCommand(documentId, {
          type: "REORDER_CHILDREN",
          parentId,
          orderedIds,
        });
      },
      toggleElementVisibility: async (documentId, id) => {
        await get().executeCommand(documentId, {
          type: "TOGGLE_NODE_VISIBILITY",
          id,
        });
      },
      toggleElementLock: async (documentId, id) => {
        await get().executeCommand(documentId, {
          type: "TOGGLE_NODE_LOCK",
          id,
        });
      },
      nudgeElements: async (documentId, ids, dx, dy) => {
        if (ids.length === 0 || (dx === 0 && dy === 0)) {
          return;
        }
        await get().executeCommand(documentId, {
          type: "MOVE_NODES",
          ids,
          dx,
          dy,
        });
      },
      groupElements: async (documentId, ids) => {
        const uniqueIds = Array.from(new Set(ids));
        if (uniqueIds.length < 2) {
          return null;
        }
        const groupId = createNodeId();
        const result = await get().executeCommand(documentId, {
          type: "GROUP_NODES",
          ids: uniqueIds,
          groupId,
        });
        if (result?.nodes[groupId]?.type !== "group") {
          return null;
        }
        set({ selectedElementIds: [groupId] });
        return groupId;
      },
      ungroupElement: async (documentId, id) => {
        const result = await get().executeCommand(documentId, {
          type: "UNGROUP_NODE",
          id,
        });
        if (!result || result.nodes[id]) {
          return;
        }
        set({ selectedElementIds: [] });
      },
      canUndo: (documentId) => {
        const history = get().historyByDocumentId[documentId];
        return Boolean(history && history.past.length > 0);
      },
      canRedo: (documentId) => {
        const history = get().historyByDocumentId[documentId];
        return Boolean(history && history.future.length > 0);
      },
      undo: async (documentId) => {
        const existing = get().documents.find((document) => document.id === documentId);
        if (!existing) {
          return false;
        }
        const history = get().historyByDocumentId[documentId] ?? { past: [], future: [] };
        const previous = history.past[history.past.length - 1];
        if (!previous) {
          return false;
        }
        const resultDocument = applyCanvasDocumentPatch(existing, previous.inversePatch);
        await saveCanvasDocument(getCanvasDocumentSnapshot(resultDocument));
        set((state) => ({
          documents: state.documents.map((document) =>
            document.id === documentId ? resultDocument : document
          ),
          historyByDocumentId: {
            ...state.historyByDocumentId,
            [documentId]: {
              past: history.past.slice(0, -1),
              future: [previous, ...history.future].slice(0, MAX_CANVAS_HISTORY),
            },
          },
          selectedElementIds: [],
        }));
        return true;
      },
      redo: async (documentId) => {
        const existing = get().documents.find((document) => document.id === documentId);
        if (!existing) {
          return false;
        }
        const history = get().historyByDocumentId[documentId] ?? { past: [], future: [] };
        const nextEntry = history.future[0];
        if (!nextEntry) {
          return false;
        }
        const resultDocument = applyCanvasDocumentPatch(existing, nextEntry.forwardPatch);
        await saveCanvasDocument(getCanvasDocumentSnapshot(resultDocument));
        set((state) => ({
          documents: state.documents.map((document) =>
            document.id === documentId ? resultDocument : document
          ),
          historyByDocumentId: {
            ...state.historyByDocumentId,
            [documentId]: {
              past: [...history.past, nextEntry].slice(-MAX_CANVAS_HISTORY),
              future: history.future.slice(1),
            },
          },
          selectedElementIds: [],
        }));
        return true;
      },
      deleteDocument: async (id) => {
        await deleteCanvasDocument(id);
        set((state) => {
          const documents = state.documents.filter((item) => item.id !== id);
          const activeDocumentId =
            state.activeDocumentId === id ? (documents[0]?.id ?? null) : state.activeDocumentId;
          const nextHistory = { ...state.historyByDocumentId };
          delete nextHistory[id];
          return {
            documents,
            activeDocumentId,
            selectedElementIds: activeDocumentId ? state.selectedElementIds : [],
            historyByDocumentId: nextHistory,
          };
        });
      },
    }),
    { name: "CanvasStore", enabled: process.env.NODE_ENV === "development" }
  )
);
