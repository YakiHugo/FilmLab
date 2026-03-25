import { getCurrentUserId } from "@/lib/authToken";
import {
  deleteCanvasWorkbench,
  loadCanvasWorkbench,
  loadCanvasWorkbenchesByUser,
  saveCanvasWorkbench,
} from "@/lib/db";
import {
  applyCanvasDocumentChangeSet,
  areEqual,
  buildCanvasHierarchyIndex,
  executeCanvasCommand,
  getCanvasDescendantIds,
  getCanvasWorkbenchSnapshot,
} from "@/features/canvas/documentGraph";
import {
  createDefaultCanvasWorkbenchFields,
  normalizeCanvasWorkbench,
  normalizeCanvasWorkbenchWithCleanup,
} from "@/features/canvas/studioPresets";
import { createId } from "@/utils";
import type {
  CanvasCommand,
  CanvasEditableElement,
  CanvasHistoryEntry,
  CanvasNode,
  CanvasNodeId,
  CanvasWorkbench,
  CanvasWorkbenchSnapshot,
} from "@/types";
import {
  commitCommandResultToState,
  commitCreatedWorkbenchToState,
  commitDeletedWorkbenchToState,
  createCommitFailureOutcome,
  createEmptyHistoryState,
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
  CanvasStoreDataState,
  CanvasWorkbenchEditablePatch,
  CreateWorkbenchOptions,
  DeleteWorkbenchOptions,
  ExecuteCommandOptions,
  PatchWorkbenchOptions,
} from "./canvasStoreTypes";

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

const nowIso = () => new Date().toISOString();

type StoredCanvasWorkbench = Awaited<ReturnType<typeof loadCanvasWorkbenchesByUser>>[number];

const clone = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

let canvasResetEpoch = 0;
let canvasInitPromise: Promise<void> | null = null;
let lifecycleQueueTail: Promise<void> = Promise.resolve();
const workbenchQueueTails = new Map<string, Promise<void>>();
const pendingCanvasWorkbenchCleanupById = new Map<string, string>();
const pendingCanvasWorkbenchRestoreSnapshots = new Map<string, CanvasWorkbenchSnapshot>();

const loadCanvasWorkbenchesForCurrentUser = async (): Promise<StoredCanvasWorkbench[]> => {
  return loadCanvasWorkbenchesByUser(getCurrentUserId());
};

export const getCanvasResetEpoch = () => canvasResetEpoch;

const settleQueueTail = (tail?: Promise<unknown>): Promise<void> =>
  (tail ?? Promise.resolve()).then(
    () => undefined,
    () => undefined
  );

const waitForWorkbenchQueue = (workbenchId: string) =>
  settleQueueTail(workbenchQueueTails.get(workbenchId));

const enqueueWorkbenchTask = <T>(workbenchId: string, task: () => Promise<T>): Promise<T> => {
  const queued = Promise.all([
    settleQueueTail(lifecycleQueueTail),
    waitForWorkbenchQueue(workbenchId),
  ]).then(async () => task());
  const nextTail = settleQueueTail(queued);
  workbenchQueueTails.set(workbenchId, nextTail);
  return queued.finally(() => {
    if (workbenchQueueTails.get(workbenchId) === nextTail) {
      workbenchQueueTails.delete(workbenchId);
    }
  });
};

const enqueueLifecycleTask = <T>(
  epoch: number,
  onInvalidated: T,
  task: () => Promise<T>
): Promise<T> => {
  const workbenchQueueSnapshot = Array.from(workbenchQueueTails.values(), (tail) =>
    settleQueueTail(tail)
  );
  const queued = settleQueueTail(lifecycleQueueTail).then(async () => {
    if (epoch !== canvasResetEpoch) {
      return onInvalidated;
    }
    await Promise.all(workbenchQueueSnapshot);
    if (epoch !== canvasResetEpoch) {
      return onInvalidated;
    }
    await flushPendingCanvasWorkbenchCleanup(epoch);
    return task();
  });
  lifecycleQueueTail = settleQueueTail(queued);
  return queued;
};

const resetCanvasTaskQueues = () => {
  lifecycleQueueTail = Promise.resolve();
  workbenchQueueTails.clear();
};

