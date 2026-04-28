/**
 * CPU glyph descriptor + atlas bake for the WebGPU ASCII pipeline.
 *
 * Each glyph yields a 27-float feature vector consumed by the selection
 * compute shader (see `wgsl/carrier/ascii/selection.wgsl`):
 *
 *   [0]      overall density          (mean alpha in [0,1])
 *   [1..17]  4×4 sub-grid density     (mean alpha per sector)
 *   [17..25] 8-bin gradient orientation histogram (Sobel, π-folded, L1-normalized)
 *   [25,26]  centroid offset (cx, cy) (alpha-weighted, in [-0.5, 0.5])
 *
 * The same convention is computed per cell in `analysis.wgsl` so distances
 * are unit-consistent.
 *
 * Atlas layout:
 * (`PipelineRenderer.getGlyphAtlas`): cols = ceil(sqrt(N)), rows =
 * ceil(N/cols), row-major glyph index. Cells are baked at a fixed reference
 * size — composition relies on linear (mip) sampling for downsampling, so
 * the atlas is not rebuilt per output cellSize.
 */

const REFERENCE_CELL_SIZE_PX = 32;
const SUBGRID_DIM = 4;
const SUBGRID_SECTORS = SUBGRID_DIM * SUBGRID_DIM;
const EDGE_BINS = 8;
export const ASCII_DESCRIPTOR_STRIDE = 1 + SUBGRID_SECTORS + EDGE_BINS + 2; // 27

export interface AsciiGlyphAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly columns: number;
  readonly rows: number;
  readonly cellSizePx: number;
}

export interface AsciiGlyphSet {
  readonly charset: readonly string[];
  readonly glyphCount: number;
  /** Float32Array of length `glyphCount * ASCII_DESCRIPTOR_STRIDE`. */
  readonly descriptors: Float32Array<ArrayBuffer>;
  readonly atlas: AsciiGlyphAtlas;
}

const dedupeChars = (chars: readonly string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ch of chars) {
    if (!seen.has(ch)) {
      seen.add(ch);
      out.push(ch);
    }
  }
  return out;
};

const sampleAlpha = (
  buf: Uint8ClampedArray,
  size: number,
  x: number,
  y: number
): number => {
  const cx = Math.min(size - 1, Math.max(0, x));
  const cy = Math.min(size - 1, Math.max(0, y));
  return buf[(cy * size + cx) * 4 + 3]! / 255;
};

const computeFeatures = (
  alphaPixels: Uint8ClampedArray,
  size: number,
  out: Float32Array,
  baseOffset: number
): void => {
  const sectorSums = new Float32Array(SUBGRID_SECTORS);
  const sectorCounts = new Float32Array(SUBGRID_SECTORS);
  const edge = new Float32Array(EDGE_BINS);

  let totalAlpha = 0;
  let sumX = 0;
  let sumY = 0;

  // Pass 1: density / sub-grid / centroid accumulators.
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const a = alphaPixels[(y * size + x) * 4 + 3]! / 255;
      const sx = Math.min(SUBGRID_DIM - 1, Math.floor((x * SUBGRID_DIM) / size));
      const sy = Math.min(SUBGRID_DIM - 1, Math.floor((y * SUBGRID_DIM) / size));
      const s = sy * SUBGRID_DIM + sx;
      sectorSums[s]! += a;
      sectorCounts[s]! += 1;
      totalAlpha += a;
      sumX += a * x;
      sumY += a * y;
    }
  }

  const totalPixels = size * size;
  const density = totalAlpha / totalPixels;

  // Pass 2: 3×3 Sobel on alpha for the gradient histogram.
  // Border pixels are skipped — Sobel needs a full 3×3 neighborhood.
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const l00 = sampleAlpha(alphaPixels, size, x - 1, y - 1);
      const l01 = sampleAlpha(alphaPixels, size, x, y - 1);
      const l02 = sampleAlpha(alphaPixels, size, x + 1, y - 1);
      const l10 = sampleAlpha(alphaPixels, size, x - 1, y);
      const l12 = sampleAlpha(alphaPixels, size, x + 1, y);
      const l20 = sampleAlpha(alphaPixels, size, x - 1, y + 1);
      const l21 = sampleAlpha(alphaPixels, size, x, y + 1);
      const l22 = sampleAlpha(alphaPixels, size, x + 1, y + 1);
      const gx = l02 + 2 * l12 + l22 - (l00 + 2 * l10 + l20);
      const gy = l20 + 2 * l21 + l22 - (l00 + 2 * l01 + l02);
      const mag = Math.hypot(gx, gy);
      if (mag <= 0) continue;
      // Fold to unsigned orientation [0, π) so opposite-direction gradients on
      // the two sides of the same line stack in the same bin (HOG convention).
      let orient = Math.atan2(gy, gx);
      if (orient < 0) orient += Math.PI;
      const bin = Math.min(EDGE_BINS - 1, Math.floor((orient / Math.PI) * EDGE_BINS));
      edge[bin]! += mag;
    }
  }

  let cx = 0;
  let cy = 0;
  if (totalAlpha > 0) {
    cx = sumX / totalAlpha / size - 0.5;
    cy = sumY / totalAlpha / size - 0.5;
  }

  let edgeSum = 0;
  for (let i = 0; i < EDGE_BINS; i += 1) edgeSum += edge[i]!;

  out[baseOffset] = density;
  for (let i = 0; i < SUBGRID_SECTORS; i += 1) {
    const count = sectorCounts[i]!;
    out[baseOffset + 1 + i] = count > 0 ? sectorSums[i]! / count : 0;
  }
  for (let i = 0; i < EDGE_BINS; i += 1) {
    out[baseOffset + 1 + SUBGRID_SECTORS + i] = edgeSum > 0 ? edge[i]! / edgeSum : 0;
  }
  out[baseOffset + 25] = cx;
  out[baseOffset + 26] = cy;
};

