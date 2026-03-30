import {
  buildCanvasHierarchyIndex,
  getCanvasDescendantIds,
} from "@/features/canvas/documentGraph";
import { diffCanvasDocumentDelta } from "@/features/canvas/document/patches";
import { normalizeCanvasWorkbenchWithCleanup } from "@/features/canvas/studioPresets";
import { createNeutralCanvasImageRenderState } from "@/render/image";
import { useAssetStore } from "@/stores/assetStore";
import type {
  CanvasCommand,
  CanvasEditableElement,
  CanvasHistoryEntry,
  CanvasWorkbench,
} from "@/types";
import { createId } from "@/utils";
import {
  appendCanvasHistoryEntry,
  createEmptyHistoryState,
} from "./canvasWorkbenchState";
import { createCanvasWorkbenchMutationEngine } from "./canvasWorkbenchMutationEngine";
import {
  claimUniqueNodeId,
  cloneNodeTree,
  makeDefaultWorkbench,
  toEditableElementPropertyPatch,
} from "./canvasWorkbenchNodeHelpers";
import { materializeCanvasWorkbenchListEntry } from "./canvasWorkbenchListEntry";
import {
  deletePersistedCanvasWorkbenchRecord,
  flushPendingCanvasWorkbenchCompensation,
  loadCanvasWorkbenchListForCurrentUser,
  loadPersistedCanvasWorkbench,
  persistCanvasWorkbenchRecord,
  queueCanvasWorkbenchCleanupCompensation,
  queueCanvasWorkbenchRestoreCompensation,
  savePersistedCanvasWorkbench,
} from "./canvasWorkbenchPersistenceGateway";
import type {
  CanvasStoreDataSetter,
  CanvasStoreDataState,
  CanvasWorkbenchEditablePatch,
  CreateWorkbenchOptions,
  ExecuteCommandOptions,
  PatchWorkbenchOptions,
} from "./canvasStoreTypes";
import {
  enqueueCanvasMutationTask,
  getCanvasInitPromise,
  getCanvasMutationVersion,
  getCanvasResetEpoch,
  resetCanvasWorkbenchTaskCoordinator,
  setCanvasInitPromise,
  waitForCanvasMutationQueueIdle,
} from "./canvasWorkbenchTaskCoordinator";

interface CanvasWorkbenchServiceStoreApi {
  getState: () => CanvasStoreDataState;
  setState: CanvasStoreDataSetter;
}

interface CanvasInteractionTransaction {
  baselineHistory: ReturnType<typeof createEmptyHistoryState>;
  baselineWorkbench: CanvasWorkbench;
  commandType: CanvasCommand["type"] | null;
  epoch: number;
  hasPreviewChanges: boolean;
  interactionId: string;
}

interface PendingInteractionCommit {
  baselineHistory: ReturnType<typeof createEmptyHistoryState>;
  baselineWorkbench: CanvasWorkbench;
  epoch: number;
  interactionId: string;
  nextWorkbench: CanvasWorkbench;
}

export interface CanvasWorkbenchService {
  init: () => Promise<void>;
  openWorkbench: (workbenchId: string) => Promise<CanvasWorkbench | null>;
  closeWorkbench: () => void;
  createWorkbench: (name?: string, options?: CreateWorkbenchOptions) => Promise<CanvasWorkbench | null>;
  patchWorkbench: (
    workbenchId: string,
    patch: CanvasWorkbenchEditablePatch,
    options?: PatchWorkbenchOptions
  ) => Promise<CanvasWorkbench | null>;
  deleteWorkbench: (id: string) => Promise<boolean>;
  executeCommandInWorkbench: (
    workbenchId: string,
    command: CanvasCommand,
    options?: ExecuteCommandOptions
  ) => Promise<CanvasWorkbench | null>;
  beginInteractionInWorkbench: (workbenchId: string) => { interactionId: string } | null;
  previewCommandInWorkbench: (
    workbenchId: string,
    interactionId: string,
    command: CanvasCommand
  ) => CanvasWorkbench | null;
  commitInteractionInWorkbench: (
    workbenchId: string,
    interactionId: string
  ) => Promise<CanvasWorkbench | null>;
  rollbackInteractionInWorkbench: (
    workbenchId: string,
    interactionId: string
  ) => CanvasWorkbench | null;
  upsertElementInWorkbench: (
    workbenchId: string,
    element: CanvasEditableElement
  ) => Promise<void>;
  upsertElementsInWorkbench: (
    workbenchId: string,
    elements: CanvasEditableElement[]
  ) => Promise<void>;
  deleteNodesInWorkbench: (workbenchId: string, ids: string[]) => Promise<string[]>;
  duplicateNodesInWorkbench: (workbenchId: string, ids: string[]) => Promise<string[]>;
  groupNodesInWorkbench: (workbenchId: string, ids: string[]) => Promise<string | null>;
  undo: (workbenchId: string | null) => Promise<boolean>;
  redo: (workbenchId: string | null) => Promise<boolean>;
}

