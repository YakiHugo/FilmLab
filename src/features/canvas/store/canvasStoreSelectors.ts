import type { CanvasWorkbench } from "@/types";
import type { CanvasHistoryState, CanvasStoreDataState } from "./canvasStoreTypes";

type CanvasWorkbenchSelectorState = Pick<CanvasStoreDataState, "activeWorkbenchId" | "workbenches">;
type CanvasHistorySelectorState = Pick<
  CanvasStoreDataState,
  "activeWorkbenchId" | "historyByWorkbenchId" | "workbenches"
>;

export const EMPTY_CANVAS_SLICES: CanvasWorkbench["slices"] = [];
export interface CanvasActiveWorkbenchReadModel {
  activeWorkbench: CanvasWorkbench | null;
  activeWorkbenchId: string | null;
  activeWorkbenchRootCount: number;
  slices: CanvasWorkbench["slices"];
}

export const EMPTY_ACTIVE_CANVAS_WORKBENCH_STATE: CanvasActiveWorkbenchReadModel = {
  activeWorkbench: null,
  activeWorkbenchId: null,
  activeWorkbenchRootCount: 0,
  slices: EMPTY_CANVAS_SLICES,
};

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

export const selectResolvedActiveWorkbenchId = (state: CanvasWorkbenchSelectorState) =>
  selectActiveWorkbench(state)?.id ?? null;

export const selectCanvasActiveWorkbenchState = (
  state: CanvasWorkbenchSelectorState
): CanvasActiveWorkbenchReadModel => {
  const activeWorkbench = selectActiveWorkbench(state);
  if (!activeWorkbench) {
    return EMPTY_ACTIVE_CANVAS_WORKBENCH_STATE;
  }

  return {
    activeWorkbench,
    activeWorkbenchId: activeWorkbench.id,
    activeWorkbenchRootCount: activeWorkbench.rootIds.length,
    slices: activeWorkbench.slices ?? EMPTY_CANVAS_SLICES,
  };
};

export const selectActiveWorkbenchName = (state: CanvasWorkbenchSelectorState) =>
  selectActiveWorkbench(state)?.name ?? "Untitled Workbench";

export const selectActiveWorkbenchSlices = (state: CanvasWorkbenchSelectorState) =>
  selectCanvasActiveWorkbenchState(state).slices;

export const selectActiveWorkbenchRootCount = (state: CanvasWorkbenchSelectorState) =>
  selectCanvasActiveWorkbenchState(state).activeWorkbenchRootCount;

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
