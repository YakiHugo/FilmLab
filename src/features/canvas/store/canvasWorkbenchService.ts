import {
  areEqual,
  buildCanvasHierarchyIndex,
  getCanvasDescendantIds,
  getCanvasWorkbenchSnapshot,
  resolveCanvasWorkbench,
} from "@/features/canvas/documentGraph";
import { diffCanvasDocumentChangeSet } from "@/features/canvas/document/patches";
import { canonicalizeCanvasImageNode } from "@/features/canvas/imageRenderState";
import { normalizeCanvasWorkbenchWithCleanup } from "@/features/canvas/studioPresets";
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
  enqueueLifecycleTask,
  enqueueWorkbenchTask,
  getCanvasInitPromise,
  getCanvasResetEpoch,
  resetCanvasWorkbenchTaskCoordinator,
  setCanvasInitPromise,
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

  const buildAssetById = () =>
    new Map(useAssetStore.getState().assets.map((asset) => [asset.id, asset] as const));

  const canonicalizeWorkbenchImageNodes = (workbench: CanvasWorkbench) => {
    const snapshot = getCanvasWorkbenchSnapshot(workbench);
    const assetById = buildAssetById();
    let didChange = false;
    const nextNodes = Object.fromEntries(
      Object.entries(snapshot.nodes).map(([nodeId, node]) => {
        if (node.type !== "image") {
          return [nodeId, node];
        }
        const nextNode = canonicalizeCanvasImageNode(
          node,
          assetById.get(node.assetId) ?? null
        );
        if (!didChange && !areEqual(node, nextNode)) {
          didChange = true;
        }
        return [nodeId, nextNode];
      })
    );

    return didChange ? resolveCanvasWorkbench({ ...snapshot, nodes: nextNodes }) : workbench;
  };

  const canonicalizeCommand = (command: CanvasCommand): CanvasCommand => {
    if (command.type !== "INSERT_NODES") {
      return command;
    }

    const assetById = buildAssetById();
    let didChange = false;
    const nodes = command.nodes.map((node) => {
      if (node.type !== "image") {
        return node;
      }
      const nextNode = canonicalizeCanvasImageNode(
        node,
        assetById.get(node.assetId) ?? null
      );
      if (!didChange && !areEqual(node, nextNode)) {
        didChange = true;
      }
      return nextNode;
    });

    return didChange ? { ...command, nodes } : command;
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
    enqueueWorkbenchTask(workbenchId, async () => {
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
            canonicalizeCommand(command),
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
    incrementQueuedMutationCount(workbenchId, queueEpoch);
    return enqueueWorkbenchMutation(workbenchId, task, onMissing).finally(() => {
      decrementQueuedMutationCount(workbenchId, queueEpoch);
    });
  };

  const activeInteractionByWorkbenchId = new Map<string, CanvasInteractionTransaction>();
  const pendingInteractionCommitsByWorkbenchId = new Map<
    string,
    PendingInteractionCommit[]
  >();
  const queuedMutationCountByWorkbenchId = new Map<string, Map<number, number>>();

  const cloneHistoryState = (
    history: ReturnType<typeof createEmptyHistoryState>
  ): ReturnType<typeof createEmptyHistoryState> => ({
    past: history.past.slice(),
    future: history.future.slice(),
  });

  const syncWorkbenchInteractionStatus = (workbenchId: string) => {
    const active = Boolean(getActiveInteraction(workbenchId));
    const pendingCommits = getPendingInteractionCommits(workbenchId).length;
    const queuedMutations = getQueuedMutationCount(workbenchId);

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

  const getQueuedMutationCount = (workbenchId: string) => {
    const countsByEpoch = queuedMutationCountByWorkbenchId.get(workbenchId);
    if (!countsByEpoch) {
      return 0;
    }

    const currentEpoch = getCanvasResetEpoch();
    for (const epoch of Array.from(countsByEpoch.keys())) {
      if (epoch !== currentEpoch) {
        countsByEpoch.delete(epoch);
      }
    }

    const currentCount = countsByEpoch.get(currentEpoch) ?? 0;
    if (currentCount <= 0) {
      countsByEpoch.delete(currentEpoch);
    }
    if (countsByEpoch.size === 0) {
      queuedMutationCountByWorkbenchId.delete(workbenchId);
      return 0;
    }

    return currentCount;
  };

  const incrementQueuedMutationCount = (workbenchId: string, epoch: number) => {
    const countsByEpoch = queuedMutationCountByWorkbenchId.get(workbenchId) ?? new Map<number, number>();
    countsByEpoch.set(epoch, (countsByEpoch.get(epoch) ?? 0) + 1);
    queuedMutationCountByWorkbenchId.set(workbenchId, countsByEpoch);
    syncWorkbenchInteractionStatus(workbenchId);
  };

  const decrementQueuedMutationCount = (workbenchId: string, epoch: number) => {
    const countsByEpoch = queuedMutationCountByWorkbenchId.get(workbenchId);
    if (!countsByEpoch) {
      return;
    }

    const nextCount = (countsByEpoch.get(epoch) ?? 0) - 1;
    if (nextCount <= 0) {
      countsByEpoch.delete(epoch);
    } else {
      countsByEpoch.set(epoch, nextCount);
    }
    if (countsByEpoch.size === 0) {
      queuedMutationCountByWorkbenchId.delete(workbenchId);
    }
    syncWorkbenchInteractionStatus(workbenchId);
  };

  const hasQueuedMutation = (workbenchId: string) =>
    getQueuedMutationCount(workbenchId) > 0;

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
      const initPromise = enqueueLifecycleTask({
        beforeTask: () =>
          flushPendingCanvasWorkbenchCompensation({
            epoch,
            getResetEpoch: getCanvasResetEpoch,
          }),
        epoch,
        onInvalidated: undefined,
        task: async () => {
          setState({ isLoading: true });
          try {
            const workbenchList = await loadCanvasWorkbenchListForCurrentUser();
            if (epoch !== getCanvasResetEpoch()) {
              return;
            }

            setState((state) =>
              epoch !== getCanvasResetEpoch()
                ? state
                : {
                    workbenchList,
                    isLoading: false,
                  }
            );
          } catch (error) {
            if (epoch === getCanvasResetEpoch()) {
              setState({ isLoading: false });
            }
            console.warn("Canvas store initialization failed.", error);
          }
        },
      }).finally(() => {
        setCanvasInitPromise(null);
      });

      setCanvasInitPromise(initPromise);
      return initPromise;
    },
    openWorkbench: async (workbenchId) => {
      const epoch = getCanvasResetEpoch();
      return enqueueWorkbenchTask(workbenchId, async () => {
        const loaded = await loadPersistedCanvasWorkbench(workbenchId);
        if (!loaded || epoch !== getCanvasResetEpoch()) {
          return null;
        }

        await ensureAssetStoreReady();
        if (epoch !== getCanvasResetEpoch()) {
          return null;
        }

        const normalized = normalizeCanvasWorkbenchWithCleanup(loaded);
        const workbench = canonicalizeWorkbenchImageNodes(normalized.document);
        const normalizedSnapshot = getCanvasWorkbenchSnapshot(workbench);
        if (!areEqual(loaded, normalizedSnapshot)) {
          await persistCanvasWorkbenchRecord({
            epoch,
            getResetEpoch: getCanvasResetEpoch,
            workbench,
          });
        }

        if (epoch !== getCanvasResetEpoch()) {
          return null;
        }

        setState((state) => ({
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
        }));
        return workbench;
      });
    },
    closeWorkbench: () => {
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
      return enqueueLifecycleTask({
        beforeTask: () =>
          flushPendingCanvasWorkbenchCompensation({
            epoch,
            getResetEpoch: getCanvasResetEpoch,
          }),
        epoch,
        onInvalidated: null,
        task: async () => {
          const workbench = makeDefaultWorkbench(name);
          const outcome = await mutationEngine.commitCreatedWorkbenchToStore(
            workbench,
            epoch,
            options
          );
          return outcome.status === "committed" ? outcome.value : null;
        },
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
      incrementQueuedMutationCount(id, epoch);
      return enqueueLifecycleTask({
        beforeTask: () =>
          flushPendingCanvasWorkbenchCompensation({
            epoch,
            getResetEpoch: getCanvasResetEpoch,
          }),
        epoch,
        onInvalidated: false,
        task: async () => {
            const outcome = await mutationEngine.commitDeletedWorkbenchToStore(id, epoch);
          return outcome.status === "committed";
        },
      }).finally(() => {
        decrementQueuedMutationCount(id, epoch);
      });
    },
    executeCommandInWorkbench: executeWorkbenchCommand,
    beginInteractionInWorkbench: (workbenchId) => {
      const workbench = resolveCommandTarget(workbenchId);
      if (!workbench) {
        return null;
      }

      const existingInteraction = getActiveInteraction(workbenchId);
      if (existingInteraction || hasQueuedMutation(workbenchId)) {
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
        canonicalizeCommand(command),
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

      const diff = diffCanvasDocumentChangeSet(
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
        forwardChangeSet: diff.forwardChangeSet,
        inverseChangeSet: diff.inverseChangeSet,
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

      return enqueueWorkbenchTask(workbenchId, async () => {
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
            canonicalizeCommand({
              type: "INSERT_NODES",
              nodes: [element],
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
          const previous = history.past[history.past.length - 1];
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
          const nextEntry = history.future[0];
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
