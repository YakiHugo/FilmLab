import { describe, expect, it } from "vitest";

import { packToneNormalizeUniforms, TONE_NORMALIZE_UNIFORMS_BYTE_SIZE } from "./toneNormalize";

describe("packToneNormalizeUniforms", () => {
  it("allocates the padded WGSL uniform binding size", () => {
    const buffer = packToneNormalizeUniforms({
      gridColumns: 12,
      gridRows: 8,
      glyphSteps: 4,
      ditherMode: "bayer",
      brightness: 6,
      contrast: 1.2,
      density: 0.8,
      coverage: 0.9,
      edgeEmphasis: 0.3,
      invert: true,
    });

    expect(TONE_NORMALIZE_UNIFORMS_BYTE_SIZE).toBe(64);
    expect(buffer.byteLength).toBe(64);
  });
});
