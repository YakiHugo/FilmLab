import type { CanvasWorkbench } from "@/types";
import type { CanvasHistoryState, CanvasStoreDataState } from "./canvasStoreTypes";

type CanvasWorkbenchSelectorState = Pick<CanvasStoreDataState, "activeWorkbenchId" | "workbenches">;
type CanvasHistorySelectorState = Pick<
  CanvasStoreDataState,
  "activeWorkbenchId" | "historyByWorkbenchId" | "workbenches"
>;

export const EMPTY_CANVAS_SLICES: CanvasWorkbench["slices"] = [];

const hasHistoryEntries = (
  history: CanvasHistoryState | undefined,
  key: keyof Pick<CanvasHistoryState, "future" | "past">
) => Boolean(history && history[key].length > 0);

export const selectWorkbenchById = (
  state: Pick<CanvasStoreDataState, "workbenches">,
  workbenchId: string | null | undefined
) =>
  workbenchId
    ? state.workbenches.find((workbench) => workbench.id === workbenchId) ?? null
    : null;

export const selectActiveWorkbench = (state: CanvasWorkbenchSelectorState) =>
  selectWorkbenchById(state, state.activeWorkbenchId);

export const selectActiveWorkbenchName = (state: CanvasWorkbenchSelectorState) =>
  selectActiveWorkbench(state)?.name ?? "Untitled Workbench";

export const selectActiveWorkbenchSlices = (state: CanvasWorkbenchSelectorState) =>
  selectActiveWorkbench(state)?.slices ?? EMPTY_CANVAS_SLICES;

export const selectActiveWorkbenchRootCount = (state: CanvasWorkbenchSelectorState) =>
  selectActiveWorkbench(state)?.rootIds.length ?? 0;

export const selectCanUndoInWorkbench = (
  state: Pick<CanvasStoreDataState, "historyByWorkbenchId">,
  workbenchId: string | null | undefined
) => (workbenchId ? hasHistoryEntries(state.historyByWorkbenchId[workbenchId], "past") : false);

export const selectCanRedoInWorkbench = (
  state: Pick<CanvasStoreDataState, "historyByWorkbenchId">,
  workbenchId: string | null | undefined
) => (workbenchId ? hasHistoryEntries(state.historyByWorkbenchId[workbenchId], "future") : false);

export const selectCanUndoOnActiveWorkbench = (state: CanvasHistorySelectorState) =>
  selectWorkbenchById(state, state.activeWorkbenchId)
    ? selectCanUndoInWorkbench(state, state.activeWorkbenchId)
    : false;

export const selectCanRedoOnActiveWorkbench = (state: CanvasHistorySelectorState) =>
  selectWorkbenchById(state, state.activeWorkbenchId)
    ? selectCanRedoInWorkbench(state, state.activeWorkbenchId)
    : false;