const flushPendingCanvasWorkbenchCleanup = async (epoch: number) => {
  const currentUserId = getCurrentUserId();
  const pendingCleanupIds = Array.from(pendingCanvasWorkbenchCleanupById.entries())
    .filter(([, userId]) => userId === currentUserId)
    .map(([workbenchId]) => workbenchId);
  const pendingRestoreSnapshots = Array.from(pendingCanvasWorkbenchRestoreSnapshots.values()).filter(
    (snapshot) => snapshot.ownerRef.userId === currentUserId
  );

  if (pendingCleanupIds.length === 0 && pendingRestoreSnapshots.length === 0) {
    return;
  }

  for (const workbenchId of pendingCleanupIds) {
    if (epoch !== canvasResetEpoch || getCurrentUserId() !== currentUserId) {
      return;
    }
    const deleted = await deleteCanvasWorkbench(workbenchId);
    if (deleted) {
      pendingCanvasWorkbenchCleanupById.delete(workbenchId);
    }
  }

  for (const snapshot of pendingRestoreSnapshots) {
    if (epoch !== canvasResetEpoch || getCurrentUserId() !== currentUserId) {
      return;
    }
    const existing = await loadCanvasWorkbench(snapshot.id);
    if (existing) {
      pendingCanvasWorkbenchRestoreSnapshots.delete(snapshot.id);
      continue;
    }
    if (epoch !== canvasResetEpoch || getCurrentUserId() !== currentUserId) {
      return;
    }
    const restored = await saveCanvasWorkbench(snapshot);
    if (restored) {
      pendingCanvasWorkbenchRestoreSnapshots.delete(snapshot.id);
    }
  }
};

const persistCanvasWorkbenchSnapshot = async (
  workbench: CanvasWorkbench,
  epoch: number
): Promise<boolean> => {
  if (epoch !== canvasResetEpoch) {
    return false;
  }

  const saved = await saveCanvasWorkbench(getCanvasWorkbenchSnapshot(workbench));
  if (!saved) {
    return false;
  }

  if (epoch !== canvasResetEpoch) {
    await deleteCanvasWorkbench(workbench.id);
    return false;
  }

  return true;
};

const canQueueCompensation = (epoch: number, userId: string) =>
  epoch === canvasResetEpoch && getCurrentUserId() === userId;

const toEditableElementPropertyPatch = (node: CanvasEditableElement) => ({
  ...node.transform,
  ...(node.type === "text"
    ? {
        color: node.color,
        content: node.content,
        fontFamily: node.fontFamily,
        fontSize: node.fontSize,
        fontSizeTier: node.fontSizeTier,
        textAlign: node.textAlign,
      }
    : {}),
  ...(node.type === "image"
    ? {
        adjustments: node.adjustments,
        filmProfileId: node.filmProfileId,
      }
    : {}),
  ...(node.type === "shape"
    ? {
        arrowHead: node.arrowHead,
        fill: node.fill,
        points: node.points ? clone(node.points) : undefined,
        radius: node.radius,
        shapeType: node.shapeType,
        stroke: node.stroke,
        strokeWidth: node.strokeWidth,
      }
    : {}),
  locked: node.locked,
  opacity: node.opacity,
  visible: node.visible,
});

const claimUniqueNodeId = (usedIds: Set<CanvasNodeId>) => {
  let nextId = createId("node-id");
  while (usedIds.has(nextId)) {
    nextId = createId("node-id");
  }
  usedIds.add(nextId);
  return nextId;
};

const makeDefaultWorkbench = (name = "Untitled Workbench"): CanvasWorkbench => {
  const now = nowIso();
  const defaults = createDefaultCanvasWorkbenchFields();
  return normalizeCanvasWorkbench({
    id: createId("workbench-id"),
    version: 3,
    ownerRef: { userId: getCurrentUserId() },
    name,
    ...defaults,
    backgroundColor: "#050505",
    nodes: {},
    rootIds: [],
    groupChildren: {},
    createdAt: now,
    updatedAt: now,
  });
};

