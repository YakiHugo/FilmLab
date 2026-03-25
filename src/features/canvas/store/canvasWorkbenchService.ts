import {
  areEqual,
  buildCanvasHierarchyIndex,
  getCanvasDescendantIds,
  getCanvasWorkbenchSnapshot,
} from "@/features/canvas/documentGraph";
import { normalizeCanvasWorkbenchWithCleanup } from "@/features/canvas/studioPresets";
import type {
  CanvasCommand,
  CanvasEditableElement,
  CanvasWorkbench,
} from "@/types";
import { createEmptyHistoryState } from "./canvasWorkbenchState";
import { createCanvasWorkbenchMutationEngine } from "./canvasWorkbenchMutationEngine";
import {
  claimUniqueNodeId,
  cloneNodeTree,
  makeDefaultWorkbench,
  toEditableElementPropertyPatch,
} from "./canvasWorkbenchNodeHelpers";
import {
  deletePersistedCanvasWorkbench,
  flushPendingCanvasWorkbenchCompensation,
  loadCanvasWorkbenchesForCurrentUser,
  persistCanvasWorkbenchSnapshot,
  queueCanvasWorkbenchCleanupCompensation,
  queueCanvasWorkbenchRestoreCompensation,
  resetCanvasWorkbenchPersistenceGateway,
  savePersistedCanvasWorkbenchSnapshot,
} from "./canvasWorkbenchPersistenceGateway";
import type {
  CanvasStoreDataSetter,
  CanvasStoreDataState,
  CanvasWorkbenchEditablePatch,
  CreateWorkbenchOptions,
  DeleteWorkbenchOptions,
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

export interface CanvasWorkbenchService {
  init: () => Promise<void>;
  createWorkbench: (name?: string, options?: CreateWorkbenchOptions) => Promise<CanvasWorkbench | null>;
  patchWorkbench: (
    workbenchId: string,
    patch: CanvasWorkbenchEditablePatch,
    options?: PatchWorkbenchOptions
  ) => Promise<CanvasWorkbench | null>;
  deleteWorkbench: (id: string, options?: DeleteWorkbenchOptions) => Promise<boolean>;
  executeCommandInWorkbench: (
    workbenchId: string,
    command: CanvasCommand,
    options?: ExecuteCommandOptions
  ) => Promise<CanvasWorkbench | null>;
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
  resetCanvasWorkbenchPersistenceGateway();
};

export const createCanvasWorkbenchService = ({
  getState,
  setState,
}: CanvasWorkbenchServiceStoreApi): CanvasWorkbenchService => {
  const resolveCommandTarget = (workbenchId: string) =>
    getState().workbenches.find((workbench) => workbench.id === workbenchId) ?? null;

  const persistCommittedWorkbench = async (workbench: CanvasWorkbench, epoch: number) =>
    persistCanvasWorkbenchSnapshot({
      epoch,
      getResetEpoch: getCanvasResetEpoch,
      workbench,
    });

  const mutationEngine = createCanvasWorkbenchMutationEngine({
    deletePersistedWorkbench: deletePersistedCanvasWorkbench,
    getResetEpoch: getCanvasResetEpoch,
    persistCommittedWorkbench,
    queueWorkbenchCleanupCompensation: (workbenchId, userId, epoch) => {
      queueCanvasWorkbenchCleanupCompensation({
        epoch,
        getResetEpoch: getCanvasResetEpoch,
        userId,
        workbenchId,
      });
    },
    queueWorkbenchRestoreCompensation: (snapshot, epoch) => {
      queueCanvasWorkbenchRestoreCompensation({
        epoch,
        getResetEpoch: getCanvasResetEpoch,
        snapshot,
      });
    },
    resolveCommandTarget,
    savePersistedWorkbenchSnapshot: savePersistedCanvasWorkbenchSnapshot,
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
  ) =>
    enqueueWorkbenchMutation(
      workbenchId,
      async (existing, epoch) => {
        const outcome = await mutationEngine.executeCommandAgainstWorkbench(
          workbenchId,
          existing,
          command,
          epoch,
          options
        );
        return outcome.status === "committed" || outcome.status === "noop"
          ? outcome.value
          : null;
      },
      null
    );

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
            const loadedWorkbenches = await loadCanvasWorkbenchesForCurrentUser();
            if (epoch !== getCanvasResetEpoch()) {
              return;
            }
            const normalizedWorkbenches = loadedWorkbenches.map((workbench) =>
              normalizeCanvasWorkbenchWithCleanup(workbench)
            );
            const workbenches = normalizedWorkbenches.map((entry) => entry.document);

            await Promise.all(
              normalizedWorkbenches.map((entry, index) => {
                const original = loadedWorkbenches[index];
                if (!original) {
                  return Promise.resolve(false);
                }
                const normalizedSnapshot = getCanvasWorkbenchSnapshot(entry.document);
                return areEqual(original, normalizedSnapshot)
                  ? Promise.resolve(false)
                  : persistCanvasWorkbenchSnapshot({
                      epoch,
                      getResetEpoch: getCanvasResetEpoch,
                      workbench: entry.document,
                    });
              })
            );

            if (epoch !== getCanvasResetEpoch()) {
              return;
            }

            setState((state) =>
              epoch !== getCanvasResetEpoch()
                ? state
                : {
                    workbenches,
                    activeWorkbenchId: workbenches[0]?.id ?? null,
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
    patchWorkbench: async (workbenchId, patch, options) => {
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
    deleteWorkbench: async (id, options) => {
      const epoch = getCanvasResetEpoch();
      return enqueueLifecycleTask({
        beforeTask: () =>
          flushPendingCanvasWorkbenchCompensation({
            epoch,
            getResetEpoch: getCanvasResetEpoch,
          }),
        epoch,
        onInvalidated: false,
        task: async () => {
          const outcome = await mutationEngine.commitDeletedWorkbenchToStore(id, epoch, options);
          return outcome.status === "committed";
        },
      });
    },
    executeCommandInWorkbench: executeWorkbenchCommand,
    upsertElementInWorkbench: async (workbenchId, element) => {
      await enqueueWorkbenchMutation(
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
            {
              type: "INSERT_NODES",
              nodes: [element],
              parentId: element.parentId,
            },
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
      if (ids.length === 0) {
        return [];
      }

      return enqueueWorkbenchMutation(
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
      if (ids.length === 0) {
        return [];
      }

      return enqueueWorkbenchMutation(
        workbenchId,
        async (activeWorkbench, epoch) => {
          const uniqueIds = Array.from(new Set(ids));
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
              parentById[nodeId] ?? null
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
      if (uniqueIds.length < 2) {
        return null;
      }

      return enqueueWorkbenchMutation(
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
      if (!workbenchId) {
        return false;
      }
      return enqueueWorkbenchMutation(
        workbenchId,
        async (activeWorkbench, epoch) => {
          const history = getState().historyByWorkbenchId[workbenchId] ?? createEmptyHistoryState();
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
          return outcome.status === "committed";
        },
        false
      );
    },
    redo: async (workbenchId) => {
      if (!workbenchId) {
        return false;
      }
      return enqueueWorkbenchMutation(
        workbenchId,
        async (activeWorkbench, epoch) => {
          const history = getState().historyByWorkbenchId[workbenchId] ?? createEmptyHistoryState();
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
          return outcome.status === "committed";
        },
        false
      );
    },
  };

  return service;
};
