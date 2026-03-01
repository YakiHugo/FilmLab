import { describe, expect, it } from "vitest";
import { parseCubeLUT } from "./CubeLUTParser";

describe("parseCubeLUT", () => {
  it("parses a minimal 2x2x2 cube LUT", () => {
    const source = `
      TITLE "tiny"
      LUT_3D_SIZE 2
      0 0 0
      1 0 0
      0 1 0
      1 1 0
      0 0 1
      1 0 1
      0 1 1
      1 1 1
    `;
    const parsed = parseCubeLUT(source);
    expect(parsed.size).toBe(2);
    expect(parsed.data).toBeInstanceOf(Float32Array);
    expect(parsed.data.length).toBe(2 * 2 * 2 * 4);
    expect(Array.from(parsed.data.slice(0, 4))).toEqual([0, 0, 0, 1]);
    expect(Array.from(parsed.data.slice(-4))).toEqual([1, 1, 1, 1]);
  });

  it("throws when LUT_3D_SIZE is missing", () => {
    expect(() => parseCubeLUT("0 0 0\n1 1 1")).toThrow(/LUT_3D_SIZE/i);
  });
});