export { getCanvasResetEpoch } from "./canvasWorkbenchTaskCoordinator";

export const resetCanvasWorkbenchService = () => {
  resetCanvasWorkbenchTaskCoordinator();
};

export const createCanvasWorkbenchService = ({
  getState,
  setState,
}: CanvasWorkbenchServiceStoreApi): CanvasWorkbenchService => {
  const ensureAssetStoreReady = async () => {
    const assetState = useAssetStore.getState();
    if (!assetState.isLoading && (assetState.currentUser || assetState.assets.length > 0)) {
      return;
    }
    await assetState.init();
  };

  const validateCommand = (command: CanvasCommand): CanvasCommand => {
    if (command.type !== "INSERT_NODES") {
      return command;
    }

    for (const node of command.nodes) {
      if (node.type === "image" && !node.renderState) {
        throw new Error(`Canvas image node ${node.id} is missing renderState.`);
      }
    }
    return command;
  };

  const canonicalizeInsertedElement = (element: CanvasEditableElement): CanvasEditableElement => {
    if (element.type !== "image" || element.renderState) {
      return element;
    }

    const asset = useAssetStore
      .getState()
      .assets.find((candidate) => candidate.id === element.assetId);
    if (!asset) {
      return element;
    }

    return {
      ...element,
      renderState: createNeutralCanvasImageRenderState(),
    };
  };

  const resolveCommandTarget = (workbenchId: string) =>
    getState().loadedWorkbenchId === workbenchId
      ? getState().workbenchDraft ?? getState().workbench
      : null;

  const persistCommittedWorkbench = async (workbench: CanvasWorkbench, epoch: number) =>
    persistCanvasWorkbenchRecord({
      epoch,
      getResetEpoch: getCanvasResetEpoch,
      workbench,
    });

  const mutationEngine = createCanvasWorkbenchMutationEngine({
    deletePersistedWorkbench: deletePersistedCanvasWorkbenchRecord,
    getResetEpoch: getCanvasResetEpoch,
    persistCommittedWorkbench,
    queueWorkbenchCleanupCompensation: (workbenchId, userId) => {
      queueCanvasWorkbenchCleanupCompensation({
        userId,
        workbenchId,
      });
    },
    queueWorkbenchRestoreCompensation: (workbench) => {
      queueCanvasWorkbenchRestoreCompensation({
        workbench,
      });
    },
    resolveCommandTarget,
    savePersistedWorkbench: savePersistedCanvasWorkbench,
    setState,
  });

  const enqueueWorkbenchMutation = <T>(
    workbenchId: string,
    task: (workbench: CanvasWorkbench, epoch: number) => Promise<T>,
    onMissing: T
  ) =>
    enqueueCanvasMutationTask(async () => {
      const workbench = resolveCommandTarget(workbenchId);
      if (!workbench) {
        return onMissing;
      }

      return task(workbench, getCanvasResetEpoch());
    });

  const executeWorkbenchCommand = async (
    workbenchId: string,
    command: CanvasCommand,
    options?: ExecuteCommandOptions
  ) => {
    if (isWorkbenchMutationBlocked(workbenchId)) {
      return null;
    }

    return enqueueQueuedWorkbenchMutation(
      workbenchId,
        async (existing, epoch) => {
          const outcome = await mutationEngine.executeCommandAgainstWorkbench(
            workbenchId,
            existing,
            validateCommand(command),
            epoch,
            options
          );
        return outcome.status === "committed" ||
          outcome.status === "noop" ||
          outcome.status === "epoch_invalidated_after_persist"
          ? (outcome.value ?? null)
          : null;
      },
      null
    );
  };

  const enqueueQueuedWorkbenchMutation = <T>(
    workbenchId: string,
    task: (workbench: CanvasWorkbench, epoch: number) => Promise<T>,
    onMissing: T
  ) => {
    const queueEpoch = getCanvasResetEpoch();
    incrementQueuedMutationCount(queueEpoch);
    return enqueueWorkbenchMutation(workbenchId, task, onMissing).finally(() => {
      decrementQueuedMutationCount(queueEpoch);
    });
  };

  const activeInteractionByWorkbenchId = new Map<string, CanvasInteractionTransaction>();
  const pendingInteractionCommitsByWorkbenchId = new Map<
    string,
    PendingInteractionCommit[]
  >();
  const queuedMutationCountByEpoch = new Map<number, number>();

  const cloneHistoryState = (
    history: ReturnType<typeof createEmptyHistoryState>
  ): ReturnType<typeof createEmptyHistoryState> => ({
    entries: history.entries.slice(),
    cursor: history.cursor,
  });

  const syncWorkbenchInteractionStatus = (workbenchId: string) => {
    const active = Boolean(getActiveInteraction(workbenchId));
    const pendingCommits = getPendingInteractionCommits(workbenchId).length;
    const queuedMutations = getQueuedMutationCount();

    setState((state) => {
      if (state.loadedWorkbenchId !== workbenchId) {
        return state.workbenchInteraction === null ? state : { workbenchInteraction: null };
      }

      const currentStatus = state.workbenchInteraction;
      if (
        currentStatus?.active === active &&
        (currentStatus?.pendingCommits ?? 0) === pendingCommits &&
        (currentStatus?.queuedMutations ?? 0) === queuedMutations
      ) {
        return state;
      }

      return {
        workbenchInteraction:
          !active && pendingCommits === 0 && queuedMutations === 0
            ? null
            : {
                active,
                pendingCommits,
                queuedMutations,
              },
      };
    });
  };

  const getQueuedMutationCount = () => {
    const currentEpoch = getCanvasResetEpoch();
    for (const epoch of Array.from(queuedMutationCountByEpoch.keys())) {
      if (epoch !== currentEpoch) {
        queuedMutationCountByEpoch.delete(epoch);
      }
    }

    const currentCount = queuedMutationCountByEpoch.get(currentEpoch) ?? 0;
    if (currentCount <= 0) {
      queuedMutationCountByEpoch.delete(currentEpoch);
      return 0;
    }

    return currentCount;
  };

  const incrementQueuedMutationCount = (epoch: number) => {
    queuedMutationCountByEpoch.set(epoch, (queuedMutationCountByEpoch.get(epoch) ?? 0) + 1);
    const loadedWorkbenchId = getState().loadedWorkbenchId;
    if (loadedWorkbenchId) {
      syncWorkbenchInteractionStatus(loadedWorkbenchId);
    }
  };

  const decrementQueuedMutationCount = (epoch: number) => {
    const nextCount = (queuedMutationCountByEpoch.get(epoch) ?? 0) - 1;
    if (nextCount <= 0) {
      queuedMutationCountByEpoch.delete(epoch);
    } else {
      queuedMutationCountByEpoch.set(epoch, nextCount);
    }
    const loadedWorkbenchId = getState().loadedWorkbenchId;
    if (loadedWorkbenchId) {
      syncWorkbenchInteractionStatus(loadedWorkbenchId);
    }
  };

  const hasQueuedMutation = () => getQueuedMutationCount() > 0;

  const getActiveInteraction = (workbenchId: string) => {
    const interaction = activeInteractionByWorkbenchId.get(workbenchId);
    if (!interaction) {
      return null;
    }

    if (interaction.epoch !== getCanvasResetEpoch()) {
      activeInteractionByWorkbenchId.delete(workbenchId);
      syncWorkbenchInteractionStatus(workbenchId);
      return null;
    }

    return interaction;
  };

  const getPendingInteractionCommits = (workbenchId: string) => {
    const pendingCommits = pendingInteractionCommitsByWorkbenchId.get(workbenchId) ?? [];
    const livePendingCommits = pendingCommits.filter(
      (pendingCommit) => pendingCommit.epoch === getCanvasResetEpoch()
    );

    if (livePendingCommits.length === pendingCommits.length) {
      return livePendingCommits;
    }

    if (livePendingCommits.length === 0) {
      pendingInteractionCommitsByWorkbenchId.delete(workbenchId);
    } else {
      pendingInteractionCommitsByWorkbenchId.set(workbenchId, livePendingCommits);
    }
    syncWorkbenchInteractionStatus(workbenchId);

    return livePendingCommits;
  };

  const hasPendingInteractionCommit = (workbenchId: string, interactionId: string) =>
    getPendingInteractionCommits(workbenchId).some(
      (pendingCommit) => pendingCommit.interactionId === interactionId
    );

  const pushPendingInteractionCommit = (
    workbenchId: string,
    pendingCommit: PendingInteractionCommit
  ) => {
    const pendingCommits = getPendingInteractionCommits(workbenchId);
    pendingInteractionCommitsByWorkbenchId.set(workbenchId, [
      ...pendingCommits,
      pendingCommit,
    ]);
    syncWorkbenchInteractionStatus(workbenchId);
  };

  const removePendingInteractionCommit = (
    workbenchId: string,
    interactionId: string
  ) => {
    const pendingCommits = getPendingInteractionCommits(workbenchId);
    const nextPendingCommits = pendingCommits.filter(
      (pendingCommit) => pendingCommit.interactionId !== interactionId
    );
    if (nextPendingCommits.length === pendingCommits.length) {
      return null;
    }
    if (nextPendingCommits.length === 0) {
      pendingInteractionCommitsByWorkbenchId.delete(workbenchId);
    } else {
      pendingInteractionCommitsByWorkbenchId.set(workbenchId, nextPendingCommits);
    }
    syncWorkbenchInteractionStatus(workbenchId);

    return pendingCommits.find(
      (pendingCommit) => pendingCommit.interactionId === interactionId
    ) ?? null;
  };

  const clearPendingInteractionCommits = (workbenchId: string) => {
    pendingInteractionCommitsByWorkbenchId.delete(workbenchId);
    syncWorkbenchInteractionStatus(workbenchId);
  };

  const clearTrackedWorkbenchInteractions = (workbenchId: string) => {
    const hadActiveInteraction = activeInteractionByWorkbenchId.delete(workbenchId);
    const hadPendingCommits = pendingInteractionCommitsByWorkbenchId.delete(workbenchId);
    if (hadActiveInteraction || hadPendingCommits) {
      syncWorkbenchInteractionStatus(workbenchId);
    }
  };

  const clearSessionInteractionTracking = () => {
    const trackedWorkbenchIds = new Set<string>([
      ...activeInteractionByWorkbenchId.keys(),
      ...pendingInteractionCommitsByWorkbenchId.keys(),
    ]);
    activeInteractionByWorkbenchId.clear();
    pendingInteractionCommitsByWorkbenchId.clear();

    const loadedWorkbenchId = getState().loadedWorkbenchId;
    if (loadedWorkbenchId) {
      trackedWorkbenchIds.add(loadedWorkbenchId);
    }

    for (const workbenchId of trackedWorkbenchIds) {
      syncWorkbenchInteractionStatus(workbenchId);
    }
  };

  const isWorkbenchMutationBlocked = (workbenchId: string) =>
    Boolean(getActiveInteraction(workbenchId)) ||
    getPendingInteractionCommits(workbenchId).length > 0;

  const resolveActiveInteraction = (workbenchId: string, interactionId: string) => {
    const interaction = getActiveInteraction(workbenchId);
    if (!interaction) {
      return null;
    }

    if (interaction.interactionId !== interactionId) {
      return null;
    }

    return interaction;
  };

  const restoreWorkbenchBaseline = (
    workbenchId: string,
    baselineWorkbench: CanvasWorkbench,
    baselineHistory: ReturnType<typeof createEmptyHistoryState>
  ) => {
    setState((state) =>
      state.loadedWorkbenchId !== workbenchId
        ? state
        : {
            workbench: baselineWorkbench,
            workbenchDraft: null,
            workbenchHistory: cloneHistoryState(baselineHistory),
          }
    );
  };

  const rollbackInteractionToBaseline = (
    workbenchId: string,
    interaction: CanvasInteractionTransaction
  ) => {
    if (interaction.epoch !== getCanvasResetEpoch()) {
      activeInteractionByWorkbenchId.delete(workbenchId);
      syncWorkbenchInteractionStatus(workbenchId);
      return null;
    }

    restoreWorkbenchBaseline(
      workbenchId,
      interaction.baselineWorkbench,
      interaction.baselineHistory
    );
    activeInteractionByWorkbenchId.delete(workbenchId);
    syncWorkbenchInteractionStatus(workbenchId);
    return interaction.baselineWorkbench;
  };

  const rollbackPendingInteractionCommit = (
    workbenchId: string,
    pendingCommit: PendingInteractionCommit
  ) => {
    if (pendingCommit.epoch !== getCanvasResetEpoch()) {
      clearPendingInteractionCommits(workbenchId);
      activeInteractionByWorkbenchId.delete(workbenchId);
      syncWorkbenchInteractionStatus(workbenchId);
      return null;
    }

    clearPendingInteractionCommits(workbenchId);
    activeInteractionByWorkbenchId.delete(workbenchId);
    syncWorkbenchInteractionStatus(workbenchId);
    restoreWorkbenchBaseline(
      workbenchId,
      pendingCommit.baselineWorkbench,
      pendingCommit.baselineHistory
    );

    return pendingCommit.baselineWorkbench;
  };

  const service: CanvasWorkbenchService = {
    init: async () => {
      const pendingInit = getCanvasInitPromise();
      if (pendingInit) {
        return pendingInit;
      }

      const epoch = getCanvasResetEpoch();
      const initPromise = (async () => {
        setState({ isLoading: true });
        try {
          while (epoch === getCanvasResetEpoch()) {
            await waitForCanvasMutationQueueIdle();
            if (epoch !== getCanvasResetEpoch()) {
              return;
            }

            const mutationVersion = getCanvasMutationVersion();

            await flushPendingCanvasWorkbenchCompensation({
              epoch,
              getResetEpoch: getCanvasResetEpoch,
            });
            if (epoch !== getCanvasResetEpoch()) {
              return;
            }

            const workbenchList = await loadCanvasWorkbenchListForCurrentUser();
            if (epoch !== getCanvasResetEpoch()) {
              return;
            }

            if (mutationVersion !== getCanvasMutationVersion()) {
              continue;
            }

            setState((state) =>
              epoch !== getCanvasResetEpoch() ||
              mutationVersion !== getCanvasMutationVersion()
                ? state
                : {
                    workbenchList,
                    isLoading: false,
                  }
            );
            return;
          }
        } catch (error) {
          if (epoch === getCanvasResetEpoch()) {
            setState({ isLoading: false });
          }
          console.warn("Canvas store initialization failed.", error);
        }
      })().finally(() => {
        setCanvasInitPromise(null);
      });

      setCanvasInitPromise(initPromise);
      return initPromise;
    },
    openWorkbench: async (workbenchId) => {
      const epoch = getCanvasResetEpoch();
      incrementQueuedMutationCount(epoch);
      return enqueueCanvasMutationTask(async () => {
        const loaded = await loadPersistedCanvasWorkbench(workbenchId);
        if (!loaded || epoch !== getCanvasResetEpoch()) {
          return null;
        }

        await ensureAssetStoreReady();
        if (epoch !== getCanvasResetEpoch()) {
          return null;
        }

        const normalized = normalizeCanvasWorkbenchWithCleanup(loaded);
        const workbench = normalized.document;

        if (epoch !== getCanvasResetEpoch()) {
          return null;
        }

        clearSessionInteractionTracking();
        let didOpen = false;
        setState((state) => {
          if (epoch !== getCanvasResetEpoch()) {
            return state;
          }

          didOpen = true;
          return {
            workbenchList: [
              materializeCanvasWorkbenchListEntry(workbench),
              ...state.workbenchList.filter((entry) => entry.id !== workbench.id),
            ],
            loadedWorkbenchId: workbench.id,
            workbench,
            workbenchDraft: null,
            workbenchHistory:
              state.loadedWorkbenchId === workbench.id && state.workbenchHistory
                ? state.workbenchHistory
                : createEmptyHistoryState(),
            workbenchInteraction:
              state.loadedWorkbenchId === workbench.id ? state.workbenchInteraction : null,
            selectedElementIds: [],
          };
        });
        if (!didOpen) {
          return null;
        }
        syncWorkbenchInteractionStatus(workbench.id);
        return workbench;
      }).finally(() => {
        decrementQueuedMutationCount(epoch);
      });
    },
    closeWorkbench: () => {
      clearSessionInteractionTracking();
      setState({
        loadedWorkbenchId: null,
        workbench: null,
        workbenchDraft: null,
        selectedElementIds: [],
        workbenchHistory: null,
        workbenchInteraction: null,
      });
    },
    createWorkbench: async (name, options) => {
      const epoch = getCanvasResetEpoch();
      incrementQueuedMutationCount(epoch);
      return enqueueCanvasMutationTask(async () => {
        await flushPendingCanvasWorkbenchCompensation({
          epoch,
          getResetEpoch: getCanvasResetEpoch,
        });
        if (epoch !== getCanvasResetEpoch()) {
          return null;
        }

        const workbench = makeDefaultWorkbench(name);
        const outcome = await mutationEngine.commitCreatedWorkbenchToStore(
          workbench,
          epoch,
          options
        );
        return outcome.status === "committed" ? outcome.value : null;
      }).finally(() => {
        decrementQueuedMutationCount(epoch);
      });
    },
    patchWorkbench: async (workbenchId, patch, options?: PatchWorkbenchOptions) => {
      return executeWorkbenchCommand(
        workbenchId,
        {
          type: "PATCH_DOCUMENT",
          patch,
        },
        {
          trackHistory: options?.trackHistory !== false,
        }
      );
    },
    deleteWorkbench: async (id) => {
      if (isWorkbenchMutationBlocked(id)) {
        return false;
      }

      const epoch = getCanvasResetEpoch();
      incrementQueuedMutationCount(epoch);
      return enqueueCanvasMutationTask(async () => {
        await flushPendingCanvasWorkbenchCompensation({
          epoch,
          getResetEpoch: getCanvasResetEpoch,
        });
        if (epoch !== getCanvasResetEpoch()) {
          return false;
        }

        const outcome = await mutationEngine.commitDeletedWorkbenchToStore(id, epoch);
        if (outcome.status === "committed") {
          clearTrackedWorkbenchInteractions(id);
        }
        return outcome.status === "committed";
      }).finally(() => {
        decrementQueuedMutationCount(epoch);
      });
    },
    executeCommandInWorkbench: executeWorkbenchCommand,
    beginInteractionInWorkbench: (workbenchId) => {
      const workbench = resolveCommandTarget(workbenchId);
      if (!workbench) {
        return null;
      }

      const existingInteraction = getActiveInteraction(workbenchId);
      if (
        existingInteraction ||
        getPendingInteractionCommits(workbenchId).length > 0 ||
        hasQueuedMutation()
      ) {
        return null;
      }

      const history = getState().workbenchHistory ?? createEmptyHistoryState();
      const interaction: CanvasInteractionTransaction = {
        baselineHistory: cloneHistoryState(history),
        baselineWorkbench: workbench,
        commandType: null,
        epoch: getCanvasResetEpoch(),
        hasPreviewChanges: false,
        interactionId: createId("canvas-interaction"),
      };
      activeInteractionByWorkbenchId.set(workbenchId, interaction);
      syncWorkbenchInteractionStatus(workbenchId);
      return { interactionId: interaction.interactionId };
    },
    previewCommandInWorkbench: (workbenchId, interactionId, command) => {
      const interaction = resolveActiveInteraction(workbenchId, interactionId);
      if (!interaction) {
        return null;
      }

      if (interaction.commandType && interaction.commandType !== command.type) {
        return null;
      }
      interaction.commandType ??= command.type;

      const activeWorkbench = resolveCommandTarget(workbenchId);
      if (!activeWorkbench) {
        activeInteractionByWorkbenchId.delete(workbenchId);
        syncWorkbenchInteractionStatus(workbenchId);
        return null;
      }

      const outcome = mutationEngine.previewCommandAgainstWorkbench(
        workbenchId,
        activeWorkbench,
        validateCommand(command),
        interaction.epoch
      );
      if (outcome.status !== "committed" && outcome.status !== "noop") {
        activeInteractionByWorkbenchId.delete(workbenchId);
        syncWorkbenchInteractionStatus(workbenchId);
        return null;
      }

      if (outcome.status === "committed") {
        interaction.hasPreviewChanges = true;
      }

      return outcome.value;
    },
    commitInteractionInWorkbench: async (workbenchId, interactionId) => {
      const interaction = resolveActiveInteraction(workbenchId, interactionId);
      if (!interaction) {
        return null;
      }

      const activeWorkbench = resolveCommandTarget(workbenchId);
      if (!activeWorkbench || interaction.epoch !== getCanvasResetEpoch()) {
        activeInteractionByWorkbenchId.delete(workbenchId);
        syncWorkbenchInteractionStatus(workbenchId);
        return null;
      }

      activeInteractionByWorkbenchId.delete(workbenchId);
      syncWorkbenchInteractionStatus(workbenchId);

      if (
        !interaction.hasPreviewChanges ||
        !interaction.commandType
      ) {
        restoreWorkbenchBaseline(
          workbenchId,
          interaction.baselineWorkbench,
          interaction.baselineHistory
        );
        return interaction.baselineWorkbench;
      }

      const diff = diffCanvasDocumentDelta(
        interaction.baselineWorkbench,
        activeWorkbench
      );
      if (!diff.didChange) {
        restoreWorkbenchBaseline(
          workbenchId,
          interaction.baselineWorkbench,
          interaction.baselineHistory
        );
        return interaction.baselineWorkbench;
      }

      const historyEntry: CanvasHistoryEntry = {
        commandType: interaction.commandType,
        delta: diff.delta,
      };
      const pendingCommit: PendingInteractionCommit = {
        baselineHistory: cloneHistoryState(interaction.baselineHistory),
        baselineWorkbench: interaction.baselineWorkbench,
        epoch: interaction.epoch,
        interactionId,
        nextWorkbench: activeWorkbench,
      };

      pushPendingInteractionCommit(workbenchId, pendingCommit);
      setState((state) => {
        const history = state.workbenchHistory ?? createEmptyHistoryState();
        return {
          workbenchHistory: appendCanvasHistoryEntry(history, historyEntry),
        };
      });

      return enqueueCanvasMutationTask(async () => {
        if (pendingCommit.epoch !== getCanvasResetEpoch()) {
          removePendingInteractionCommit(workbenchId, interactionId);
          return null;
        }

        if (!hasPendingInteractionCommit(workbenchId, interactionId)) {
          return null;
        }

        const persistStatus = await persistCommittedWorkbench(
          pendingCommit.nextWorkbench,
          pendingCommit.epoch
        );
        if (persistStatus !== "persisted") {
          if (persistStatus === "persist_failed") {
            rollbackPendingInteractionCommit(workbenchId, pendingCommit);
          } else if (persistStatus === "epoch_invalidated_after_persist") {
            removePendingInteractionCommit(workbenchId, interactionId);
            return pendingCommit.nextWorkbench;
          } else {
            removePendingInteractionCommit(workbenchId, interactionId);
          }

          return null;
        }

        removePendingInteractionCommit(workbenchId, interactionId);
        setState((state) =>
          state.loadedWorkbenchId !== workbenchId
            ? state
            : {
                workbenchList: [
                  materializeCanvasWorkbenchListEntry(pendingCommit.nextWorkbench),
                  ...state.workbenchList.filter(
                    (entry) => entry.id !== pendingCommit.nextWorkbench.id
                  ),
                ],
                workbench: pendingCommit.nextWorkbench,
                workbenchDraft: null,
              }
        );
        return pendingCommit.nextWorkbench;
      });
    },
    rollbackInteractionInWorkbench: (workbenchId, interactionId) => {
      const interaction = resolveActiveInteraction(workbenchId, interactionId);
      if (!interaction) {
        return null;
      }

      return rollbackInteractionToBaseline(workbenchId, interaction);
    },
    upsertElementInWorkbench: async (workbenchId, element) => {
      if (isWorkbenchMutationBlocked(workbenchId)) {
        return;
      }

      await enqueueQueuedWorkbenchMutation(
        workbenchId,
        async (activeWorkbench, epoch) => {
          const existingNode = activeWorkbench.nodes[element.id];
          if (existingNode) {
            if (existingNode.type !== element.type) {
              return;
            }
            await mutationEngine.executeCommandAgainstWorkbench(
              workbenchId,
              activeWorkbench,
              {
                type: "UPDATE_NODE_PROPS",
                updates: [
                  {
                    id: element.id,
                    patch: toEditableElementPropertyPatch(element),
                  },
                ],
              },
              epoch
            );
            return;
          }

          await mutationEngine.executeCommandAgainstWorkbench(
            workbenchId,
            activeWorkbench,
            validateCommand({
              type: "INSERT_NODES",
              nodes: [canonicalizeInsertedElement(element)],
              parentId: element.parentId,
            }),
            epoch
          );
        },
        undefined
      );
    },
    upsertElementsInWorkbench: async (workbenchId, elements) => {
      for (const element of elements) {
        await service.upsertElementInWorkbench(workbenchId, element);
      }
    },
    deleteNodesInWorkbench: async (workbenchId, ids) => {
      if (ids.length === 0 || isWorkbenchMutationBlocked(workbenchId)) {
        return [];
      }

      return enqueueQueuedWorkbenchMutation(
        workbenchId,
        async (activeWorkbench, epoch) => {
          const deleteIds = Array.from(
            new Set(
              ids.flatMap((nodeId) => [nodeId, ...getCanvasDescendantIds(activeWorkbench, nodeId)])
            )
          ).filter((nodeId) => Boolean(activeWorkbench.nodes[nodeId]));
          if (deleteIds.length === 0) {
            return [];
          }

          const outcome = await mutationEngine.executeCommandAgainstWorkbench(
            workbenchId,
            activeWorkbench,
            {
              type: "DELETE_NODES",
              ids: deleteIds,
            },
            epoch
          );
          if (outcome.status !== "committed") {
            return [];
          }

          const deleteIdSet = new Set(deleteIds);
          setState((state) => ({
            selectedElementIds: state.selectedElementIds.filter((id) => !deleteIdSet.has(id)),
          }));
          return deleteIds;
        },
        []
      );
    },
    duplicateNodesInWorkbench: async (workbenchId, ids) => {
      if (ids.length === 0 || isWorkbenchMutationBlocked(workbenchId)) {
        return [];
      }

      return enqueueQueuedWorkbenchMutation(
        workbenchId,
        async (activeWorkbench, epoch) => {
          const uniqueIds = Array.from(new Set(ids));
          const assetById = new Map(
            useAssetStore.getState().assets.map((asset) => [asset.id, asset] as const)
          );
          const selectedRoots = uniqueIds.filter(
            (nodeId) =>
              !uniqueIds.some((candidateId) =>
                getCanvasDescendantIds(activeWorkbench, candidateId).includes(nodeId)
              )
          );
          const usedIds = new Set(Object.keys(activeWorkbench.nodes));
          const parentById = buildCanvasHierarchyIndex(activeWorkbench).parentById;
          const duplicatedTrees = selectedRoots.map((nodeId) =>
            cloneNodeTree(
              activeWorkbench,
              nodeId,
              { x: 24, y: 24 },
              usedIds,
              parentById[nodeId] ?? null,
              undefined,
              assetById
            )
          );
          const duplicates = duplicatedTrees.flat();
          const duplicatedIds = duplicatedTrees
            .map((nodes) => nodes[0]?.id ?? null)
            .filter((nodeId): nodeId is string => Boolean(nodeId));

          const outcome = await mutationEngine.executeCommandAgainstWorkbench(
            workbenchId,
            activeWorkbench,
            {
              type: "INSERT_NODES",
              nodes: duplicates,
            },
            epoch,
            undefined,
            duplicatedIds
          );

          return outcome.status === "committed" ? duplicatedIds : [];
        },
        []
      );
    },
    groupNodesInWorkbench: async (workbenchId, ids) => {
      const uniqueIds = Array.from(new Set(ids));
      if (uniqueIds.length < 2 || isWorkbenchMutationBlocked(workbenchId)) {
        return null;
      }

      return enqueueQueuedWorkbenchMutation(
        workbenchId,
        async (activeWorkbench, epoch) => {
          const groupId = claimUniqueNodeId(new Set(Object.keys(activeWorkbench.nodes)));
          const outcome = await mutationEngine.executeCommandAgainstWorkbench(
            workbenchId,
            activeWorkbench,
            {
              type: "GROUP_NODES",
              ids: uniqueIds,
              groupId,
            },
            epoch,
            undefined,
            [groupId]
          );
          if (outcome.status !== "committed") {
            return null;
          }
          if (!outcome.value.nodes[groupId] || outcome.value.nodes[groupId].type !== "group") {
            return null;
          }
          return groupId;
        },
        null
      );
    },
    undo: async (workbenchId) => {
      if (!workbenchId || isWorkbenchMutationBlocked(workbenchId)) {
        return false;
      }
      return enqueueQueuedWorkbenchMutation(
        workbenchId,
        async (activeWorkbench, epoch) => {
          const history = getState().workbenchHistory ?? createEmptyHistoryState();
          const previous =
            history.cursor > 0 ? history.entries[history.cursor - 1] ?? null : null;
          if (!previous) {
            return false;
          }

          const descriptor = mutationEngine.createHistoryTransitionDescriptor(
            workbenchId,
            activeWorkbench,
            "undo",
            previous,
            history
          );
          const outcome = await mutationEngine.commitDescriptorToStore(descriptor, epoch, []);
          return (
            outcome.status === "committed" ||
            outcome.status === "epoch_invalidated_after_persist"
          );
        },
        false
      );
    },
    redo: async (workbenchId) => {
      if (!workbenchId || isWorkbenchMutationBlocked(workbenchId)) {
        return false;
      }
      return enqueueQueuedWorkbenchMutation(
        workbenchId,
        async (activeWorkbench, epoch) => {
          const history = getState().workbenchHistory ?? createEmptyHistoryState();
          const nextEntry =
            history.cursor < history.entries.length
              ? history.entries[history.cursor] ?? null
              : null;
          if (!nextEntry) {
            return false;
          }

          const descriptor = mutationEngine.createHistoryTransitionDescriptor(
            workbenchId,
            activeWorkbench,
            "redo",
            nextEntry,
            history
          );
          const outcome = await mutationEngine.commitDescriptorToStore(descriptor, epoch, []);
          return (
            outcome.status === "committed" ||
            outcome.status === "epoch_invalidated_after_persist"
          );
        },
        false
      );
    },
  };

  return service;
};
