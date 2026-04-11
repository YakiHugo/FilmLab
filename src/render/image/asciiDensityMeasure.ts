// Measures the actual pixel coverage of every glyph in a candidate character
// set under a given font, then returns the chars sorted densest → sparsest.
// This replaces the previous hand-written density order (e.g. "@%#*+=-:. "),
// which assumed a specific font's intuitive ramp — mismatched orderings produce
// the "ASCII looks muddy" symptom because tone indices no longer align with
// what pixels actually contain.
//
// Inspired by textmode.js's CharacterExtractor / CharacterColorMapper approach
// of building the palette from the font itself rather than from a hard-coded
// ramp. We stay simpler than textmode.js: Canvas2D fillText + alpha count,
// keyed by (charset, fontFamily, reference size).

interface DensityCacheEntry {
  sorted: string[];
  lastUsedAt: number;
}

const DENSITY_CACHE_MAX_ENTRIES = 16;
const densityCache = new Map<string, DensityCacheEntry>();

// Density ordering is near-invariant across cell sizes for any reasonable
// monospace font, so we always measure at a single reference size and let the
// result be reused for every cellSize. Keeps the cache one-dimensional and
// avoids recomputing the sort every time a slider moves the cellSize.
const REFERENCE_FONT_SIZE_PX = 32;

const evictIfNeeded = () => {
  while (densityCache.size > DENSITY_CACHE_MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [key, entry] of densityCache) {
      if (entry.lastUsedAt < oldestAt) {
        oldestAt = entry.lastUsedAt;
        oldestKey = key;
      }
    }
    if (!oldestKey) {
      break;
    }
    densityCache.delete(oldestKey);
  }
};

const dedupeChars = (charset: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const char of charset) {
    if (!seen.has(char)) {
      seen.add(char);
      out.push(char);
    }
  }
  return out;
};

const measureUnsafe = (
  candidateChars: string[],
  fontFamily: string
): string[] | null => {
  if (typeof document === "undefined") {
    return null;
  }
  const size = Math.max(16, Math.round(REFERENCE_FONT_SIZE_PX * 1.5));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    canvas.width = 0;
    canvas.height = 0;
    return null;
  }

  context.font = `${REFERENCE_FONT_SIZE_PX}px ${fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#ffffff";

  // Tuple of (char, measured density). We sort densest first so index 0 maps
  // to the darkest tone (tone→glyphIndex mapping is linear; densest char wins
  // the "fill the dark areas" slot).
  const measurements: Array<{ char: string; density: number }> = [];
  const totalPixels = size * size;
  for (const char of candidateChars) {
    context.clearRect(0, 0, size, size);
    context.fillText(char, size / 2, size / 2);
    const imageData = context.getImageData(0, 0, size, size);
    let opaqueCount = 0;
    const data = imageData.data;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] ?? 0) {
        opaqueCount += 1;
      }
    }
    measurements.push({ char, density: opaqueCount / totalPixels });
  }

  // Stable sort: primary by density desc, tiebreaker by codepoint asc so the
  // result is deterministic between runs and identical candidate sets always
  // produce identical cache entries.
  measurements.sort((a, b) => {
    if (b.density !== a.density) {
      return b.density - a.density;
    }
    return a.char.codePointAt(0)! - b.char.codePointAt(0)!;
  });

  canvas.width = 0;
  canvas.height = 0;

  return measurements.map((entry) => entry.char);
};

export interface DensitySortedCharset {
  fontFamily: string;
  chars: readonly string[];
}

/**
 * Returns a density-sorted (densest first) unique character array suitable for
 * use as an ASCII tone ramp. Falls back to the deduplicated input order when
 * measurement is unavailable (SSR / test env without canvas) or when the input
 * resolves to an empty set.
 */
export const resolveDensitySortedCharset = (
  charset: string,
  fontFamily = "monospace"
): string[] => {
  const unique = dedupeChars(charset);
  if (unique.length === 0) {
    return [];
  }
  if (unique.length === 1) {
    return unique;
  }

  const cacheKey = `${fontFamily}::${unique.join("")}`;
  const cached = densityCache.get(cacheKey);
  if (cached) {
    cached.lastUsedAt = Date.now();
    return cached.sorted;
  }

  const measured = measureUnsafe(unique, fontFamily) ?? unique;
  densityCache.set(cacheKey, {
    sorted: measured,
    lastUsedAt: Date.now(),
  });
  evictIfNeeded();
  return measured;
};

export const clearAsciiDensityCache = () => {
  densityCache.clear();
};
