import { describe, expect, it } from "vitest";
import type { CanvasDocument } from "@/types";
import { normalizeCanvasDocument } from "./studioPresets";
import { appendCanvasSlice, buildStripSlices, clearCanvasSlices, updateCanvasSlice } from "./slices";

const createDocument = (): CanvasDocument =>
  normalizeCanvasDocument({
    id: "doc-1",
    name: "Test Story",
    width: 1080,
    height: 1350,
    presetId: "social-portrait",
    backgroundColor: "#050505",
    nodes: {},
    rootIds: [],
    slices: [],
    guides: {
      showCenter: false,
      showThirds: true,
      showSafeArea: true,
    },
    safeArea: {
      top: 72,
      right: 72,
      bottom: 72,
      left: 72,
    },
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
  });

describe("canvas slice helpers", () => {
  it("builds strip slices using the active preset dimensions", () => {
    const document = buildStripSlices(createDocument(), 3);

    expect(document.width).toBe(3240);
    expect(document.height).toBe(1350);
    expect(document.slices).toHaveLength(3);
    expect(document.slices.map((slice) => [slice.order, slice.x, slice.width])).toEqual([
      [1, 0, 1080],
      [2, 1080, 1080],
      [3, 2160, 1080],
    ]);
  });

  it("appends a new slice to the end of the strip", () => {
    const base = buildStripSlices(createDocument(), 2);
    const document = appendCanvasSlice(base);

    expect(document.width).toBe(3240);
    expect(document.slices).toHaveLength(3);
    expect(document.slices[2]).toMatchObject({
      order: 3,
      x: 2160,
      width: 1080,
      height: 1350,
    });
  });

  it("clears slices back to the single-preset board size", () => {
    const document = clearCanvasSlices(buildStripSlices(createDocument(), 4));

    expect(document.width).toBe(1080);
    expect(document.height).toBe(1350);
    expect(document.slices).toEqual([]);
  });

  it("updates a selected slice without affecting the rest", () => {
    const document = buildStripSlices(createDocument(), 2);
    const target = document.slices[0]!;

    const updated = updateCanvasSlice(document, target.id, {
      name: "Cover",
      width: 1200,
    });

    expect(updated.slices[0]).toMatchObject({
      id: target.id,
      name: "Cover",
      width: 1200,
    });
    expect(updated.slices[1]).toMatchObject({
      order: 2,
      x: 1080,
      width: 1080,
    });
  });
});
