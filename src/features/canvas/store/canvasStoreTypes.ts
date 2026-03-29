import type {
  CanvasCommand,
  CanvasHistoryEntry,
  CanvasShapeType,
  CanvasWorkbench,
  CanvasWorkbenchDraft,
  CanvasWorkbenchListEntry,
} from "@/types";

export type CanvasTool = "select" | "text" | "hand" | "shape";
export type CanvasFloatingPanel =
  | "edit"
  | "layers"
  | "library"
  | null;

export interface CanvasHistoryState {
  entries: CanvasHistoryEntry[];
  cursor: number;
}

export interface CanvasWorkbenchInteractionStatus {
  active: boolean;
  pendingCommits: number;
  queuedMutations: number;
}

export interface ExecuteCommandOptions {
  trackHistory?: boolean;
}

export type PatchWorkbenchOptions = Pick<ExecuteCommandOptions, "trackHistory">;

export interface CreateWorkbenchOptions {
  openAfterCreate?: boolean;
}

export type CanvasWorkbenchEditablePatch = Extract<
  CanvasCommand,
  { type: "PATCH_DOCUMENT" }
>["patch"];

export interface CanvasStoreDataState {
  workbenchList: CanvasWorkbenchListEntry[];
  loadedWorkbenchId: string | null;
  workbench: CanvasWorkbench | null;
  workbenchDraft: CanvasWorkbenchDraft | null;
  selectedElementIds: string[];
  tool: CanvasTool;
  activeShapeType: CanvasShapeType;
  zoom: number;
  viewport: { x: number; y: number };
  activePanel: CanvasFloatingPanel;
  isLoading: boolean;
  workbenchHistory: CanvasHistoryState | null;
  workbenchInteraction: CanvasWorkbenchInteractionStatus | null;
}

export type CanvasStoreDataUpdate =
  | Partial<CanvasStoreDataState>
  | CanvasStoreDataState
  | ((state: CanvasStoreDataState) => Partial<CanvasStoreDataState> | CanvasStoreDataState);

export type CanvasStoreDataSetter = (update: CanvasStoreDataUpdate) => void;
