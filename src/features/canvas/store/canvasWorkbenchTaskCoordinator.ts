let canvasResetEpoch = 0;
let canvasInitPromise: Promise<void> | null = null;
let lifecycleQueueTail: Promise<void> = Promise.resolve();
const workbenchQueueTails = new Map<string, Promise<void>>();

const settleQueueTail = (tail?: Promise<unknown>): Promise<void> =>
  (tail ?? Promise.resolve()).then(
    () => undefined,
    () => undefined
  );

const waitForWorkbenchQueue = (workbenchId: string) =>
  settleQueueTail(workbenchQueueTails.get(workbenchId));

export const getCanvasResetEpoch = () => canvasResetEpoch;

export const getCanvasInitPromise = () => canvasInitPromise;

export const setCanvasInitPromise = (promise: Promise<void> | null) => {
  canvasInitPromise = promise;
};

export const enqueueWorkbenchTask = <T>(workbenchId: string, task: () => Promise<T>): Promise<T> => {
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

export const enqueueLifecycleTask = <T>({
  beforeTask,
  epoch,
  onInvalidated,
  task,
}: {
  beforeTask?: () => Promise<void>;
  epoch: number;
  onInvalidated: T;
  task: () => Promise<T>;
}): Promise<T> => {
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
    await beforeTask?.();
    if (epoch !== canvasResetEpoch) {
      return onInvalidated;
    }
    return task();
  });
  lifecycleQueueTail = settleQueueTail(queued);
  return queued;
};

export const resetCanvasWorkbenchTaskCoordinator = () => {
  canvasResetEpoch += 1;
  canvasInitPromise = null;
  lifecycleQueueTail = Promise.resolve();
  workbenchQueueTails.clear();
};