const toEditableNodeFromPersisted = (
  source: CanvasWorkbench["nodes"][string],
  parentId: CanvasNodeId | null
): CanvasNode => {
  const baseNode = {
    id: source.id,
    type: source.type,
    parentId,
    transform: clone(source.transform),
    x: source.transform.x,
    y: source.transform.y,
    width: source.transform.width,
    height: source.transform.height,
    rotation: source.transform.rotation,
    zIndex: source.zIndex,
    opacity: source.opacity,
    locked: source.locked,
    visible: source.visible,
  } satisfies Pick<
    CanvasNode,
    | "height"
    | "id"
    | "locked"
    | "opacity"
    | "parentId"
    | "rotation"
    | "transform"
    | "type"
    | "visible"
    | "width"
    | "x"
    | "y"
    | "zIndex"
  >;

  if (source.type === "group") {
    return {
      ...baseNode,
      type: "group",
      childIds: [],
      name: source.name,
    };
  }

  if (source.type === "image") {
    return {
      ...baseNode,
      type: "image",
      assetId: source.assetId,
      adjustments: source.adjustments,
      filmProfileId: source.filmProfileId,
    };
  }

  if (source.type === "text") {
    return {
      ...baseNode,
      type: "text",
      color: source.color,
      content: source.content,
      fontFamily: source.fontFamily,
      fontSize: source.fontSize,
      fontSizeTier: source.fontSizeTier,
      textAlign: source.textAlign,
    };
  }

  return {
    ...baseNode,
    type: "shape",
    arrowHead: source.arrowHead,
    fill: source.fill,
    points: source.points ? clone(source.points) : undefined,
    radius: source.radius,
    shapeType: source.shapeType,
    stroke: source.stroke,
    strokeWidth: source.strokeWidth,
  };
};

const cloneNodeTree = (
  workbench: CanvasWorkbench,
  nodeId: CanvasNodeId,
  offset: { x: number; y: number },
  usedIds: Set<CanvasNodeId>,
  parentId: CanvasNodeId | null,
  idMap = new Map<CanvasNodeId, CanvasNodeId>()
): CanvasNode[] => {
  const source = workbench.nodes[nodeId];
  if (!source) {
    return [];
  }

  const nextId = claimUniqueNodeId(usedIds);
  idMap.set(nodeId, nextId);
  const cloneNode: CanvasNode = {
    ...toEditableNodeFromPersisted(source, parentId),
    id: nextId,
    transform: {
      ...source.transform,
      x: source.transform.x + offset.x,
      y: source.transform.y + offset.y,
    },
    x: source.transform.x + offset.x,
    y: source.transform.y + offset.y,
    width: source.transform.width,
    height: source.transform.height,
    rotation: source.transform.rotation,
  };

  if (cloneNode.type === "group") {
    const sourceGroup = source.type === "group" ? source : null;
    if (!sourceGroup) {
      return [cloneNode];
    }
    const childIds = workbench.groupChildren[sourceGroup.id] ?? [];
    const children = childIds.flatMap((childId) =>
      cloneNodeTree(workbench, childId, { x: 0, y: 0 }, usedIds, cloneNode.id, idMap)
    );
    cloneNode.childIds = childIds
      .map((childId) => idMap.get(childId))
      .filter((childId): childId is string => Boolean(childId));
    for (const child of children) {
      child.parentId = cloneNode.id;
    }
    return [cloneNode, ...children];
  }

  return [cloneNode];
};

export const resetCanvasWorkbenchService = () => {
  canvasResetEpoch += 1;
  canvasInitPromise = null;
  resetCanvasTaskQueues();
  pendingCanvasWorkbenchCleanupById.clear();
  pendingCanvasWorkbenchRestoreSnapshots.clear();
};

