import { describe, expect, it } from "vitest";
import {
  cloneLocalAdjustment,
  createDefaultLocalMask,
  createLocalAdjustment,
  insertLocalAdjustmentAfter,
  moveLocalAdjustmentByDirection,
  removeLocalAdjustmentById,
  resolveSelectedLocalAdjustment,
  updateLocalAdjustmentDelta,
} from "./localAdjustments";

describe("localAdjustments helpers", () => {
  it("creates default masks for each local adjustment mode", () => {
    expect(createDefaultLocalMask("radial")).toMatchObject({
      mode: "radial",
      centerX: 0.5,
      centerY: 0.5,
    });
    expect(createDefaultLocalMask("linear")).toMatchObject({
      mode: "linear",
      startY: 0.2,
      endY: 0.8,
    });
    expect(createDefaultLocalMask("brush")).toMatchObject({
      mode: "brush",
      points: [],
      brushSize: 0.08,
    });
  });

  it("duplicates, inserts, reorders, and removes local adjustments", () => {
    const first = createLocalAdjustment("radial");
    const second = cloneLocalAdjustment(first);
    const inserted = insertLocalAdjustmentAfter([first], first.id, second);

    expect(inserted.map((item) => item.id)).toEqual([first.id, second.id]);

    const moved = moveLocalAdjustmentByDirection(inserted, second.id, "up");
    expect(moved.map((item) => item.id)).toEqual([second.id, first.id]);

    const removed = removeLocalAdjustmentById(moved, second.id);
    expect(removed.map((item) => item.id)).toEqual([first.id]);
  });

  it("updates local deltas and resolves the active selection", () => {
    const first = createLocalAdjustment("brush");
    const second = createLocalAdjustment("linear");
    const updated = updateLocalAdjustmentDelta([first, second], second.id, {
      exposure: 24,
      saturation: -12,
    });

    expect(updated[1]?.adjustments).toMatchObject({
      exposure: 24,
      saturation: -12,
    });
    expect(resolveSelectedLocalAdjustment(updated, second.id)?.id).toBe(second.id);
    expect(resolveSelectedLocalAdjustment(updated, "missing")?.id).toBe(first.id);
  });
});
