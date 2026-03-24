import type { CanvasCommand, CanvasHistoryEntry, CanvasWorkbench } from "@/types";
import type {
  CanvasHistoryState,
  CanvasStoreDataState,
  CreateWorkbenchOptions,
  DeleteWorkbenchOptions,
  ExecuteCommandOptions,
} from "./canvasStoreTypes";

export type CanvasHistoryTransitionMode = "undo" | "redo";

export type CanvasCommitStatus =
  | "committed"
  | "delete_failed"
  | "epoch_invalidated"
  | "missing_target"
  | "noop"
  | "persist_failed";

export type CanvasCommitOutcome<T> =
  | { status: "committed"; value: T }
  | { status: "noop"; value: T }
  | { status: Exclude<CanvasCommitStatus, "committed" | "noop"> };

interface BaseWorkbenchCommitDescriptor {
  workbenchId: string;
  nextWorkbench: CanvasWorkbench;
}

export interface CommandCommitDescriptor extends BaseWorkbenchCommitDescriptor {
  historyMode: "command";
  historyEntry: CanvasHistoryEntry;
  trackHistory: boolean;
}

export interface HistoryTransitionCommitDescriptor extends BaseWorkbenchCommitDescriptor {
  historyMode: CanvasHistoryTransitionMode;
  historyEntry: CanvasHistoryEntry;
  historyState: CanvasHistoryState;
}

export type WorkbenchCommitDescriptor =
  | CommandCommitDescriptor
  | HistoryTransitionCommitDescriptor;

const MAX_CANVAS_HISTORY = 50;

export const createEmptyHistoryState = (): CanvasHistoryState => ({
  past: [],
  future: [],
});

export const createCommitFailureOutcome = (
  status: Exclude<CanvasCommitStatus, "committed" | "noop">
): CanvasCommitOutcome<never> => ({ status });

export const createHistoryEntry = (
  command: CanvasCommand,
  result: Pick<CanvasHistoryEntry, "forwardChangeSet" | "inverseChangeSet">
): CanvasHistoryEntry => ({
  commandType: command.type,
  forwardChangeSet: result.forwardChangeSet,
  inverseChangeSet: result.inverseChangeSet,
});

const replaceWorkbenchInState = (
  workbenches: CanvasWorkbench[],
  workbenchId: string,
  nextWorkbench: CanvasWorkbench
) =>
  workbenches.map((workbench) =>
    workbench.id === workbenchId ? nextWorkbench : workbench
  );

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

export const commitCommandResultToState = (
  state: CanvasStoreDataState,
  descriptor: WorkbenchCommitDescriptor,
  selectedElementIds?: string[]
):
  | Pick<CanvasStoreDataState, "workbenches" | "historyByWorkbenchId">
  | Pick<CanvasStoreDataState, "workbenches" | "historyByWorkbenchId" | "selectedElementIds"> => {
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

export const commitCreatedWorkbenchToState = (
  state: CanvasStoreDataState,
  workbench: CanvasWorkbench,
  options?: CreateWorkbenchOptions
) => ({
  workbenches: [workbench, ...state.workbenches],
  activeWorkbenchId: options?.activate === false ? state.activeWorkbenchId : workbench.id,
  selectedElementIds: options?.activate === false ? state.selectedElementIds : [],
  historyByWorkbenchId: {
    ...state.historyByWorkbenchId,
    [workbench.id]: createEmptyHistoryState(),
  },
  viewport: options?.activate === false ? state.viewport : { x: 0, y: 0 },
  zoom: options?.activate === false ? state.zoom : 1,
});

export const commitDeletedWorkbenchToState = (
  state: CanvasStoreDataState,
  id: string,
  options?: DeleteWorkbenchOptions
) => {
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
};

export const resolvePatchWorkbenchTrackHistory = (
  options?: ExecuteCommandOptions
) => options?.trackHistory === true;
