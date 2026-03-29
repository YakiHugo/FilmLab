import type { CanvasCommand, CanvasHistoryEntry, CanvasWorkbench } from "@/types";
import { materializeCanvasWorkbenchListEntry } from "./canvasWorkbenchListEntry";
import type {
  CanvasHistoryState,
  CanvasStoreDataState,
  CreateWorkbenchOptions,
  ExecuteCommandOptions,
} from "./canvasStoreTypes";

export type CanvasHistoryTransitionMode = "undo" | "redo";

export type CanvasCommitStatus =
  | "committed"
  | "delete_failed"
  | "epoch_invalidated_after_persist"
  | "epoch_invalidated_before_persist"
  | "missing_target"
  | "noop"
  | "persist_failed";

export type CanvasCommitOutcome<T> =
  | { status: "committed"; value: T }
  | { status: "epoch_invalidated_after_persist"; value?: T }
  | { status: "noop"; value: T }
  | { status: Exclude<CanvasCommitStatus, "committed" | "epoch_invalidated_after_persist" | "noop"> };

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
  entries: [],
  cursor: 0,
});

export const createCommitFailureOutcome = (
  status: Exclude<CanvasCommitStatus, "committed" | "noop">
): CanvasCommitOutcome<never> => ({ status });

export const createHistoryEntry = (
  command: CanvasCommand,
  result: Pick<CanvasHistoryEntry, "delta">
): CanvasHistoryEntry => ({
  commandType: command.type,
  delta: result.delta,
});

const appendHistoryEntry = (
  history: CanvasHistoryState,
  historyEntry: CanvasHistoryEntry
): CanvasHistoryState => {
  const truncatedEntries = history.entries.slice(0, history.cursor);
  const nextEntries = [...truncatedEntries, historyEntry];
  const trimmedEntries =
    nextEntries.length > MAX_CANVAS_HISTORY
      ? nextEntries.slice(nextEntries.length - MAX_CANVAS_HISTORY)
      : nextEntries;

  return {
    entries: trimmedEntries,
    cursor: trimmedEntries.length,
  };
};

const clearFutureHistory = (history: CanvasHistoryState): CanvasHistoryState => {
  const nextEntries = history.entries.slice(0, history.cursor);
  return {
    entries: nextEntries,
    cursor: nextEntries.length,
  };
};

const applyCommandHistory = (
  history: CanvasHistoryState | null,
  historyEntry: CanvasHistoryEntry,
  trackHistory: boolean
) => {
  if (!trackHistory) {
    return history ? clearFutureHistory(history) : history;
  }

  const currentHistory = history ?? createEmptyHistoryState();
  return appendHistoryEntry(currentHistory, historyEntry);
};

export const appendCanvasHistoryEntry = (
  history: CanvasHistoryState,
  historyEntry: CanvasHistoryEntry
): CanvasHistoryState => appendHistoryEntry(history, historyEntry);

const applyHistoryTransition = (
  mode: CanvasHistoryTransitionMode,
  historyState: CanvasHistoryState
): CanvasHistoryState =>
  mode === "undo"
    ? {
        entries: historyState.entries,
        cursor: Math.max(0, historyState.cursor - 1),
      }
    : {
        entries: historyState.entries,
        cursor: Math.min(historyState.entries.length, historyState.cursor + 1),
      };

const upsertWorkbenchListEntry = (
  workbenchList: CanvasStoreDataState["workbenchList"],
  workbench: CanvasWorkbench
) => {
  const nextEntry = materializeCanvasWorkbenchListEntry(workbench);
  const nextList = (workbenchList ?? []).filter((entry) => entry.id !== nextEntry.id);
  return [nextEntry, ...nextList];
};

export const commitCommandResultToState = (
  state: CanvasStoreDataState,
  descriptor: WorkbenchCommitDescriptor,
  selectedElementIds?: string[]
) => {
  if (state.loadedWorkbenchId !== descriptor.workbenchId) {
    return state;
  }

  const workbenchHistory =
    descriptor.historyMode === "command"
      ? applyCommandHistory(
          state.workbenchHistory,
          descriptor.historyEntry,
          descriptor.trackHistory
        )
      : applyHistoryTransition(
          descriptor.historyMode,
          descriptor.historyState
        );

  return {
    workbench: descriptor.nextWorkbench,
    workbenchDraft: null,
    workbenchHistory,
    workbenchInteraction: state.workbenchInteraction,
    workbenchList: upsertWorkbenchListEntry(state.workbenchList, descriptor.nextWorkbench),
    ...(selectedElementIds === undefined ? {} : { selectedElementIds }),
  };
};

export const commitCreatedWorkbenchToState = (
  state: CanvasStoreDataState,
  workbench: CanvasWorkbench,
  options?: CreateWorkbenchOptions
) => {
  const workbenchList = upsertWorkbenchListEntry(state.workbenchList, workbench);
  if (options?.openAfterCreate === false) {
    return {
      workbenchList,
    };
  }

  return {
    workbenchList,
    loadedWorkbenchId: workbench.id,
    workbench,
    workbenchDraft: null,
    selectedElementIds: [],
    workbenchHistory: createEmptyHistoryState(),
    workbenchInteraction: null,
    viewport: { x: 0, y: 0 },
    zoom: 1,
  };
};

export const commitDeletedWorkbenchToState = (
  state: CanvasStoreDataState,
  id: string
) => {
  const workbenchList = (state.workbenchList ?? []).filter((entry) => entry.id !== id);
  const deletingLoadedWorkbench = state.loadedWorkbenchId === id;

  return {
    workbenchList,
    loadedWorkbenchId: deletingLoadedWorkbench ? null : state.loadedWorkbenchId,
    workbench: deletingLoadedWorkbench ? null : state.workbench,
    workbenchDraft: deletingLoadedWorkbench ? null : state.workbenchDraft,
    selectedElementIds: deletingLoadedWorkbench ? [] : state.selectedElementIds,
    workbenchHistory: deletingLoadedWorkbench ? null : state.workbenchHistory,
    workbenchInteraction: deletingLoadedWorkbench ? null : state.workbenchInteraction,
  };
};

export const resolvePatchWorkbenchTrackHistory = (
  options?: ExecuteCommandOptions
) => options?.trackHistory === true;

export const commitPreviewCommandResultToState = (
  state: CanvasStoreDataState,
  descriptor: Pick<CommandCommitDescriptor, "workbenchId" | "nextWorkbench">
) => {
  if (state.loadedWorkbenchId !== descriptor.workbenchId) {
    return state;
  }

  const history = state.workbenchHistory ?? createEmptyHistoryState();
  return {
    workbenchDraft: descriptor.nextWorkbench,
    workbenchHistory: clearFutureHistory(history),
    workbenchList: upsertWorkbenchListEntry(state.workbenchList, descriptor.nextWorkbench),
  };
};
