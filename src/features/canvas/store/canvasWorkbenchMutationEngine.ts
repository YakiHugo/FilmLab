import {
  applyCanvasDocumentChangeSet,
  executeCanvasCommand,
} from "@/features/canvas/documentGraph";
import type {
  CanvasCommand,
  CanvasHistoryEntry,
  CanvasWorkbench,
} from "@/types";
import {
  commitCommandResultToState,
  commitPreviewCommandResultToState,
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
  ExecuteCommandOptions,
} from "./canvasStoreTypes";
import type { CanvasWorkbenchPersistStatus } from "./canvasWorkbenchPersistenceGateway";

interface CanvasWorkbenchMutationEngineOptions {
  deletePersistedWorkbench: (workbenchId: string) => Promise<boolean>;
  getResetEpoch: () => number;
  persistCommittedWorkbench: (
    workbench: CanvasWorkbench,
    epoch: number
  ) => Promise<CanvasWorkbenchPersistStatus>;
  queueWorkbenchCleanupCompensation: (
    workbenchId: string,
    userId: string
  ) => void;
  queueWorkbenchRestoreCompensation: (workbench: CanvasWorkbench) => void;
  resolveCommandTarget: (workbenchId: string) => CanvasWorkbench | null;
  savePersistedWorkbench: (workbench: CanvasWorkbench) => Promise<boolean>;
  setState: CanvasStoreDataSetter;
}

export const createCanvasWorkbenchMutationEngine = ({
  deletePersistedWorkbench,
  getResetEpoch,
  persistCommittedWorkbench,
  queueWorkbenchCleanupCompensation,
  queueWorkbenchRestoreCompensation,
  resolveCommandTarget,
  savePersistedWorkbench,
  setState,
}: CanvasWorkbenchMutationEngineOptions) => {
  const resolveCommitFailureStatus = (
    epoch: number,
    fallback: Extract<CanvasCommitStatus, "delete_failed" | "persist_failed">
  ): Exclude<CanvasCommitStatus, "committed" | "noop" | "missing_target"> =>
    epoch !== getResetEpoch() ? "epoch_invalidated_before_persist" : fallback;

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

  const commitPreviewDescriptorToStore = (
    descriptor: Pick<CommandCommitDescriptor, "nextWorkbench" | "workbenchId">,
    epoch: number
  ): CanvasCommitOutcome<CanvasWorkbench> => {
    let didCommit = false;
    setState((state) => {
      if (epoch !== getResetEpoch()) {
        return state;
      }

      didCommit = true;
      return commitPreviewCommandResultToState(state, descriptor);
    });

    return didCommit
      ? { status: "committed", value: descriptor.nextWorkbench }
      : createCommitFailureOutcome("epoch_invalidated_before_persist");
  };

  const commitDescriptorToStore = async (
    descriptor: WorkbenchCommitDescriptor,
    epoch: number,
    selectedElementIds?: string[]
  ): Promise<CanvasCommitOutcome<CanvasWorkbench>> => {
    const persistStatus = await persistCommittedWorkbench(descriptor.nextWorkbench, epoch);
    if (persistStatus !== "persisted") {
      if (persistStatus === "epoch_invalidated_after_persist") {
        return {
          status: "epoch_invalidated_after_persist",
          value: descriptor.nextWorkbench,
        };
      }
      return createCommitFailureOutcome(
        persistStatus === "persist_failed"
          ? "persist_failed"
          : "epoch_invalidated_before_persist"
      );
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
      : {
          status: "epoch_invalidated_after_persist",
          value: descriptor.nextWorkbench,
        };
  };

  const commitCreatedWorkbenchToStore = async (
    workbench: CanvasWorkbench,
    epoch: number,
    options?: CreateWorkbenchOptions
  ): Promise<CanvasCommitOutcome<CanvasWorkbench>> => {
    const persistStatus = await persistCommittedWorkbench(workbench, epoch);
    if (persistStatus !== "persisted") {
      if (persistStatus !== "epoch_invalidated_after_persist") {
        return createCommitFailureOutcome(
          persistStatus === "persist_failed"
            ? "persist_failed"
            : "epoch_invalidated_before_persist"
        );
      }

      const rolledBack = await deletePersistedWorkbench(workbench.id);
      if (!rolledBack) {
        queueWorkbenchCleanupCompensation(workbench.id, workbench.ownerRef.userId);
      }
      return createCommitFailureOutcome(
        rolledBack ? "epoch_invalidated_after_persist" : "persist_failed"
      );
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
      queueWorkbenchCleanupCompensation(workbench.id, workbench.ownerRef.userId);
    }
    return createCommitFailureOutcome(
      rolledBack ? "epoch_invalidated_after_persist" : "persist_failed"
    );
  };

  const commitDeletedWorkbenchToStore = async (
    workbenchId: string,
    epoch: number
  ): Promise<CanvasCommitOutcome<true>> => {
    if (epoch !== getResetEpoch()) {
      return createCommitFailureOutcome("epoch_invalidated_before_persist");
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
      return commitDeletedWorkbenchToState(state, workbenchId);
    });

    if (didCommit) {
      return { status: "committed", value: true };
    }

    const restored = await savePersistedWorkbench(existingWorkbench);
    if (!restored) {
      queueWorkbenchRestoreCompensation(existingWorkbench);
      return createCommitFailureOutcome("persist_failed");
    }

    return createCommitFailureOutcome("epoch_invalidated_after_persist");
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

  const previewCommandAgainstWorkbench = (
    workbenchId: string,
    existing: CanvasWorkbench,
    command: CanvasCommand,
    epoch: number
  ) => {
    const result = executeCanvasCommand(existing, command);
    if (!result.didChange) {
      return {
        status: "noop" as const,
        value: existing,
      };
    }

    return commitPreviewDescriptorToStore(
      {
        workbenchId,
        nextWorkbench: result.document,
      },
      epoch
    );
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
    previewCommandAgainstWorkbench,
    resolveCommitFailureStatus,
  };
};
