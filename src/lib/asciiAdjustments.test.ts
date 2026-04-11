import { describe, expect, it } from "vitest";
import type { AsciiAdjustments } from "@/types";
import { asciiAdjustmentsEqual, buildAsciiOutputToken } from "./asciiAdjustments";

const neutral: AsciiAdjustments = {
  enabled: false,
  charsetPreset: "standard",
  invert: false,
  brightness: 0,
  contrast: 1,
  density: 1,
  coverage: 1,
  edgeEmphasis: 0,
  renderMode: "glyph",
  cellSize: 12,
  characterSpacing: 1,
  foregroundOpacity: 1,
  foregroundBlendMode: "source-over",
  gridOverlay: false,
  backgroundMode: "cell-solid",
  backgroundColor: "#000000",
  backgroundBlur: 0,
  backgroundOpacity: 1,
  colorMode: "grayscale",
  dither: "none",
};

describe("asciiAdjustments", () => {
  it("builds a stable output token from enabled ascii settings", () => {
    expect(
      buildAsciiOutputToken({
        ...neutral,
        enabled: true,
        charsetPreset: "blocks",
        colorMode: "full-color",
        cellSize: 14,
        characterSpacing: 1.1,
        contrast: 1.35,
        dither: "floyd-steinberg",
        invert: true,
      })
    ).toBe(
      [
        "ascii:on",
        "blocks",
        "full-color",
        "glyph",
        "14",
        "1.10",
        "1.35",
        "0",
        "1.00",
        "1.00",
        "0.00",
        "1.00",
        "source-over",
        "0",
        "cell-solid",
        "#000000",
        "0",
        "1.00",
        "floyd-steinberg",
        "1",
      ].join(":")
    );
  });

  it("collapses to ascii:off when disabled", () => {
    expect(buildAsciiOutputToken({ ...neutral, enabled: false })).toBe("ascii:off");
  });

  it("treats matching settings as equal", () => {
    expect(asciiAdjustmentsEqual({ ...neutral }, { ...neutral })).toBe(true);
  });

  it("treats any single-field difference as unequal", () => {
    expect(
      asciiAdjustmentsEqual({ ...neutral }, { ...neutral, brightness: 5 })
    ).toBe(false);
    expect(
      asciiAdjustmentsEqual({ ...neutral }, { ...neutral, backgroundColor: "#ffffff" })
    ).toBe(false);
    expect(
      asciiAdjustmentsEqual({ ...neutral }, { ...neutral, renderMode: "dot" })
    ).toBe(false);
  });
});
