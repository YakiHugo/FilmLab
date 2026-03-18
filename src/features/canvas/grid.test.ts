import { describe, expect, it } from "vitest";
import { getVisibleWorldGridBounds, GRID_SIZE, snap, snapPoint, snapRect, snapSize } from "./grid";

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

  it("computes visible world bounds from viewport pan and zoom while staying aligned to the world origin", () => {
    expect(
      getVisibleWorldGridBounds(
        { x: 0, y: 0 },
        1,
        { width: 320, height: 240 },
        { width: 1080, height: 1350 }
      )
    ).toMatchObject({
      startX: 0,
      endX: 336,
      startY: 0,
      endY: 256,
    });

    expect(
      getVisibleWorldGridBounds(
        { x: -40, y: -24 },
        2,
        { width: 320, height: 240 },
        { width: 1080, height: 1350 }
      )
    ).toMatchObject({
      startX: 0,
      endX: 208,
      startY: 0,
      endY: 160,
    });

    expect(
      getVisibleWorldGridBounds(
        { x: 24, y: 48 },
        0.5,
        { width: 320, height: 240 },
        { width: 1080, height: 1350 }
      )
    ).toMatchObject({
      startX: 0,
      endX: 608,
      startY: 0,
      endY: 400,
    });
  });
});
