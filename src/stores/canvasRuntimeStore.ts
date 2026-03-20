import { create } from "zustand";
import { createCanvasImageRenderContext, renderCanvasImageElementToCanvas, type BoardPreviewPriority } from "@/features/canvas/boardImageRendering";
import { selectionIdsEqual } from "@/features/canvas/selectionModel";
import type { Asset, CanvasImageElement, EditingAdjustments } from "@/types";
import { useAssetStore } from "./assetStore";
import { useCanvasStore } from "./canvasStore";

export type CanvasPreviewRenderStatus = "idle" | "queued" | "rendering" | "ready" | "error";

export interface CanvasPreviewEntry {
  errorMessage: string | null;
  lastRequestedAt: number;
  previewCacheKey: string | null;
  previewSource: HTMLCanvasElement | null;
  previewVersion: number;
  renderStatus: CanvasPreviewRenderStatus;
  retained: boolean;
}

interface CanvasRuntimeState {
  draftAdjustmentsByElementId: Record<string, EditingAdjustments | undefined>;
  previewEntries: Record<string, CanvasPreviewEntry | undefined>;
  selectionPreviewElementIds: string[] | null;
  clearElementDraftAdjustments: (elementId: string) => void;
  clearSelectionPreview: () => void;
  invalidateBoardPreview: (elementId: string, reason?: string) => void;
  releaseBoardPreview: (elementId: string) => void;
  requestBoardPreview: (elementId: string, priority: BoardPreviewPriority) => Promise<void>;
  setElementDraftAdjustments: (elementId: string, adjustments: EditingAdjustments | undefined) => void;
  setSelectionPreviewElementIds: (ids: string[] | null) => void;
}

interface ResolvedPreviewTaskInput {
  asset: Asset;
  assetById: Map<string, Asset>;
  cacheKey: string;
  draftAdjustments: EditingAdjustments | undefined;
  element: CanvasImageElement;
  priority: BoardPreviewPriority;
  viewportScale: number;
}

interface PreviewTask extends ResolvedPreviewTaskInput {
  enqueuedAt: number;
  requestId: number;
}

const BOARD_PREVIEW_SLOT_COUNT = 3;
const MAX_CACHED_BOARD_PREVIEWS = 24;
const BOARD_PREVIEW_SETTLE_DELAY_MS = 140;
const BOARD_PREVIEW_PRIORITY_ORDER: Record<BoardPreviewPriority, number> = {
  interactive: 0,
  background: 1,
};

const shouldRetainBoardPreview = (priority: BoardPreviewPriority) => priority === "interactive";

const createEmptyPreviewEntry = (): CanvasPreviewEntry => ({
  errorMessage: null,
  lastRequestedAt: 0,
  previewCacheKey: null,
  previewSource: null,
  previewVersion: 0,
  renderStatus: "idle",
  retained: false,
});

const releasePreviewSource = (source: HTMLCanvasElement | null) => {
  if (!source) {
    return;
  }
  source.width = 0;
  source.height = 0;
};

const isEffectivelyVisible = (
  element: CanvasImageElement & Partial<{ effectiveVisible: boolean }>
) => element.effectiveVisible ?? element.visible;

const findCanvasImageElement = (elementId: string) => {
  const { documents } = useCanvasStore.getState();
  for (const document of documents) {
    const element = document.elements.find((candidate) => candidate.id === elementId);
    if (element?.type === "image") {
      return element;
    }
  }
  return null;
};

const resolvePreviewTaskInput = (
  elementId: string,
  priority: BoardPreviewPriority
): ResolvedPreviewTaskInput | null => {
  const element = findCanvasImageElement(elementId);
  if (!element) {
    return null;
  }

  const runtimeState = useCanvasRuntimeStore.getState();
  const assets = useAssetStore.getState().assets;
  const asset = assets.find((candidate) => candidate.id === element.assetId);
  if (!asset) {
    return null;
  }

  const draftAdjustments = runtimeState.draftAdjustmentsByElementId[elementId];
  const viewportScale = useCanvasStore.getState().zoom;
  const assetById = new Map(assets.map((candidate) => [candidate.id, candidate]));
  const renderContext = createCanvasImageRenderContext({
    asset,
    assetById,
    draftAdjustments,
    element,
    priority,
    viewportScale,
  });

  return {
    asset,
    assetById,
    cacheKey: renderContext.cacheKey,
    draftAdjustments,
    element,
    priority,
    viewportScale,
  };
};

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
const slotBusy = Array.from({ length: BOARD_PREVIEW_SLOT_COUNT }, () => false);
let nextPreviewRequestId = 0;

const clearSettledPreviewTimer = (elementId: string) => {
  const timer = settledPreviewTimers.get(elementId);
  if (!timer) {
    return;
  }
  clearTimeout(timer);
  settledPreviewTimers.delete(elementId);
};

const pruneCanvasPreviewCache = () => {
  const { previewEntries } = useCanvasRuntimeStore.getState();
  const removableEntries = Object.entries(previewEntries)
    .filter(([, entry]) => entry && !entry.retained)
    .sort((left, right) => {
      const leftValue = left[1]?.lastRequestedAt ?? 0;
      const rightValue = right[1]?.lastRequestedAt ?? 0;
      return leftValue - rightValue;
    });

  const overflow = removableEntries.length - MAX_CACHED_BOARD_PREVIEWS;
  if (overflow <= 0) {
    return;
  }

  const removingIds = new Set(removableEntries.slice(0, overflow).map(([elementId]) => elementId));
  useCanvasRuntimeStore.setState((state) => {
    const nextPreviewEntries = { ...state.previewEntries };
    for (const elementId of removingIds) {
      const entry = nextPreviewEntries[elementId];
      if (entry?.renderStatus === "rendering" || entry?.renderStatus === "queued") {
        continue;
      }
      releasePreviewSource(entry?.previewSource ?? null);
      delete nextPreviewEntries[elementId];
    }
    return {
      previewEntries: nextPreviewEntries,
    };
  });
};

