import { describe, expect, it } from "vitest";
import { parseCubeLut } from "./cube";
import { sampleCubeLut } from "./sample";

const buildIdentityCube = (size: number) => {
  const rows: string[] = [];
  rows.push('TITLE "Identity"');
  rows.push(`LUT_3D_SIZE ${size}`);
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        const denom = Math.max(1, size - 1);
        rows.push(`${r / denom} ${g / denom} ${b / denom}`);
      }
    }
  }
  return rows.join("\n");
};

describe("parseCubeLut", () => {
  it("parses valid .cube payload", () => {
    const parsed = parseCubeLut(buildIdentityCube(2));
    expect(parsed.size).toBe(2);
    expect(parsed.title).toBe("Identity");
    expect(parsed.data.length).toBe(2 * 2 * 2 * 3);
  });

  it("rejects when size is missing", () => {
    expect(() => parseCubeLut("0 0 0")).toThrow("Missing LUT_3D_SIZE");
  });

  it("supports trilinear sampling", () => {
    const parsed = parseCubeLut(buildIdentityCube(4));
    const sampled = sampleCubeLut(
      { size: parsed.size, data: parsed.data },
      0.25,
      0.5,
      0.75
    );
    expect(sampled[0]).toBeCloseTo(0.25, 2);
    expect(sampled[1]).toBeCloseTo(0.5, 2);
    expect(sampled[2]).toBeCloseTo(0.75, 2);
  });
});

