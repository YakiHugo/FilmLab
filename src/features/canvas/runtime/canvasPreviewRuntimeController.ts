import {
  renderCanvasImageElementToCanvas,
  type BoardPreviewPriority,
} from "@/features/canvas/boardImageRendering";
import type { StoreApi } from "zustand/vanilla";
import {
  BOARD_PREVIEW_PRIORITY_ORDER,
  BOARD_PREVIEW_SETTLE_DELAY_MS,
  BOARD_PREVIEW_SLOT_COUNT,
  createEmptyPreviewEntry,
  createInitialCanvasRuntimeState,
  isEffectivelyVisible,
  releasePreviewSource,
  resolveCanvasRuntimeDisposePlan,
  resolvePreviewTaskInput,
  selectCanvasPreviewIdsForPrune,
  shouldRetainBoardPreview,
  type CanvasRuntimeScopeInput,
  type CanvasRuntimeState,
  type ResolvedPreviewTaskInput,
} from "./canvasPreviewRuntimeState";

interface PreviewTask extends ResolvedPreviewTaskInput {
  enqueuedAt: number;
  requestId: number;
}

interface CanvasPreviewRuntimeControllerOptions {
  getInput: () => CanvasRuntimeScopeInput;
  store: StoreApi<CanvasRuntimeState>;
}

export interface CanvasPreviewRuntimeController {
  dispose: () => void;
  refreshPreviewsForChangedAssets: (changedAssetIds: Iterable<string>) => void;
  invalidateBoardPreview: (elementId: string) => void;
  releaseBoardPreview: (elementId: string) => void;
  requestBoardPreview: (elementId: string, priority: BoardPreviewPriority) => void;
  reset: () => void;
}

