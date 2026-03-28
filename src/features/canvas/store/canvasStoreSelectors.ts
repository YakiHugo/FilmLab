import type { CanvasWorkbench } from "@/types";
import type { CanvasHistoryState, CanvasStoreDataState } from "./canvasStoreTypes";

type CanvasCommittedWorkbenchSelectorState = Pick<
  CanvasStoreDataState,
  "loadedWorkbenchId" | "workbench"
>;
type CanvasWorkbenchSelectorState = Pick<
  CanvasStoreDataState,
  "loadedWorkbenchId" | "workbench" | "workbenchDraft"
>;
type CanvasHistorySelectorState = Pick<
  CanvasStoreDataState,
  "loadedWorkbenchId" | "workbench" | "workbenchHistory" | "workbenchInteraction"
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
  history: CanvasHistoryState | null | undefined,
  key: keyof Pick<CanvasHistoryState, "future" | "past">
) => Boolean(history && history[key].length > 0);

export const selectWorkbenchById = (
  state: CanvasWorkbenchSelectorState,
  workbenchId: string | null | undefined
) =>
  workbenchId && state.loadedWorkbenchId === workbenchId
    ? state.workbenchDraft ?? state.workbench ?? null
    : null;

export const selectCommittedWorkbenchById = (
  state: CanvasCommittedWorkbenchSelectorState,
  workbenchId: string | null | undefined
) =>
  workbenchId && state.loadedWorkbenchId === workbenchId ? state.workbench ?? null : null;

export const selectActiveWorkbench = (state: CanvasWorkbenchSelectorState) =>
  selectWorkbenchById(state, state.loadedWorkbenchId);

export const selectCommittedActiveWorkbench = (
  state: CanvasCommittedWorkbenchSelectorState
) => selectCommittedWorkbenchById(state, state.loadedWorkbenchId);

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

export const selectCanvasCommittedWorkbenchState = (
  state: CanvasCommittedWorkbenchSelectorState
): CanvasActiveWorkbenchReadModel => {
  const activeWorkbench = selectCommittedActiveWorkbench(state);
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
  state: Pick<
    CanvasStoreDataState,
    "loadedWorkbenchId" | "workbenchHistory" | "workbenchInteraction"
  >,
  workbenchId: string | null | undefined
) =>
  workbenchId === state.loadedWorkbenchId
    ? !state.workbenchInteraction?.active &&
      (state.workbenchInteraction?.pendingCommits ?? 0) === 0 &&
      (state.workbenchInteraction?.queuedMutations ?? 0) === 0 &&
      hasHistoryEntries(state.workbenchHistory, "past")
    : false;

export const selectCanRedoInWorkbench = (
  state: Pick<
    CanvasStoreDataState,
    "loadedWorkbenchId" | "workbenchHistory" | "workbenchInteraction"
  >,
  workbenchId: string | null | undefined
) =>
  workbenchId === state.loadedWorkbenchId
    ? !state.workbenchInteraction?.active &&
      (state.workbenchInteraction?.pendingCommits ?? 0) === 0 &&
      (state.workbenchInteraction?.queuedMutations ?? 0) === 0 &&
      hasHistoryEntries(state.workbenchHistory, "future")
    : false;

export const selectCanUndoOnActiveWorkbench = (state: CanvasHistorySelectorState) =>
  selectCommittedWorkbenchById(state, state.loadedWorkbenchId)
    ? selectCanUndoInWorkbench(state, state.loadedWorkbenchId)
    : false;

export const selectCanRedoOnActiveWorkbench = (state: CanvasHistorySelectorState) =>
  selectCommittedWorkbenchById(state, state.loadedWorkbenchId)
    ? selectCanRedoInWorkbench(state, state.loadedWorkbenchId)
    : false;
