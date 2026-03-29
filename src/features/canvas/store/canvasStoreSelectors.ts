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
export interface CanvasLoadedWorkbenchReadModel {
  loadedWorkbench: CanvasWorkbench | null;
  loadedWorkbenchId: string | null;
  loadedWorkbenchRootCount: number;
  slices: CanvasWorkbench["slices"];
}

export const EMPTY_LOADED_CANVAS_WORKBENCH_STATE: CanvasLoadedWorkbenchReadModel = {
  loadedWorkbench: null,
  loadedWorkbenchId: null,
  loadedWorkbenchRootCount: 0,
  slices: EMPTY_CANVAS_SLICES,
};

const hasHistoryEntries = (
  history: CanvasHistoryState | null | undefined,
  key: "undo" | "redo"
) =>
  Boolean(
    history &&
      (key === "undo" ? history.cursor > 0 : history.cursor < history.entries.length)
  );

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

export const selectLoadedWorkbench = (state: CanvasWorkbenchSelectorState) =>
  selectWorkbenchById(state, state.loadedWorkbenchId);

export const selectCommittedLoadedWorkbench = (
  state: CanvasCommittedWorkbenchSelectorState
) => selectCommittedWorkbenchById(state, state.loadedWorkbenchId);

export const selectResolvedLoadedWorkbenchId = (state: CanvasWorkbenchSelectorState) =>
  selectLoadedWorkbench(state)?.id ?? null;

export const selectCanvasLoadedWorkbenchState = (
  state: CanvasWorkbenchSelectorState
): CanvasLoadedWorkbenchReadModel => {
  const loadedWorkbench = selectLoadedWorkbench(state);
  if (!loadedWorkbench) {
    return EMPTY_LOADED_CANVAS_WORKBENCH_STATE;
  }

  return {
    loadedWorkbench,
    loadedWorkbenchId: loadedWorkbench.id,
    loadedWorkbenchRootCount: loadedWorkbench.rootIds.length,
    slices: loadedWorkbench.slices ?? EMPTY_CANVAS_SLICES,
  };
};

export const selectCanvasCommittedLoadedWorkbenchState = (
  state: CanvasCommittedWorkbenchSelectorState
): CanvasLoadedWorkbenchReadModel => {
  const loadedWorkbench = selectCommittedLoadedWorkbench(state);
  if (!loadedWorkbench) {
    return EMPTY_LOADED_CANVAS_WORKBENCH_STATE;
  }

  return {
    loadedWorkbench,
    loadedWorkbenchId: loadedWorkbench.id,
    loadedWorkbenchRootCount: loadedWorkbench.rootIds.length,
    slices: loadedWorkbench.slices ?? EMPTY_CANVAS_SLICES,
  };
};

export const selectLoadedWorkbenchName = (state: CanvasWorkbenchSelectorState) =>
  selectLoadedWorkbench(state)?.name ?? "Untitled Workbench";

export const selectLoadedWorkbenchSlices = (state: CanvasWorkbenchSelectorState) =>
  selectCanvasLoadedWorkbenchState(state).slices;

export const selectLoadedWorkbenchRootCount = (state: CanvasWorkbenchSelectorState) =>
  selectCanvasLoadedWorkbenchState(state).loadedWorkbenchRootCount;

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
        hasHistoryEntries(state.workbenchHistory, "undo")
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
        hasHistoryEntries(state.workbenchHistory, "redo")
      : false;

export const selectCanUndoOnLoadedWorkbench = (state: CanvasHistorySelectorState) =>
  selectCommittedLoadedWorkbench(state)
    ? selectCanUndoInWorkbench(state, state.loadedWorkbenchId)
    : false;

export const selectCanRedoOnLoadedWorkbench = (state: CanvasHistorySelectorState) =>
  selectCommittedLoadedWorkbench(state)
    ? selectCanRedoInWorkbench(state, state.loadedWorkbenchId)
    : false;
