export interface TextMutationQueue {
  enqueue<T>(task: () => Promise<T> | T): Promise<T>;
}

export const createTextMutationQueue = (): TextMutationQueue => {
  let tail = Promise.resolve();

  return {
    enqueue<T>(task: () => Promise<T> | T): Promise<T> {
      const next = tail.then(task, task);
      tail = next.then(
        () => undefined,
        () => undefined
      );
      return next;
    },
  };
};
