import { describe, expect, it } from "vitest";
import { createDefaultAdjustments, normalizeAdjustments } from "./adjustments";

describe("adjustments ascii normalization", () => {
  it("fills missing ascii settings with defaults", () => {
    const normalized = normalizeAdjustments({});

    expect(normalized.ascii).toEqual(createDefaultAdjustments().ascii);
  });

  it("clamps invalid ascii values into the supported range", () => {
    const normalized = normalizeAdjustments({
      ascii: {
        enabled: true,
        charsetPreset: "unsupported" as never,
        colorMode: "invalid" as never,
        cellSize: 999,
        characterSpacing: -1,
        contrast: 99,
        dither: "invalid" as never,
        invert: true,
      },
    });

    expect(normalized.ascii).toEqual({
      enabled: true,
      charsetPreset: "standard",
      colorMode: "grayscale",
      cellSize: 24,
      characterSpacing: 0.7,
      contrast: 2.5,
      dither: "none",
      invert: true,
    });
  });
});
