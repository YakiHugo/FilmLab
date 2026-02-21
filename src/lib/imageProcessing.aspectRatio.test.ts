import { describe, expect, it } from "vitest";
import { resolveAspectRatio } from "./imageProcessing";

describe("resolveAspectRatio", () => {
  it("uses custom ratio for free mode", () => {
    expect(resolveAspectRatio("free", 1.85, 4 / 3)).toBe(1.85);
  });

  it("uses fallback when free mode custom ratio is invalid", () => {
    expect(resolveAspectRatio("free", 0, 16 / 9)).toBe(16 / 9);
  });

  it("parses fixed ratio values", () => {
    expect(resolveAspectRatio("4:5", 1, 1)).toBeCloseTo(0.8);
    expect(resolveAspectRatio("9:16", 1, 1)).toBeCloseTo(9 / 16);
  });

  it("uses fallback for original", () => {
    expect(resolveAspectRatio("original", 1, 3 / 2)).toBe(3 / 2);
  });
});

