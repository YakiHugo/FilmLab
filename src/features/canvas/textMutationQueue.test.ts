import { describe, expect, it } from "vitest";
import { createTextMutationQueue } from "./textMutationQueue";

describe("text mutation queue", () => {
  it("runs text writes sequentially", async () => {
    const queue = createTextMutationQueue();
    const order: string[] = [];
    let releaseFirst: (() => void) | null = null;

    const first = queue.enqueue(
      () =>
        new Promise<void>((resolve) => {
          order.push("first:start");
          releaseFirst = () => {
            order.push("first:end");
            resolve();
          };
        })
    );

    const second = queue.enqueue(async () => {
      order.push("second");
    });

    await Promise.resolve();
    expect(order).toEqual(["first:start"]);
    const release = releaseFirst;
    if (!release) {
      throw new Error("expected the first task to expose a release function");
    }
    const releaseNow: () => void = release;
    releaseNow();

    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("keeps processing after a rejected task", async () => {
    const queue = createTextMutationQueue();
    const order: string[] = [];

    await expect(
      queue.enqueue(async () => {
        order.push("first");
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    await expect(
      queue.enqueue(async () => {
        order.push("second");
      })
    ).resolves.toBeUndefined();

    expect(order).toEqual(["first", "second"]);
  });
});
