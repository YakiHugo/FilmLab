import type { CanvasCommand, CanvasHistoryEntry, CanvasShapeType, CanvasWorkbench } from "@/types";

export type CanvasTool = "select" | "text" | "hand" | "shape";
export type CanvasFloatingPanel =
  | "edit"
  | "layers"
  | "library"
  | null;

export interface CanvasHistoryState {
  past: CanvasHistoryEntry[];
  future: CanvasHistoryEntry[];
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
  activate?: boolean;
}

export interface DeleteWorkbenchOptions {
  nextActiveWorkbenchId?: string | null;
}

export type CanvasWorkbenchEditablePatch = Extract<
  CanvasCommand,
  { type: "PATCH_DOCUMENT" }
>["patch"];

export interface CanvasStoreDataState {
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
  interactionStatusByWorkbenchId: Record<string, CanvasWorkbenchInteractionStatus>;
}

export type CanvasStoreDataUpdate =
  | Partial<CanvasStoreDataState>
  | CanvasStoreDataState
  | ((state: CanvasStoreDataState) => Partial<CanvasStoreDataState> | CanvasStoreDataState);

export type CanvasStoreDataSetter = (update: CanvasStoreDataUpdate) => void;
