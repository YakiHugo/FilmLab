import { describe, expect, it } from "vitest";
import { asciiAdjustmentsEqual, buildAsciiOutputToken } from "./asciiRaster";

describe("asciiRaster", () => {
  it("builds a stable output token from enabled ascii settings", () => {
    expect(
      buildAsciiOutputToken({
        enabled: true,
        charsetPreset: "blocks",
        colorMode: "full-color",
        cellSize: 14,
        characterSpacing: 1.1,
        contrast: 1.35,
        dither: "floyd-steinberg",
        invert: true,
      })
    ).toBe("ascii:on:blocks:full-color:14:1.10:1.35:floyd-steinberg:1");
  });

  it("treats matching settings as equal", () => {
    expect(
      asciiAdjustmentsEqual(
        {
          enabled: false,
          charsetPreset: "standard",
          colorMode: "grayscale",
          cellSize: 12,
          characterSpacing: 1,
          contrast: 1,
          dither: "none",
          invert: false,
        },
        {
          enabled: false,
          charsetPreset: "standard",
          colorMode: "grayscale",
          cellSize: 12,
          characterSpacing: 1,
          contrast: 1,
          dither: "none",
          invert: false,
        }
      )
    ).toBe(true);
  });
});
