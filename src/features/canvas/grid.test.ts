import { describe, expect, it } from "vitest";
import {
  getVisibleWorldGridBounds,
  GRID_OVERSCAN_SCREEN_PX,
  GRID_SIZE,
  quantizeDragPosition,
  snap,
  snapPoint,
  snapRect,
  snapSize,
} from "./grid";

describe("canvas grid utilities", () => {
  it("snaps scalar values to the nearest 16px world grid, including negatives", () => {
    expect(snap(7)).toBe(0);
    expect(snap(9)).toBe(GRID_SIZE);
    expect(snap(23.2)).toBe(16);
    expect(snap(-9)).toBe(-16);
  });

  it("snaps points, sizes, and rects consistently", () => {
    expect(snapPoint({ x: 17, y: 31 })).toEqual({ x: 16, y: 32 });
    expect(snapSize({ width: 47, height: 65 })).toEqual({ width: 48, height: 64 });
    expect(
      snapRect({
        x: 30,
        y: -17,
        width: 23,
        height: 40,
      })
    ).toEqual({
      x: 32,
      y: -16,
      width: 16,
      height: 48,
    });
  });

  it("quantizes drag positions to the nearest grid point across positive and negative coordinates", () => {
    expect(quantizeDragPosition({ x: 17, y: 31 })).toEqual({ x: 16, y: 32 });
    expect(quantizeDragPosition({ x: -9, y: -23 })).toEqual({ x: -16, y: -16 });
  });

  it("computes visible world bounds from viewport pan and zoom with workspace overscan", () => {
    expect(
      getVisibleWorldGridBounds({ x: 0, y: 0 }, 1, { width: 320, height: 240 })
    ).toMatchObject({
      x: -GRID_OVERSCAN_SCREEN_PX,
      startX: -GRID_OVERSCAN_SCREEN_PX,
      endX: 320 + GRID_OVERSCAN_SCREEN_PX,
      y: -GRID_OVERSCAN_SCREEN_PX,
      startY: -GRID_OVERSCAN_SCREEN_PX,
      endY: 240 + GRID_OVERSCAN_SCREEN_PX,
    });

    expect(
      getVisibleWorldGridBounds({ x: -40, y: -24 }, 2, { width: 320, height: 240 })
    ).toMatchObject({
      startX: -112,
      endX: 320,
      startY: -128,
      endY: 272,
    });

    expect(
      getVisibleWorldGridBounds({ x: 24, y: 48 }, 0.5, { width: 320, height: 240 })
    ).toMatchObject({
      startX: -560,
      endX: 1104,
      startY: -608,
      endY: 896,
    });
  });
});