export const createCanvasPreviewRuntimeController = ({
  getInput,
  store,
}: CanvasPreviewRuntimeControllerOptions): CanvasPreviewRuntimeController => {
  const queuedTasksByElementId = new Map<string, PreviewTask>();
  const settledPreviewTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const activeRenderRequests = new Map<
    string,
    {
      controller: AbortController;
      requestId: number;
      slotId: string;
    }
  >();
  const activePreviewSubscriptionDependencyAssetIdsByElementId = new Map<
    string,
    string[]
  >();
  const activePreviewSubscriptionElementIdsByDependencyAssetId = new Map<
    string,
    Set<string>
  >();
  const slotBusy = Array.from({ length: BOARD_PREVIEW_SLOT_COUNT }, () => false);
  let nextPreviewRequestId = 0;
  let disposed = false;

  const setRuntimeState = (
    update:
      | Partial<CanvasRuntimeState>
      | ((state: CanvasRuntimeState) => Partial<CanvasRuntimeState> | CanvasRuntimeState)
  ) => {
    if (disposed) {
      return;
    }
    store.setState(update);
  };

  const clearSettledPreviewTimer = (elementId: string) => {
    const timer = settledPreviewTimers.get(elementId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    settledPreviewTimers.delete(elementId);
  };

  const cancelPreviewWork = (elementId: string) => {
    clearSettledPreviewTimer(elementId);
    queuedTasksByElementId.delete(elementId);

    const activeRequest = activeRenderRequests.get(elementId);
    if (!activeRequest) {
      return;
    }

    activeRequest.controller.abort();
    activeRenderRequests.delete(elementId);
  };

  const clearPreviewDependencies = (elementId: string) => {
    const dependencyAssetIds =
      activePreviewSubscriptionDependencyAssetIdsByElementId.get(elementId);
    if (!dependencyAssetIds) {
      return;
    }

    activePreviewSubscriptionDependencyAssetIdsByElementId.delete(elementId);
    for (const assetId of dependencyAssetIds) {
      const elementIds =
        activePreviewSubscriptionElementIdsByDependencyAssetId.get(assetId);
      if (!elementIds) {
        continue;
      }
      elementIds.delete(elementId);
      if (elementIds.size === 0) {
        activePreviewSubscriptionElementIdsByDependencyAssetId.delete(assetId);
      }
    }
  };

  const syncPreviewDependencies = (
    elementId: string,
    dependencyAssetIds: string[]
  ) => {
    const previousDependencyAssetIds =
      activePreviewSubscriptionDependencyAssetIdsByElementId.get(elementId);
    if (
      previousDependencyAssetIds &&
      previousDependencyAssetIds.length === dependencyAssetIds.length &&
      previousDependencyAssetIds.every((assetId, index) => assetId === dependencyAssetIds[index])
    ) {
      return;
    }

    clearPreviewDependencies(elementId);
    activePreviewSubscriptionDependencyAssetIdsByElementId.set(
      elementId,
      dependencyAssetIds
    );
    for (const assetId of dependencyAssetIds) {
      const elementIds =
        activePreviewSubscriptionElementIdsByDependencyAssetId.get(assetId) ??
        new Set<string>();
      elementIds.add(elementId);
      activePreviewSubscriptionElementIdsByDependencyAssetId.set(assetId, elementIds);
    }
  };

  const pruneCanvasPreviewCache = () => {
    const removingIds = new Set(
      selectCanvasPreviewIdsForPrune(store.getState().previewEntries)
    );
    if (removingIds.size === 0) {
      return;
    }

    // Cache eviction does not unregister mounted preview subscribers.
    // `releaseBoardPreview()` is the lifecycle boundary that drops subscriptions.
    setRuntimeState((state) => {
      const nextPreviewEntries = { ...state.previewEntries };
      for (const elementId of removingIds) {
        const entry = nextPreviewEntries[elementId];
        if (!entry) {
          continue;
        }
        releasePreviewSource(entry.previewSource);
        delete nextPreviewEntries[elementId];
      }
      return {
        previewEntries: nextPreviewEntries,
      };
    });
  };

  const getNextQueuedTask = () => {
    let nextTask: PreviewTask | null = null;
    for (const task of queuedTasksByElementId.values()) {
      if (!nextTask) {
        nextTask = task;
        continue;
      }

      const priorityDelta =
        BOARD_PREVIEW_PRIORITY_ORDER[task.priority] -
        BOARD_PREVIEW_PRIORITY_ORDER[nextTask.priority];
      if (priorityDelta < 0) {
        nextTask = task;
        continue;
      }
      if (priorityDelta === 0 && task.enqueuedAt < nextTask.enqueuedAt) {
        nextTask = task;
      }
    }
    return nextTask;
  };

  const pumpPreviewQueue = () => {
    if (disposed) {
      return;
    }

    for (let slotIndex = 0; slotIndex < slotBusy.length; slotIndex += 1) {
      if (slotBusy[slotIndex]) {
        continue;
      }

      const task = getNextQueuedTask();
      if (!task) {
        return;
      }

      queuedTasksByElementId.delete(task.element.id);
      slotBusy[slotIndex] = true;
      const slotId = `board-preview:slot-${slotIndex}`;
      const controller = new AbortController();
      activeRenderRequests.set(task.element.id, {
        controller,
        requestId: task.requestId,
        slotId,
      });

      setRuntimeState((state) => ({
        previewEntries: {
          ...state.previewEntries,
          [task.element.id]: {
            ...(state.previewEntries[task.element.id] ?? createEmptyPreviewEntry()),
            errorMessage: null,
            lastRequestedAt: Date.now(),
            previewCacheKey: task.cacheKey,
            renderStatus: "rendering",
            retained: shouldRetainBoardPreview(task.priority),
          },
        },
      }));

      const renderCanvas = document.createElement("canvas");
      void renderCanvasImageElementToCanvas({
        asset: task.asset,
        canvas: renderCanvas,
        draftRenderState: task.draftRenderState,
        element: task.element,
        intent:
          task.priority === "interactive" ? "preview-interactive" : "preview-full",
        priority: task.priority,
        viewportScale: task.viewportScale,
        renderSlotPrefix: slotId,
        signal: controller.signal,
      })
        .then((renderContext) => {
          if (disposed) {
            releasePreviewSource(renderCanvas);
            return;
          }

          const activeRequest = activeRenderRequests.get(task.element.id);
          if (!activeRequest || activeRequest.requestId !== task.requestId) {
            releasePreviewSource(renderCanvas);
            return;
          }

          setRuntimeState((state) => {
            const previousEntry =
              state.previewEntries[task.element.id] ?? createEmptyPreviewEntry();
            if (
              previousEntry.previewSource &&
              previousEntry.previewSource !== renderCanvas
            ) {
              releasePreviewSource(previousEntry.previewSource);
            }
            return {
              previewEntries: {
                ...state.previewEntries,
                [task.element.id]: {
                  ...previousEntry,
                  errorMessage: null,
                  lastRequestedAt: Date.now(),
                  previewCacheKey: renderContext.cacheKey,
                  previewSource: renderCanvas,
                  previewVersion: previousEntry.previewVersion + 1,
                  renderStatus: "ready",
                  retained: shouldRetainBoardPreview(task.priority),
                },
              },
            };
          });
        })
        .catch((error) => {
          if (controller.signal.aborted) {
            releasePreviewSource(renderCanvas);
            return;
          }

          if (disposed) {
            releasePreviewSource(renderCanvas);
            return;
          }

          setRuntimeState((state) => ({
            previewEntries: {
              ...state.previewEntries,
              [task.element.id]: {
                ...(state.previewEntries[task.element.id] ?? createEmptyPreviewEntry()),
                errorMessage:
                  error instanceof Error
                    ? error.message
                    : "Failed to render board preview.",
                lastRequestedAt: Date.now(),
                previewCacheKey: task.cacheKey,
                renderStatus: "error",
                retained: shouldRetainBoardPreview(task.priority),
              },
            },
          }));
          releasePreviewSource(renderCanvas);
        })
        .finally(() => {
          const activeRequest = activeRenderRequests.get(task.element.id);
          if (activeRequest?.requestId === task.requestId) {
            activeRenderRequests.delete(task.element.id);
          }
          slotBusy[slotIndex] = false;
          pruneCanvasPreviewCache();
          pumpPreviewQueue();
        });
    }
  };

  const queueBoardPreviewRequest = (
    elementId: string,
    priority: BoardPreviewPriority
  ) => {
    if (disposed) {
      return;
    }

    const taskInput = resolvePreviewTaskInput({
      draftRenderStateByElementId: store.getState().draftRenderStateByElementId,
      elementId,
      input: getInput(),
      priority,
    });
    if (!taskInput || !isEffectivelyVisible(taskInput.element)) {
      controllerApi.releaseBoardPreview(elementId);
      return;
    }

    const nextRequestId = nextPreviewRequestId + 1;
    nextPreviewRequestId = nextRequestId;
    const previousEntry =
      store.getState().previewEntries[elementId] ?? createEmptyPreviewEntry();
    const isCached = previousEntry.previewCacheKey === taskInput.cacheKey;
    const activeRequest = activeRenderRequests.get(elementId);
    const queuedTask = queuedTasksByElementId.get(elementId);
    syncPreviewDependencies(elementId, taskInput.dependencyAssetIds);

    if (
      isCached &&
      (previousEntry.renderStatus === "ready" ||
        previousEntry.renderStatus === "queued" ||
        previousEntry.renderStatus === "rendering") &&
      (!queuedTask || queuedTask.cacheKey === taskInput.cacheKey) &&
      (!activeRequest || activeRequest.requestId <= nextRequestId)
    ) {
      setRuntimeState((state) => ({
        previewEntries: {
          ...state.previewEntries,
          [elementId]: {
            ...(state.previewEntries[elementId] ?? createEmptyPreviewEntry()),
            lastRequestedAt: Date.now(),
            retained: shouldRetainBoardPreview(priority),
          },
        },
      }));
      return;
    }

    cancelPreviewWork(elementId);
    queuedTasksByElementId.set(elementId, {
      ...taskInput,
      enqueuedAt: Date.now(),
      requestId: nextRequestId,
    });
    setRuntimeState((state) => ({
      previewEntries: {
        ...state.previewEntries,
        [elementId]: {
          ...(state.previewEntries[elementId] ?? createEmptyPreviewEntry()),
          errorMessage: null,
          lastRequestedAt: Date.now(),
          previewCacheKey: taskInput.cacheKey,
          renderStatus: "queued",
          retained: shouldRetainBoardPreview(priority),
        },
      },
    }));
    pumpPreviewQueue();
  };

  const scheduleSettledBoardPreview = (elementId: string) => {
    clearSettledPreviewTimer(elementId);
    const timer = setTimeout(() => {
      settledPreviewTimers.delete(elementId);
      queueBoardPreviewRequest(elementId, "background");
    }, BOARD_PREVIEW_SETTLE_DELAY_MS);
    settledPreviewTimers.set(elementId, timer);
  };

  const reset = () => {
    for (const elementId of settledPreviewTimers.keys()) {
      clearSettledPreviewTimer(elementId);
    }
    queuedTasksByElementId.clear();
    for (const [elementId, request] of activeRenderRequests.entries()) {
      request.controller.abort();
      activeRenderRequests.delete(elementId);
    }
    for (let slotIndex = 0; slotIndex < slotBusy.length; slotIndex += 1) {
      slotBusy[slotIndex] = false;
    }
    activePreviewSubscriptionDependencyAssetIdsByElementId.clear();
    activePreviewSubscriptionElementIdsByDependencyAssetId.clear();

    const disposePlan = resolveCanvasRuntimeDisposePlan(store.getState());
    for (const previewSource of disposePlan.previewSources) {
      releasePreviewSource(previewSource);
    }

    store.setState(createInitialCanvasRuntimeState());
  };

  const controllerApi: CanvasPreviewRuntimeController = {
    dispose: () => {
      if (disposed) {
        return;
      }
      reset();
      disposed = true;
    },
    refreshPreviewsForChangedAssets: (changedAssetIds) => {
      if (disposed) {
        return;
      }

      const impactedElementIds = new Set<string>();
      for (const assetId of changedAssetIds) {
        const elementIds =
          activePreviewSubscriptionElementIdsByDependencyAssetId.get(assetId);
        if (!elementIds) {
          continue;
        }
        for (const elementId of elementIds) {
          impactedElementIds.add(elementId);
        }
      }

      if (impactedElementIds.size === 0) {
        return;
      }

      const runtimeState = store.getState();
      for (const elementId of impactedElementIds) {
        const queuedTask = queuedTasksByElementId.get(elementId);
        const priority =
          queuedTask?.priority ??
          (runtimeState.previewEntries[elementId]?.retained ? "interactive" : "background");
        queueBoardPreviewRequest(elementId, priority);
      }
    },
    invalidateBoardPreview: (elementId) => {
      if (disposed) {
        return;
      }

      cancelPreviewWork(elementId);
      setRuntimeState((state) => {
        const entry = state.previewEntries[elementId];
        if (!entry) {
          return state;
        }
        return {
          previewEntries: {
            ...state.previewEntries,
            [elementId]: {
              ...entry,
              errorMessage: null,
              previewCacheKey: null,
              renderStatus: entry.previewSource ? "ready" : "idle",
            },
          },
        };
      });
      pumpPreviewQueue();
    },
    releaseBoardPreview: (elementId) => {
      if (disposed) {
        return;
      }

      cancelPreviewWork(elementId);
      clearPreviewDependencies(elementId);
      setRuntimeState((state) => {
        const entry = state.previewEntries[elementId];
        if (!entry) {
          return state;
        }
        return {
          previewEntries: {
            ...state.previewEntries,
            [elementId]: {
              ...entry,
              lastRequestedAt: Date.now(),
              renderStatus: entry.previewSource ? "ready" : "idle",
              retained: false,
            },
          },
        };
      });
      pruneCanvasPreviewCache();
      pumpPreviewQueue();
    },
    requestBoardPreview: (elementId, priority) => {
      if (disposed) {
        return;
      }

      queueBoardPreviewRequest(elementId, priority);
      if (priority === "interactive") {
        scheduleSettledBoardPreview(elementId);
        return;
      }
      clearSettledPreviewTimer(elementId);
    },
    reset,
  };

  return controllerApi;
};
