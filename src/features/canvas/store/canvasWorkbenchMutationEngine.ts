import {
  applyCanvasDocumentChangeSet,
  executeCanvasCommand,
  getCanvasWorkbenchSnapshot,
} from "@/features/canvas/documentGraph";
import type {
  CanvasCommand,
  CanvasHistoryEntry,
  CanvasWorkbench,
  CanvasWorkbenchSnapshot,
} from "@/types";
import {
  commitCommandResultToState,
  commitCreatedWorkbenchToState,
  commitDeletedWorkbenchToState,
  createCommitFailureOutcome,
  createHistoryEntry,
  type CanvasCommitOutcome,
  type CanvasCommitStatus,
  type CanvasHistoryTransitionMode,
  type CommandCommitDescriptor,
  type HistoryTransitionCommitDescriptor,
  type WorkbenchCommitDescriptor,
} from "./canvasWorkbenchState";
import type {
  CanvasHistoryState,
  CanvasStoreDataSetter,
  CreateWorkbenchOptions,
  DeleteWorkbenchOptions,
  ExecuteCommandOptions,
} from "./canvasStoreTypes";

interface CanvasWorkbenchMutationEngineOptions {
  deletePersistedWorkbench: (workbenchId: string) => Promise<boolean>;
  getResetEpoch: () => number;
  persistCommittedWorkbench: (workbench: CanvasWorkbench, epoch: number) => Promise<boolean>;
  queueWorkbenchCleanupCompensation: (
    workbenchId: string,
    userId: string,
    epoch: number
  ) => void;
  queueWorkbenchRestoreCompensation: (
    snapshot: CanvasWorkbenchSnapshot,
    epoch: number
  ) => void;
  resolveCommandTarget: (workbenchId: string) => CanvasWorkbench | null;
  savePersistedWorkbenchSnapshot: (snapshot: CanvasWorkbenchSnapshot) => Promise<boolean>;
  setState: CanvasStoreDataSetter;
}

