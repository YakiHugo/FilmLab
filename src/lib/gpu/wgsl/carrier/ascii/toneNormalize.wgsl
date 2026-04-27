// Per-cell tone normalization (port of asciiEffect.ts::buildAsciiCellGrids).
//
// One workgroup invocation per cell. Reads:
//   - features[i*27 + 0]    raw cell luminance (written by analysis.wgsl)
//   - features[neighbour*27] raw cell luminance for L/R/U/D edge emphasis
//   - cellColor[i].a         alpha for the alpha-cutoff gate
//
// Writes the post-normalization tone to `cellTone[i]`. selection.wgsl reads
// cellTone in place of features[base+0]; composition.wgsl reads cellTone for
// dot-mode radius and duotone gradient.
//
// Floyd-Steinberg from the CPU pipeline collapses to ordered Bayer 8×8 here.
// FS is sequential by design (each cell depends on neighbours that may not
// have been processed yet); Bayer keeps the dithered look without a sequential
// dependency. The legacy ≤4/255 parity gate tolerates the substitution and
// the project is pre-launch — we are not dual-pathing FS for legacy parity.

struct ToneUniforms {
  gridSize: vec2<u32>,
  glyphSteps: u32,
  ditherMode: u32,    // 0=none, 1=bayer
  brightness: f32,    // -100..100 (matches CPU `params.brightness`)
  contrast: f32,      // 0.25..3
  densityPow: f32,    // 0.1..1 (mapped to pow(x, 1/density))
  coverage: f32,      // 0.05..1
  edgeEmphasis: f32,  // 0..1
  invert: u32,        // 0/1
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var<storage, read>      features:  array<f32>;
@group(0) @binding(1) var<storage, read>      cellColor: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> cellTone: array<f32>;
@group(0) @binding(3) var<uniform>             u:        ToneUniforms;

const STRIDE: u32 = 27u;
const ALPHA_CUTOFF: f32 = 0.05;

// Bayer 8×8 ordered-dither thresholds, normalized to [0, 1).
const BAYER: array<f32, 64> = array<f32, 64>(
   0.0/64.0, 32.0/64.0,  8.0/64.0, 40.0/64.0,  2.0/64.0, 34.0/64.0, 10.0/64.0, 42.0/64.0,
  48.0/64.0, 16.0/64.0, 56.0/64.0, 24.0/64.0, 50.0/64.0, 18.0/64.0, 58.0/64.0, 26.0/64.0,
  12.0/64.0, 44.0/64.0,  4.0/64.0, 36.0/64.0, 14.0/64.0, 46.0/64.0,  6.0/64.0, 38.0/64.0,
  60.0/64.0, 28.0/64.0, 52.0/64.0, 20.0/64.0, 62.0/64.0, 30.0/64.0, 54.0/64.0, 22.0/64.0,
   3.0/64.0, 35.0/64.0, 11.0/64.0, 43.0/64.0,  1.0/64.0, 33.0/64.0,  9.0/64.0, 41.0/64.0,
  51.0/64.0, 19.0/64.0, 59.0/64.0, 27.0/64.0, 49.0/64.0, 17.0/64.0, 57.0/64.0, 25.0/64.0,
  15.0/64.0, 47.0/64.0,  7.0/64.0, 39.0/64.0, 13.0/64.0, 45.0/64.0,  5.0/64.0, 37.0/64.0,
  63.0/64.0, 31.0/64.0, 55.0/64.0, 23.0/64.0, 61.0/64.0, 29.0/64.0, 53.0/64.0, 21.0/64.0,
);

fn rawLumiAt(x: i32, y: i32) -> f32 {
  let cx = clamp(x, 0, i32(u.gridSize.x) - 1);
  let cy = clamp(y, 0, i32(u.gridSize.y) - 1);
  let idx = u32(cy) * u.gridSize.x + u32(cx);
  return features[idx * STRIDE + 0u];
}

@compute @workgroup_size(8, 8, 1)
fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let cellX = gid.x;
  let cellY = gid.y;
  if (cellX >= u.gridSize.x || cellY >= u.gridSize.y) {
    return;
  }
  let cellIdx = cellY * u.gridSize.x + cellX;

  let alpha = cellColor[cellIdx].a;
  if (alpha <= ALPHA_CUTOFF) {
    cellTone[cellIdx] = 0.0;
    return;
  }

  let rawLumi = rawLumiAt(i32(cellX), i32(cellY));
  // brightness / contrast (centred at 0.5).
  var brightness = (rawLumi - 0.5) * u.contrast + 0.5 + u.brightness / 100.0;
  brightness = clamp(brightness, 0.0, 1.0);
  // density acts as a tonal power gain — `pow(x, 1/density)` so density<1
  // dims mid-tones (matches CPU `Math.pow(brightness, 1 / normalized.density)`).
  let densityExp = 1.0 / max(u.densityPow, 1.0e-3);
  brightness = pow(brightness, densityExp);

  let coverageThreshold = 1.0 - u.coverage;
  if (brightness <= coverageThreshold) {
    cellTone[cellIdx] = 0.0;
    return;
  }

  var tone = (brightness - coverageThreshold) / max(1.0 - coverageThreshold, 1.0e-4);
  tone = clamp(tone, 0.0, 1.0);
  if (u.invert != 0u) {
    tone = 1.0 - tone;
  }

  // Edge emphasis after invert — dense cells stay dense regardless of mode.
  if (u.edgeEmphasis > 0.0) {
    let left  = rawLumiAt(i32(cellX) - 1, i32(cellY));
    let right = rawLumiAt(i32(cellX) + 1, i32(cellY));
    let up    = rawLumiAt(i32(cellX),     i32(cellY) - 1);
    let down  = rawLumiAt(i32(cellX),     i32(cellY) + 1);
    let edge = clamp(abs(right - left) + abs(down - up), 0.0, 1.0);
    tone = clamp(tone + edge * u.edgeEmphasis, 0.0, 1.0);
  }

  // Tone is multiplied by glyphSteps in composition (`idx = round(tone *
  // glyphSteps)`) to map to the atlas index. CPU floor of 0.001 keeps a cell
  // that survived the cutoff/coverage gate from snapping to glyph 0; the
  // legacy GLSL relied on the same minimum.
  if (tone > 0.0 && tone < 0.001) {
    tone = 0.001;
  }

  if (u.ditherMode == 1u && u.glyphSteps > 1u) {
    let bx = cellX & 7u;
    let by = cellY & 7u;
    let threshold = BAYER[by * 8u + bx] - 0.5;
    let scaled = tone * f32(u.glyphSteps) + threshold;
    let quantized = round(clamp(scaled, 0.0, f32(u.glyphSteps)));
    tone = clamp(quantized / f32(u.glyphSteps), 0.0, 1.0);
  }

  cellTone[cellIdx] = tone;
}
