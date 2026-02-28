import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { deleteCanvasDocument, loadCanvasDocuments, saveCanvasDocument } from "@/lib/db";
import type { CanvasDocument, CanvasElement } from "@/types";

export type CanvasTool = "select" | "text" | "shape" | "hand";
export type CanvasShapeType = "rect" | "circle" | "line";

interface CanvasHistoryState {
  past: CanvasElement[][];
  future: CanvasElement[][];
}

interface CanvasState {
  documents: CanvasDocument[];
  activeDocumentId: string | null;
  selectedElementIds: string[];
  tool: CanvasTool;
  shapeType: CanvasShapeType;
  zoom: number;
  viewport: { x: number; y: number };
  isLoading: boolean;
  historyByDocumentId: Record<string, CanvasHistoryState>;
  init: () => Promise<void>;
  createDocument: (name?: string) => Promise<CanvasDocument>;
  setActiveDocumentId: (id: string | null) => void;
  setSelectedElementIds: (ids: string[]) => void;
  setTool: (tool: CanvasTool) => void;
  setShapeType: (shapeType: CanvasShapeType) => void;
  setZoom: (zoom: number) => void;
  setViewport: (viewport: { x: number; y: number }) => void;
  upsertDocument: (document: CanvasDocument) => Promise<void>;
  upsertElement: (documentId: string, element: CanvasElement) => Promise<void>;
  upsertElements: (documentId: string, elements: CanvasElement[]) => Promise<void>;
  deleteElements: (documentId: string, ids: string[]) => Promise<void>;
  duplicateElements: (documentId: string, ids: string[]) => Promise<string[]>;
  reorderElements: (documentId: string, orderedIds: string[]) => Promise<void>;
  toggleElementVisibility: (documentId: string, id: string) => Promise<void>;
  toggleElementLock: (documentId: string, id: string) => Promise<void>;
  nudgeElements: (documentId: string, ids: string[], dx: number, dy: number) => Promise<void>;
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

const createElementId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `el-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
};

const cloneElements = (elements: CanvasElement[]): CanvasElement[] => {
  if (typeof structuredClone === "function") {
    return structuredClone(elements) as CanvasElement[];
  }
  return JSON.parse(JSON.stringify(elements)) as CanvasElement[];
};

const normalizeElements = (elements: CanvasElement[]) =>
  elements
    .slice()
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((element, index) => ({
      ...element,
      zIndex: index + 1,
    }));

const MAX_CANVAS_HISTORY = 50;

const elementsSignature = (elements: CanvasElement[]) =>
  elements
    .map((element) =>
      [
        element.id,
        element.x,
        element.y,
        element.width,
        element.height,
        element.rotation,
        element.opacity,
        element.visible,
        element.locked,
        element.zIndex,
      ].join(":")
    )
    .join("|");

const makeDefaultDocument = (name = "Untitled board"): CanvasDocument => {
  const now = nowIso();
  return {
    id: createDocumentId(),
    name,
    width: 1080,
    height: 1350,
    backgroundColor: "#050505",
    elements: [],
    createdAt: now,
    updatedAt: now,
  };
};

export const useCanvasStore = create<CanvasState>()(
  devtools(
    (set, get) => {
      const commitElements = async (
        documentId: string,
        updater: (elements: CanvasElement[]) => CanvasElement[],
        options?: { trackHistory?: boolean }
      ): Promise<CanvasDocument | null> => {
        const existing = get().documents.find((document) => document.id === documentId);
        if (!existing) {
          return null;
        }

        const before = cloneElements(existing.elements);
        const nextRaw = updater(cloneElements(existing.elements));
        const nextElements = normalizeElements(nextRaw);

        if (elementsSignature(before) === elementsSignature(nextElements)) {
          return existing;
        }

        const nextDocument: CanvasDocument = {
          ...existing,
          elements: nextElements,
          updatedAt: nowIso(),
        };

        await saveCanvasDocument(nextDocument);

        set((state) => {
          const nextHistory = { ...state.historyByDocumentId };
          const history = nextHistory[documentId] ?? { past: [], future: [] };

          if (options?.trackHistory !== false) {
            const nextPast = [...history.past, before].slice(-MAX_CANVAS_HISTORY);
            nextHistory[documentId] = {
              past: nextPast,
              future: [],
            };
          } else {
            nextHistory[documentId] = history;
          }

          return {
            documents: state.documents.map((document) =>
              document.id === documentId ? nextDocument : document
            ),
            historyByDocumentId: nextHistory,
          };
        });

        return nextDocument;
      };

      return {
        documents: [],
        activeDocumentId: null,
        selectedElementIds: [],
        tool: "select",
        shapeType: "rect",
        zoom: 1,
        viewport: { x: 0, y: 0 },
        isLoading: false,
        historyByDocumentId: {},
        init: async () => {
          set({ isLoading: true });
          const documents = await loadCanvasDocuments();
          set({
            documents,
            activeDocumentId: documents[0]?.id ?? null,
            isLoading: false,
          });
        },
        createDocument: async (name) => {
          const document = makeDefaultDocument(name);
          await saveCanvasDocument(document);
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
        setActiveDocumentId: (activeDocumentId) => set({ activeDocumentId, selectedElementIds: [] }),
        setSelectedElementIds: (selectedElementIds) =>
          set({ selectedElementIds: Array.from(new Set(selectedElementIds)) }),
        setTool: (tool) => set({ tool }),
        setShapeType: (shapeType) => set({ shapeType }),
        setZoom: (zoom) => set({ zoom }),
        setViewport: (viewport) => set({ viewport }),
        upsertDocument: async (document) => {
          await saveCanvasDocument(document);
          set((state) => ({
            documents: state.documents.some((item) => item.id === document.id)
              ? state.documents.map((item) => (item.id === document.id ? document : item))
              : [document, ...state.documents],
          }));
        },
        upsertElement: async (documentId, element) => {
          await commitElements(documentId, (elements) =>
            elements.some((item) => item.id === element.id)
              ? elements.map((item) => (item.id === element.id ? element : item))
              : [...elements, element]
          );
        },
        upsertElements: async (documentId, elements) => {
          await commitElements(documentId, (existing) => {
            const byId = new Map(existing.map((element) => [element.id, element]));
            for (const element of elements) {
              byId.set(element.id, element);
            }
            return Array.from(byId.values());
          });
        },
        deleteElements: async (documentId, ids) => {
          const removing = new Set(ids);
          if (removing.size === 0) {
            return;
          }
          await commitElements(documentId, (elements) => elements.filter((element) => !removing.has(element.id)));
          set((state) => ({
            selectedElementIds: state.selectedElementIds.filter((id) => !removing.has(id)),
          }));
        },
        duplicateElements: async (documentId, ids) => {
          const duplicating = new Set(ids);
          if (duplicating.size === 0) {
            return [];
          }

          const existing = get().documents.find((document) => document.id === documentId);
          if (!existing) {
            return [];
          }

          const selected = existing.elements.filter((element) => duplicating.has(element.id));
          const baseZIndex = existing.elements.reduce((max, element) => Math.max(max, element.zIndex), 0);
          const duplicates = selected.map((element, index) => ({
            ...cloneElements([element])[0],
            id: createElementId(),
            x: element.x + 24,
            y: element.y + 24,
            zIndex: baseZIndex + index + 1,
          }));

          await commitElements(documentId, (elements) => [...elements, ...duplicates]);
          const duplicatedIds = duplicates.map((element) => element.id);
          set({ selectedElementIds: duplicatedIds });
          return duplicatedIds;
        },
        reorderElements: async (documentId, orderedIds) => {
          if (orderedIds.length === 0) {
            return;
          }
          await commitElements(documentId, (elements) => {
            const byId = new Map(elements.map((element) => [element.id, element]));
            const ordered = orderedIds.map((id) => byId.get(id)).filter((element): element is CanvasElement => Boolean(element));
            const orderedSet = new Set(ordered.map((element) => element.id));
            const rest = elements.filter((element) => !orderedSet.has(element.id));
            const mergedTopToBottom = [...ordered, ...rest];
            const total = mergedTopToBottom.length;
            return mergedTopToBottom.map((element, index) => ({
              ...element,
              zIndex: total - index,
            }));
          });
        },
        toggleElementVisibility: async (documentId, id) => {
          await commitElements(documentId, (elements) =>
            elements.map((element) =>
              element.id === id
                ? {
                    ...element,
                    visible: !element.visible,
                  }
                : element
            )
          );
        },
        toggleElementLock: async (documentId, id) => {
          await commitElements(documentId, (elements) =>
            elements.map((element) =>
              element.id === id
                ? {
                    ...element,
                    locked: !element.locked,
                  }
                : element
            )
          );
        },
        nudgeElements: async (documentId, ids, dx, dy) => {
          const moving = new Set(ids);
          if (moving.size === 0 || (dx === 0 && dy === 0)) {
            return;
          }
          await commitElements(documentId, (elements) =>
            elements.map((element) =>
              moving.has(element.id)
                ? {
                    ...element,
                    x: element.x + dx,
                    y: element.y + dy,
                  }
                : element
            )
          );
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

          const nextPast = history.past.slice(0, -1);
          const nextFuture = [cloneElements(existing.elements), ...history.future].slice(0, MAX_CANVAS_HISTORY);

          const nextDocument: CanvasDocument = {
            ...existing,
            elements: normalizeElements(cloneElements(previous)),
            updatedAt: nowIso(),
          };

          await saveCanvasDocument(nextDocument);
          set((state) => ({
            documents: state.documents.map((document) =>
              document.id === documentId ? nextDocument : document
            ),
            historyByDocumentId: {
              ...state.historyByDocumentId,
              [documentId]: {
                past: nextPast,
                future: nextFuture,
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
          const next = history.future[0];
          if (!next) {
            return false;
          }

          const nextPast = [...history.past, cloneElements(existing.elements)].slice(-MAX_CANVAS_HISTORY);
          const nextFuture = history.future.slice(1);

          const nextDocument: CanvasDocument = {
            ...existing,
            elements: normalizeElements(cloneElements(next)),
            updatedAt: nowIso(),
          };

          await saveCanvasDocument(nextDocument);
          set((state) => ({
            documents: state.documents.map((document) =>
              document.id === documentId ? nextDocument : document
            ),
            historyByDocumentId: {
              ...state.historyByDocumentId,
              [documentId]: {
                past: nextPast,
                future: nextFuture,
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
              state.activeDocumentId === id ? documents[0]?.id ?? null : state.activeDocumentId;
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
      };
    },
    { name: "CanvasStore", enabled: process.env.NODE_ENV === "development" }
  )
);
