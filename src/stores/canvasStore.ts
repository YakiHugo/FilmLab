import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { deleteCanvasDocument, loadCanvasDocuments, saveCanvasDocument } from "@/lib/db";
import type { CanvasDocument, CanvasElement } from "@/types";

type CanvasTool = "select" | "text" | "shape" | "hand";

interface CanvasState {
  documents: CanvasDocument[];
  activeDocumentId: string | null;
  selectedElementIds: string[];
  tool: CanvasTool;
  zoom: number;
  isLoading: boolean;
  init: () => Promise<void>;
  createDocument: (name?: string) => Promise<CanvasDocument>;
  setActiveDocumentId: (id: string | null) => void;
  setSelectedElementIds: (ids: string[]) => void;
  setTool: (tool: CanvasTool) => void;
  setZoom: (zoom: number) => void;
  upsertDocument: (document: CanvasDocument) => Promise<void>;
  upsertElement: (documentId: string, element: CanvasElement) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
}

const nowIso = () => new Date().toISOString();

const createDocumentId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `doc-${Date.now()}`;
};

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
    (set, get) => ({
      documents: [],
      activeDocumentId: null,
      selectedElementIds: [],
      tool: "select",
      zoom: 1,
      isLoading: false,
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
        }));
        return document;
      },
      setActiveDocumentId: (activeDocumentId) => set({ activeDocumentId }),
      setSelectedElementIds: (selectedElementIds) => set({ selectedElementIds }),
      setTool: (tool) => set({ tool }),
      setZoom: (zoom) => set({ zoom }),
      upsertDocument: async (document) => {
        await saveCanvasDocument(document);
        set((state) => ({
          documents: state.documents.some((item) => item.id === document.id)
            ? state.documents.map((item) => (item.id === document.id ? document : item))
            : [document, ...state.documents],
        }));
      },
      upsertElement: async (documentId, element) => {
        const existing = get().documents.find((item) => item.id === documentId);
        if (!existing) {
          return;
        }
        const nextElements = existing.elements.some((item) => item.id === element.id)
          ? existing.elements.map((item) => (item.id === element.id ? element : item))
          : [...existing.elements, element];
        const nextDocument: CanvasDocument = {
          ...existing,
          elements: nextElements.sort((a, b) => a.zIndex - b.zIndex),
          updatedAt: nowIso(),
        };
        await saveCanvasDocument(nextDocument);
        set((state) => ({
          documents: state.documents.map((item) => (item.id === documentId ? nextDocument : item)),
        }));
      },
      deleteDocument: async (id) => {
        await deleteCanvasDocument(id);
        set((state) => {
          const documents = state.documents.filter((item) => item.id !== id);
          const activeDocumentId =
            state.activeDocumentId === id ? (documents[0]?.id ?? null) : state.activeDocumentId;
          return {
            documents,
            activeDocumentId,
            selectedElementIds: activeDocumentId ? state.selectedElementIds : [],
          };
        });
      },
    }),
    { name: "CanvasStore", enabled: process.env.NODE_ENV === "development" }
  )
);
