let canvasResetEpoch = 0;
let canvasInitPromise: Promise<void> | null = null;
let mutationQueueTail: Promise<void> = Promise.resolve();
let canvasMutationVersion = 0;

const settleQueueTail = (tail?: Promise<unknown>): Promise<void> =>
  (tail ?? Promise.resolve()).then(
    () => undefined,
    () => undefined
  );

export const getCanvasResetEpoch = () => canvasResetEpoch;

export const getCanvasInitPromise = () => canvasInitPromise;

export const getCanvasMutationVersion = () => canvasMutationVersion;

export const setCanvasInitPromise = (promise: Promise<void> | null) => {
  canvasInitPromise = promise;
};

export const waitForCanvasMutationQueueIdle = () => settleQueueTail(mutationQueueTail);

export const enqueueCanvasMutationTask = <T>(task: () => Promise<T>): Promise<T> => {
  canvasMutationVersion += 1;
  const queued = settleQueueTail(mutationQueueTail).then(async () => task());
  mutationQueueTail = settleQueueTail(queued);
  return queued;
};

export const resetCanvasWorkbenchTaskCoordinator = () => {
  canvasResetEpoch += 1;
  canvasInitPromise = null;
  canvasMutationVersion = 0;
  mutationQueueTail = Promise.resolve();
};