export interface PrepareAsciiGlyphSetOptions {
  fontFamily?: string;
  /**
   * Atlas/descriptor cell size in pixels. Defaults to 32. Must be a
   * positive multiple of `SUBGRID_DIM` so sub-grid sectors are integer.
   */
  cellSizePx?: number;
  /** Font size used for fillText. Defaults to `cellSizePx * 0.9`. */
  fontSizePx?: number;
}

/**
 * Rasterizes each glyph at a fixed reference size, extracts the descriptor
 * vector, and stitches the glyphs into a row-major atlas canvas.
 *
 * Returned arrays are owned by the caller — descriptors can be uploaded to a
 * GPU storage buffer, atlas canvas to a texture.
 */
export const prepareAsciiGlyphSet = (
  charset: readonly string[],
  options: PrepareAsciiGlyphSetOptions = {}
): AsciiGlyphSet => {
  if (typeof document === "undefined") {
    throw new Error("prepareAsciiGlyphSet requires a DOM (Canvas2D).");
  }

  const fontFamily = options.fontFamily ?? "monospace";
  const cellSizePx = Math.max(SUBGRID_DIM, options.cellSizePx ?? REFERENCE_CELL_SIZE_PX);
  if (cellSizePx % SUBGRID_DIM !== 0) {
    throw new Error(
      `prepareAsciiGlyphSet: cellSizePx (${cellSizePx}) must be a multiple of ${SUBGRID_DIM}.`
    );
  }
  const fontSizePx = Math.max(6, Math.round(options.fontSizePx ?? cellSizePx * 0.9));
  const unique = dedupeChars(charset);
  if (unique.length === 0) {
    throw new Error("prepareAsciiGlyphSet: charset must contain at least one glyph.");
  }
  const glyphCount = unique.length;
  const columns = Math.max(1, Math.ceil(Math.sqrt(glyphCount)));
  const rows = Math.max(1, Math.ceil(glyphCount / columns));

  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = columns * cellSizePx;
  atlasCanvas.height = rows * cellSizePx;
  const atlasCtx = atlasCanvas.getContext("2d", { willReadFrequently: true });
  if (!atlasCtx) {
    throw new Error("prepareAsciiGlyphSet: failed to acquire atlas 2D context.");
  }
  atlasCtx.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);
  atlasCtx.fillStyle = "#ffffff";
  atlasCtx.textAlign = "center";
  atlasCtx.textBaseline = "middle";
  atlasCtx.font = `${fontSizePx}px ${fontFamily}`;

  const scratch = document.createElement("canvas");
  scratch.width = cellSizePx;
  scratch.height = cellSizePx;
  const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
  if (!scratchCtx) {
    throw new Error("prepareAsciiGlyphSet: failed to acquire scratch 2D context.");
  }
  scratchCtx.fillStyle = "#ffffff";
  scratchCtx.textAlign = "center";
  scratchCtx.textBaseline = "middle";
  scratchCtx.font = `${fontSizePx}px ${fontFamily}`;

  const descriptors = new Float32Array(glyphCount * ASCII_DESCRIPTOR_STRIDE);

  for (let i = 0; i < glyphCount; i += 1) {
    const glyph = unique[i]!;
    scratchCtx.clearRect(0, 0, cellSizePx, cellSizePx);
    if (glyph !== " " && glyph.length > 0) {
      scratchCtx.fillText(glyph, cellSizePx / 2, cellSizePx / 2);
    }
    const imageData = scratchCtx.getImageData(0, 0, cellSizePx, cellSizePx);
    computeFeatures(
      imageData.data,
      cellSizePx,
      descriptors,
      i * ASCII_DESCRIPTOR_STRIDE
    );

    if (glyph !== " " && glyph.length > 0) {
      const col = i % columns;
      const row = Math.floor(i / columns);
      atlasCtx.fillText(
        glyph,
        col * cellSizePx + cellSizePx / 2,
        row * cellSizePx + cellSizePx / 2
      );
    }
  }

  scratch.width = 0;
  scratch.height = 0;

  return {
    charset: unique,
    glyphCount,
    descriptors,
    atlas: {
      canvas: atlasCanvas,
      columns,
      rows,
      cellSizePx,
    },
  };
};
