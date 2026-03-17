import { describe, expect, it } from "vitest";
import {
  fitSizeWithinLongestEdge,
  resolveCanvasImageInsertionSize,
} from "./useCanvasEngine";

describe("useCanvasEngine sizing", () => {
  it("fits landscape images into the initial canvas bounds without changing aspect ratio", async () => {
    const size = await resolveCanvasImageInsertionSize({
      metadata: {
        width: 2400,
        height: 1600,
      },
      objectUrl: "blob:landscape",
    });

    expect(size).toEqual({
      width: 320,
      height: 213,
    });
  });

  it("fits portrait images into the initial canvas bounds without changing aspect ratio", async () => {
    const size = await resolveCanvasImageInsertionSize({
      metadata: {
        width: 1600,
        height: 2400,
      },
      objectUrl: "blob:portrait",
    });

    expect(size).toEqual({
      width: 213,
      height: 320,
    });
  });

  it("falls back to the legacy square size when source dimensions are unavailable", async () => {
    const size = await resolveCanvasImageInsertionSize();

    expect(size).toEqual({
      width: 320,
      height: 320,
    });
  });

  it("keeps squares square when scaling to the insertion edge", () => {
    expect(
      fitSizeWithinLongestEdge({
        width: 1080,
        height: 1080,
      })
    ).toEqual({
      width: 320,
      height: 320,
    });
  });
});
