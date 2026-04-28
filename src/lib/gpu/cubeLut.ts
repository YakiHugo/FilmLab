export interface ParsedCubeLUT {
  size: number;
  data: Float32Array;
}

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Parse a .cube LUT text file into flattened RGBA float data.
 *
 * Supported directives:
 * - LUT_3D_SIZE <N>
 * - DOMAIN_MIN / DOMAIN_MAX (ignored but accepted)
 * - RGB triplets [0..1]
 */
export const parseCubeLUT = (source: string): ParsedCubeLUT => {
  const lines = source.split(/\r?\n/);
  let size = 0;
  const triples: Array<[number, number, number]> = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const tokens = line.split(/\s+/);
    const head = tokens[0]?.toUpperCase();
    if (!head) {
      continue;
    }

    if (head === "TITLE") {
      continue;
    }

    if (head === "LUT_1D_SIZE") {
      throw new Error("1D CUBE LUT is not supported. Expected LUT_3D_SIZE.");
    }

    if (head === "LUT_3D_SIZE") {
      const parsed = Number(tokens[1]);
      if (!Number.isFinite(parsed) || parsed < 2 || parsed > 128) {
        throw new Error(`Invalid LUT_3D_SIZE: "${tokens[1] ?? ""}"`);
      }
      size = Math.round(parsed);
      continue;
    }

    if (head === "DOMAIN_MIN" || head === "DOMAIN_MAX") {
      continue;
    }

    if (tokens.length < 3) {
      continue;
    }

    const r = Number(tokens[0]);
    const g = Number(tokens[1]);
    const b = Number(tokens[2]);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
      throw new Error(`Invalid LUT entry: "${line}"`);
    }
    triples.push([r, g, b]);
  }

  if (size <= 0) {
    throw new Error("Missing LUT_3D_SIZE in CUBE LUT.");
  }

  const expected = size * size * size;
  if (triples.length < expected) {
    throw new Error(`CUBE LUT has ${triples.length} entries, expected ${expected}.`);
  }

  const data = new Float32Array(expected * 4);
  for (let i = 0; i < expected; i += 1) {
    const triple = triples[i]!;
    const offset = i * 4;
    data[offset + 0] = clampUnit(triple[0]);
    data[offset + 1] = clampUnit(triple[1]);
    data[offset + 2] = clampUnit(triple[2]);
    data[offset + 3] = 1;
  }

  return { size, data };
};