export const createCanvasWorkbenchMutationEngine = ({
  deletePersistedWorkbench,
  getResetEpoch,
  persistCommittedWorkbench,
  queueWorkbenchCleanupCompensation,
  queueWorkbenchRestoreCompensation,
  resolveCommandTarget,
  savePersistedWorkbenchSnapshot,
  setState,
}: CanvasWorkbenchMutationEngineOptions) => {
  const resolveCommitFailureStatus = (
    epoch: number,
    fallback: Extract<CanvasCommitStatus, "delete_failed" | "persist_failed">
  ): Exclude<CanvasCommitStatus, "committed" | "noop" | "missing_target"> =>
    epoch !== getResetEpoch() ? "epoch_invalidated" : fallback;

  const runWorkbenchCommand = (
    workbenchId: string,
    existing: CanvasWorkbench,
    command: CanvasCommand,
    options?: ExecuteCommandOptions
  ) => {
    const result = executeCanvasCommand(existing, command);
    if (!result.didChange) {
      return { kind: "noop" as const, workbench: existing };
    }

    return {
      kind: "commit" as const,
      descriptor: {
        workbenchId,
        nextWorkbench: result.document,
        historyMode: "command",
        historyEntry: createHistoryEntry(command, result),
        trackHistory: options?.trackHistory !== false,
      } satisfies CommandCommitDescriptor,
    };
  };

  const commitDescriptorToStore = async (
    descriptor: WorkbenchCommitDescriptor,
    epoch: number,
    selectedElementIds?: string[]
  ): Promise<CanvasCommitOutcome<CanvasWorkbench>> => {
    if (!(await persistCommittedWorkbench(descriptor.nextWorkbench, epoch))) {
      return createCommitFailureOutcome(resolveCommitFailureStatus(epoch, "persist_failed"));
    }

    let didCommit = false;
    setState((state) => {
      if (epoch !== getResetEpoch()) {
        return state;
      }

      didCommit = true;
      return commitCommandResultToState(state, descriptor, selectedElementIds);
    });

    return didCommit
      ? { status: "committed", value: descriptor.nextWorkbench }
      : createCommitFailureOutcome("epoch_invalidated");
  };

  const commitCreatedWorkbenchToStore = async (
    workbench: CanvasWorkbench,
    epoch: number,
    options?: CreateWorkbenchOptions
  ): Promise<CanvasCommitOutcome<CanvasWorkbench>> => {
    if (!(await persistCommittedWorkbench(workbench, epoch))) {
      return createCommitFailureOutcome(resolveCommitFailureStatus(epoch, "persist_failed"));
    }

    let didCommit = false;
    setState((state) => {
      if (epoch !== getResetEpoch()) {
        return state;
      }

      didCommit = true;
      return commitCreatedWorkbenchToState(state, workbench, options);
    });

    if (didCommit) {
      return { status: "committed", value: workbench };
    }

    const rolledBack = await deletePersistedWorkbench(workbench.id);
    if (!rolledBack) {
      queueWorkbenchCleanupCompensation(workbench.id, workbench.ownerRef.userId, epoch);
    }
    return createCommitFailureOutcome(rolledBack ? "epoch_invalidated" : "persist_failed");
  };

  const commitDeletedWorkbenchToStore = async (
    workbenchId: string,
    epoch: number,
    options?: DeleteWorkbenchOptions
  ): Promise<CanvasCommitOutcome<true>> => {
    if (epoch !== getResetEpoch()) {
      return createCommitFailureOutcome("epoch_invalidated");
    }

    const existingWorkbench = resolveCommandTarget(workbenchId);
    if (!existingWorkbench) {
      return createCommitFailureOutcome("missing_target");
    }

    if (!(await deletePersistedWorkbench(workbenchId))) {
      return createCommitFailureOutcome(resolveCommitFailureStatus(epoch, "delete_failed"));
    }

    let didCommit = false;
    setState((state) => {
      if (epoch !== getResetEpoch()) {
        return state;
      }

      didCommit = true;
      return commitDeletedWorkbenchToState(state, workbenchId, options);
    });

    if (didCommit) {
      return { status: "committed", value: true };
    }

    const existingSnapshot = getCanvasWorkbenchSnapshot(existingWorkbench);
    const restored = await savePersistedWorkbenchSnapshot(existingSnapshot);
    if (!restored) {
      queueWorkbenchRestoreCompensation(existingSnapshot, epoch);
      return createCommitFailureOutcome("persist_failed");
    }

    return createCommitFailureOutcome("epoch_invalidated");
  };

  const executeCommandAgainstWorkbench = async (
    workbenchId: string,
    existing: CanvasWorkbench,
    command: CanvasCommand,
    epoch: number,
    options?: ExecuteCommandOptions,
    selectedElementIds?: string[]
  ): Promise<CanvasCommitOutcome<CanvasWorkbench>> => {
    const commandResult = runWorkbenchCommand(workbenchId, existing, command, options);
    if (commandResult.kind === "noop") {
      return { status: "noop", value: commandResult.workbench };
    }

    return commitDescriptorToStore(commandResult.descriptor, epoch, selectedElementIds);
  };

  const createHistoryTransitionDescriptor = (
    workbenchId: string,
    workbench: CanvasWorkbench,
    historyMode: CanvasHistoryTransitionMode,
    historyEntry: CanvasHistoryEntry,
    historyState: CanvasHistoryState
  ): HistoryTransitionCommitDescriptor => ({
    workbenchId,
    nextWorkbench: applyCanvasDocumentChangeSet(
      workbench,
      historyMode === "undo"
        ? historyEntry.inverseChangeSet
        : historyEntry.forwardChangeSet
    ),
    historyMode,
    historyEntry,
    historyState,
  });

  return {
    commitCreatedWorkbenchToStore,
    commitDeletedWorkbenchToStore,
    commitDescriptorToStore,
    createHistoryTransitionDescriptor,
    executeCommandAgainstWorkbench,
    resolveCommitFailureStatus,
  };
};
