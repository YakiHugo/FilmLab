import { describe, expect, it } from "vitest";
import {
  fitCanvasImageSizeWithinLongestEdge,
  resolveCanvasImageInsertionSizeFromCandidates,
} from "./resolveCanvasImageInsertionSize";

describe("resolveCanvasImageInsertionSizeFromCandidates", () => {
  it("fits landscape metadata into the initial canvas bounds without changing aspect ratio", () => {
    expect(
      resolveCanvasImageInsertionSizeFromCandidates({
        metadata: {
          width: 2400,
          height: 1600,
        },
      })
    ).toEqual({
      width: 320,
      height: 213,
    });
  });

  it("fits portrait metadata into the initial canvas bounds without changing aspect ratio", () => {
    expect(
      resolveCanvasImageInsertionSizeFromCandidates({
        metadata: {
          width: 1600,
          height: 2400,
        },
      })
    ).toEqual({
      width: 213,
      height: 320,
    });
  });

  it("keeps square metadata square when scaling to the insertion edge", () => {
    expect(
      resolveCanvasImageInsertionSizeFromCandidates({
        metadata: {
          width: 1080,
          height: 1080,
        },
      })
    ).toEqual({
      width: 320,
      height: 320,
    });
  });

  it("falls back to bitmap dimensions when metadata is unavailable", () => {
    expect(
      resolveCanvasImageInsertionSizeFromCandidates({
        metadata: {
          width: 0,
          height: 0,
        },
        bitmap: {
          width: 600,
          height: 900,
        },
      })
    ).toEqual({
      width: 213,
      height: 320,
    });
  });

  it("preserves a caller-provided minimum short edge for very narrow inserts", () => {
    expect(
      resolveCanvasImageInsertionSizeFromCandidates(
        {
          metadata: {
            width: 50,
            height: 1000,
          },
        },
        {
          minimumShortEdge: 96,
        }
      )
    ).toEqual({
      width: 96,
      height: 320,
    });
  });

  it("falls back to object-url dimensions when metadata and bitmap sizes are unavailable", () => {
    expect(
      resolveCanvasImageInsertionSizeFromCandidates({
        metadata: null,
        bitmap: {
          width: 0,
          height: 0,
        },
        objectUrl: {
          width: 900,
          height: 600,
        },
      })
    ).toEqual({
      width: 320,
      height: 213,
    });
  });

  it("falls back to the default square size when every source is unavailable", () => {
    expect(resolveCanvasImageInsertionSizeFromCandidates({})).toEqual({
      width: 320,
      height: 320,
    });
  });
});

describe("fitCanvasImageSizeWithinLongestEdge", () => {
  it("scales source dimensions to the longest edge", () => {
    expect(
      fitCanvasImageSizeWithinLongestEdge({
        width: 400,
        height: 200,
      })
    ).toEqual({
      width: 320,
      height: 160,
    });
  });
});