const cancelPreviewWork = (elementId: string) => {
  clearSettledPreviewTimer(elementId);
  const queuedTask = queuedTasksByElementId.get(elementId);
  if (queuedTask) {
    queuedTasksByElementId.delete(elementId);
  }

  const activeRequest = activeRenderRequests.get(elementId);
  if (!activeRequest) {
    return;
  }
  activeRequest.controller.abort();
  activeRenderRequests.delete(elementId);
};

const queueBoardPreviewRequest = (
  elementId: string,
  priority: BoardPreviewPriority
) => {
  const taskInput = resolvePreviewTaskInput(elementId, priority);
  if (!taskInput || !isEffectivelyVisible(taskInput.element)) {
    useCanvasRuntimeStore.getState().releaseBoardPreview(elementId);
    return;
  }

  const runtimeState = useCanvasRuntimeStore.getState();
  const nextRequestId = nextPreviewRequestId + 1;
  nextPreviewRequestId = nextRequestId;
  const previousEntry = runtimeState.previewEntries[elementId] ?? createEmptyPreviewEntry();
  const isCached = previousEntry.previewCacheKey === taskInput.cacheKey;
  const activeRequest = activeRenderRequests.get(elementId);
  const queuedTask = queuedTasksByElementId.get(elementId);

  if (
    isCached &&
    (previousEntry.renderStatus === "ready" ||
      previousEntry.renderStatus === "queued" ||
      previousEntry.renderStatus === "rendering") &&
    (!queuedTask || queuedTask.cacheKey === taskInput.cacheKey) &&
    (!activeRequest || activeRequest.requestId <= nextRequestId)
  ) {
    useCanvasRuntimeStore.setState((state) => ({
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
  useCanvasRuntimeStore.setState((state) => ({
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

const getNextQueuedTask = () => {
  const tasks = Array.from(queuedTasksByElementId.values());
  tasks.sort((left, right) => {
    const priorityDelta =
      BOARD_PREVIEW_PRIORITY_ORDER[left.priority] - BOARD_PREVIEW_PRIORITY_ORDER[right.priority];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return left.enqueuedAt - right.enqueuedAt;
  });
  return tasks[0] ?? null;
};

const pumpPreviewQueue = () => {
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

    useCanvasRuntimeStore.setState((state) => ({
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
      assetById: task.assetById,
      canvas: renderCanvas,
      draftAdjustments: task.draftAdjustments,
      element: task.element,
      intent: task.priority === "interactive" ? "preview-interactive" : "preview-full",
      priority: task.priority,
      viewportScale: task.viewportScale,
      renderSlotPrefix: slotId,
      signal: controller.signal,
    })
      .then((renderContext) => {
        const activeRequest = activeRenderRequests.get(task.element.id);
        if (!activeRequest || activeRequest.requestId !== task.requestId) {
          releasePreviewSource(renderCanvas);
          return;
        }

        useCanvasRuntimeStore.setState((state) => {
          const previousEntry = state.previewEntries[task.element.id] ?? createEmptyPreviewEntry();
          if (previousEntry.previewSource && previousEntry.previewSource !== renderCanvas) {
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
        useCanvasRuntimeStore.setState((state) => ({
          previewEntries: {
            ...state.previewEntries,
            [task.element.id]: {
              ...(state.previewEntries[task.element.id] ?? createEmptyPreviewEntry()),
              errorMessage: error instanceof Error ? error.message : "Failed to render board preview.",
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

export const useCanvasRuntimeStore = create<CanvasRuntimeState>((set) => ({
  draftAdjustmentsByElementId: {},
  previewEntries: {},
  selectionPreviewElementIds: null,
  clearElementDraftAdjustments: (elementId) =>
    set((state) => {
      if (!(elementId in state.draftAdjustmentsByElementId)) {
        return state;
      }
      const nextDrafts = { ...state.draftAdjustmentsByElementId };
      delete nextDrafts[elementId];
      return {
        draftAdjustmentsByElementId: nextDrafts,
      };
    }),
  clearSelectionPreview: () =>
    set((state) =>
      state.selectionPreviewElementIds === null
        ? state
        : {
            selectionPreviewElementIds: null,
          }
    ),
  invalidateBoardPreview: (elementId) => {
    cancelPreviewWork(elementId);
    set((state) => {
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
    cancelPreviewWork(elementId);
    set((state) => {
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
  requestBoardPreview: async (elementId, priority) => {
    queueBoardPreviewRequest(elementId, priority);
    if (priority === "interactive") {
      scheduleSettledBoardPreview(elementId);
    } else {
      clearSettledPreviewTimer(elementId);
    }
  },
  setElementDraftAdjustments: (elementId, adjustments) =>
    set((state) => ({
      draftAdjustmentsByElementId: {
        ...state.draftAdjustmentsByElementId,
        [elementId]: adjustments,
      },
    })),
  setSelectionPreviewElementIds: (ids) =>
    set((state) => {
      const nextSelectionPreviewElementIds =
        ids === null ? null : Array.from(new Set(ids));
      return selectionIdsEqual(
        state.selectionPreviewElementIds,
        nextSelectionPreviewElementIds
      )
        ? state
        : {
            selectionPreviewElementIds: nextSelectionPreviewElementIds,
          };
    }),
}));