export const createCanvasWorkbenchService = ({
  getState,
  setState,
}: CanvasWorkbenchServiceStoreApi): CanvasWorkbenchService => {
  const resolveCommandTarget = (workbenchId: string) =>
    getState().workbenches.find((workbench) => workbench.id === workbenchId) ?? null;

  const resolveCommitFailureStatus = (
    epoch: number,
    fallback: Extract<CanvasCommitStatus, "delete_failed" | "persist_failed">
  ): Exclude<CanvasCommitStatus, "committed" | "noop" | "missing_target"> =>
    epoch !== canvasResetEpoch ? "epoch_invalidated" : fallback;

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

  const persistCommittedWorkbench = async (workbench: CanvasWorkbench, epoch: number) =>
    persistCanvasWorkbenchSnapshot(workbench, epoch);

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
      if (epoch !== canvasResetEpoch) {
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
    if (!(await persistCanvasWorkbenchSnapshot(workbench, epoch))) {
      return createCommitFailureOutcome(resolveCommitFailureStatus(epoch, "persist_failed"));
    }

    let didCommit = false;
    setState((state) => {
      if (epoch !== canvasResetEpoch) {
        return state;
      }

      didCommit = true;
      return commitCreatedWorkbenchToState(state, workbench, options);
    });

    if (didCommit) {
      return { status: "committed", value: workbench };
    }

    const rolledBack = await deleteCanvasWorkbench(workbench.id);
    if (!rolledBack && canQueueCompensation(epoch, workbench.ownerRef.userId)) {
      pendingCanvasWorkbenchCleanupById.set(workbench.id, workbench.ownerRef.userId);
    }
    return createCommitFailureOutcome(rolledBack ? "epoch_invalidated" : "persist_failed");
  };

  const commitDeletedWorkbenchToStore = async (
    workbenchId: string,
    epoch: number,
    options?: DeleteWorkbenchOptions
  ): Promise<CanvasCommitOutcome<true>> => {
    if (epoch !== canvasResetEpoch) {
      return createCommitFailureOutcome("epoch_invalidated");
    }

    const existingWorkbench = resolveCommandTarget(workbenchId);
    if (!existingWorkbench) {
      return createCommitFailureOutcome("missing_target");
    }

    if (!(await deleteCanvasWorkbench(workbenchId))) {
      return createCommitFailureOutcome(resolveCommitFailureStatus(epoch, "delete_failed"));
    }

    let didCommit = false;
    setState((state) => {
      if (epoch !== canvasResetEpoch) {
        return state;
      }

      didCommit = true;
      return commitDeletedWorkbenchToState(state, workbenchId, options);
    });

    if (didCommit) {
      return { status: "committed", value: true };
    }

    const existingSnapshot = getCanvasWorkbenchSnapshot(existingWorkbench);
    const restored = await saveCanvasWorkbench(existingSnapshot);
    if (!restored) {
      if (canQueueCompensation(epoch, existingSnapshot.ownerRef.userId)) {
        pendingCanvasWorkbenchRestoreSnapshots.set(existingSnapshot.id, existingSnapshot);
      }
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

  const executeWorkbenchCommand = async (
    workbenchId: string,
    command: CanvasCommand,
    options?: ExecuteCommandOptions
  ) =>
    enqueueWorkbenchMutation(
      workbenchId,
      async (existing, epoch) => {
        const outcome = await executeCommandAgainstWorkbench(
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
      if (canvasInitPromise) {
        return canvasInitPromise;
      }

      const epoch = getCanvasResetEpoch();
      canvasInitPromise = enqueueLifecycleTask(epoch, undefined, async () => {
        setState({ isLoading: true });
        try {
          const loadedWorkbenches = await loadCanvasWorkbenchesForCurrentUser();
          if (epoch !== canvasResetEpoch) {
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
                : persistCanvasWorkbenchSnapshot(entry.document, epoch);
            })
          );

          if (epoch !== canvasResetEpoch) {
            return;
          }

          setState((state) =>
            epoch !== canvasResetEpoch
              ? state
              : {
                  workbenches,
                  activeWorkbenchId: workbenches[0]?.id ?? null,
                  isLoading: false,
                }
          );
        } catch (error) {
          if (epoch === canvasResetEpoch) {
            setState({ isLoading: false });
          }
          console.warn("Canvas store initialization failed.", error);
        }
      }).finally(() => {
        canvasInitPromise = null;
      });

      return canvasInitPromise;
    },
    createWorkbench: async (name, options) => {
      const epoch = getCanvasResetEpoch();
      return enqueueLifecycleTask(epoch, null, async () => {
        const workbench = makeDefaultWorkbench(name);
        const outcome = await commitCreatedWorkbenchToStore(workbench, epoch, options);
        return outcome.status === "committed" ? outcome.value : null;
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
      return enqueueLifecycleTask(epoch, false, async () => {
        const outcome = await commitDeletedWorkbenchToStore(id, epoch, options);
        return outcome.status === "committed";
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
            await executeCommandAgainstWorkbench(
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

          await executeCommandAgainstWorkbench(
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

          const outcome = await executeCommandAgainstWorkbench(
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

          const outcome = await executeCommandAgainstWorkbench(
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
          const outcome = await executeCommandAgainstWorkbench(
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

          const descriptor = createHistoryTransitionDescriptor(
            workbenchId,
            activeWorkbench,
            "undo",
            previous,
            history
          );
          const outcome = await commitDescriptorToStore(descriptor, epoch, []);
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

          const descriptor = createHistoryTransitionDescriptor(
            workbenchId,
            activeWorkbench,
            "redo",
            nextEntry,
            history
          );
          const outcome = await commitDescriptorToStore(descriptor, epoch, []);
          return outcome.status === "committed";
        },
        false
      );
    },
  };

  return service;
};
