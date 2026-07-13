// ASCII composition — full feature parity with the legacy AsciiCarrier.frag.
//
// Single fullscreen pass that renders one ASCII layer (either background or
// foreground, selected by `layerMode`):
//
//   layerMode = 0 (background):
//     - sample bg source canvas (linear, opacity-multiplied), OR
//     - solid background fill (already includes alpha), OR
//     - per-cell solid fill (cellBackground × cellAlpha).
//
//   layerMode = 1 (foreground):
//     - glyph mode: stamp atlas glyph at `selection[cell]` index;
//     - dot mode:   render a circle whose radius tracks (1 - cellTone) when
//       invert is false, or cellTone when invert is true (the legacy GLSL
//       un-inverts the post-normalization tone here so dot radius always
//       tracks brightness — see asciiEffect.ts buildAsciiCellGrids).
//     - colorMode: grayscale (constant), full-color (cellColor.rgb),
//                  duotone (mix shadow → highlight by pre-invert tone).
//     - grid overlay (1px white at cell boundaries) composited over.
//
// The per-cell glyph index comes from the selection compute pass — with a
// density-sorted charset, that picks essentially the same glyph as the
// legacy `idx = round(tone * (n-1))` mapping; skipping the recompute drops
// one dependency on the toneNormalize output here.

struct CompositionUniforms {
  canvasGrid: vec4<f32>,        // canvasW, canvasH, gridW, gridH
  cellAtlas: vec4<f32>,         // cellW, cellH, atlasCols, atlasRows
  backgroundFill: vec4<f32>,
  cellBackground: vec4<f32>,
  duotoneShadow: vec4<f32>,
  scalars: vec4<f32>,           // glyphCount, fgOpacity, bgOpacity, gridOverlayAlpha
  modes: vec4<u32>,             // layerMode, renderMode, colorMode, invert
  bgFlags: vec4<u32>,           // useBackgroundCanvas, useBackgroundFill, useCellBackground, gridOverlay
};

@group(0) @binding(0) var atlasTex:    texture_2d<f32>;
@group(0) @binding(1) var atlasSmp:    sampler;
@group(0) @binding(2) var<uniform> u:  CompositionUniforms;
@group(0) @binding(3) var<storage, read> selection: array<u32>;
@group(0) @binding(4) var<storage, read> cellColor: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read> cellTone:  array<f32>;
@group(0) @binding(6) var bgSourceTex: texture_2d<f32>;

const ASCII_ALPHA_CUTOFF: f32 = 0.05;
const ASCII_GRAYSCALE_HIGHLIGHT: vec3<f32> = vec3<f32>(245.0 / 255.0);

fn ascii_source_over(base: vec4<f32>, layer: vec4<f32>) -> vec4<f32> {
  let outAlpha = layer.a + base.a * (1.0 - layer.a);
  if (outAlpha <= 1.0e-5) {
    return vec4<f32>(0.0);
  }
  let outRgb = (layer.rgb * layer.a + base.rgb * base.a * (1.0 - layer.a)) / outAlpha;
  return vec4<f32>(clamp(outRgb, vec3<f32>(0.0), vec3<f32>(1.0)), clamp(outAlpha, 0.0, 1.0));
}

fn line_coverage(distance: f32, width: f32) -> f32 {
  return clamp(width * 0.5 + 0.5 - distance, 0.0, 1.0);
}

fn grid_overlay_mask(localPixel: vec2<f32>, cellSize: vec2<f32>, gridOverlay: u32, lineWidth: f32) -> f32 {
  if (gridOverlay == 0u) {
    return 0.0;
  }
  let safeCell = max(cellSize, vec2<f32>(1.0));
  let distX = min(localPixel.x, safeCell.x - localPixel.x);
  let distY = min(localPixel.y, safeCell.y - localPixel.y);
  let vertical = line_coverage(distX, max(0.0, lineWidth));
  let horizontal = line_coverage(distY, max(0.0, lineWidth));
  return max(vertical, horizontal);
}

fn resolve_cell_index(pixel: u32, imageSize: u32, gridSize: u32) -> u32 {
  let safeImageSize = max(imageSize, 1u);
  let safeGridSize = max(gridSize, 1u);
  return min(safeGridSize - 1u, (((pixel + 1u) * safeGridSize) - 1u) / safeImageSize);
}

fn resolve_foreground_color(cellSample: vec4<f32>, tone: f32) -> vec3<f32> {
  let mode = u.modes.z;
  // Duotone: shadow → highlight gradient based on pre-invert tone.
  if (mode == 2u) {
    var colorTone = tone;
    if (u.modes.w != 0u) { colorTone = 1.0 - colorTone; }
    return mix(u.duotoneShadow.rgb, ASCII_GRAYSCALE_HIGHLIGHT, clamp(colorTone, 0.0, 1.0));
  }
  // Full-color: cell averaged RGB.
  if (mode == 1u) {
    return clamp(cellSample.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
  }
  // Grayscale.
  return ASCII_GRAYSCALE_HIGHLIGHT;
}

fn resolve_background_layer(cellSample: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
  var color = vec4<f32>(0.0);
  if (u.bgFlags.x != 0u) {
    let bg = textureSampleLevel(bgSourceTex, atlasSmp, uv, 0.0);
    color = vec4<f32>(bg.rgb, bg.a * clamp(u.scalars.z, 0.0, 1.0));
  } else if (u.bgFlags.y != 0u) {
    color = u.backgroundFill;
  }
  if (u.bgFlags.z != 0u && cellSample.a > ASCII_ALPHA_CUTOFF) {
    let cellBg = vec4<f32>(
      u.cellBackground.rgb,
      clamp(u.cellBackground.a * cellSample.a, 0.0, 1.0),
    );
    color = ascii_source_over(color, cellBg);
  }
  return color;
}

fn resolve_foreground_layer(
  localPixel: vec2<f32>,
  localUv: vec2<f32>,
  cellSize: vec2<f32>,
  cellSample: vec4<f32>,
  tone: f32,
  cellIdx: u32,
) -> vec4<f32> {
  let safeCellSize = max(cellSize, vec2<f32>(1.0));
  let atlasGrid = max(u.cellAtlas.zw, vec2<f32>(1.0));
  var color = vec4<f32>(0.0);

  if (tone > 0.0 && cellSample.a > ASCII_ALPHA_CUTOFF) {
    let fgRgb = resolve_foreground_color(cellSample, tone);
    let fgAlpha = clamp(u.scalars.y, 0.0, 1.0) * clamp(cellSample.a, 0.0, 1.0);

    if (u.modes.y == 1u) {
      // Dot mode — radius tracks pre-invert tone (un-invert if invert=true).
      var dotTone = clamp(tone, 0.0, 1.0);
      if (u.modes.w != 0u) { dotTone = 1.0 - dotTone; }
      let dotRadius = max(1.0, min(safeCellSize.x, safeCellSize.y) * 0.45 * dotTone);
      let centered = localUv * safeCellSize - safeCellSize * 0.5;
      let dist = length(centered);
      let dotAlpha = 1.0 - smoothstep(max(dotRadius - 1.0, 0.0), dotRadius, dist);
      color = vec4<f32>(fgRgb, fgAlpha * dotAlpha);
    } else {
      // Glyph mode — selection compute pass already picked the index.
      let glyphIdx = selection[cellIdx];
      let glyphCol = f32(glyphIdx % u32(atlasGrid.x));
      let glyphRow = f32(glyphIdx / u32(atlasGrid.x));
      let atlasUv = (vec2<f32>(glyphCol, glyphRow) + localUv) / atlasGrid;
      let glyphAlpha = textureSampleLevel(atlasTex, atlasSmp, atlasUv, 0.0).a;
      color = vec4<f32>(fgRgb, fgAlpha * glyphAlpha);
    }
  }

  let overlayMask = grid_overlay_mask(
    localPixel,
    safeCellSize,
    u.bgFlags.w,
    u.duotoneShadow.a,
  );
  if (overlayMask > 0.0) {
    let overlay = vec4<f32>(1.0, 1.0, 1.0, clamp(u.scalars.w, 0.0, 1.0) * overlayMask);
    color = ascii_source_over(color, overlay);
  }
  return color;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let canvasSize = max(u.canvasGrid.xy, vec2<f32>(1.0));
  let gridSize = max(u.canvasGrid.zw, vec2<f32>(1.0));
  let canvasSizeU = max(vec2<u32>(canvasSize), vec2<u32>(1u));
  let gridSizeU = max(vec2<u32>(gridSize), vec2<u32>(1u));

  let pixel = in.uv * canvasSize;
  let safePixel = clamp(pixel, vec2<f32>(0.0), canvasSize - vec2<f32>(0.0001));
  let pixelCoord = min(vec2<u32>(safePixel), canvasSizeU - vec2<u32>(1u));
  let cellCoord = vec2<u32>(
    resolve_cell_index(pixelCoord.x, canvasSizeU.x, gridSizeU.x),
    resolve_cell_index(pixelCoord.y, canvasSizeU.y, gridSizeU.y),
  );
  let cellStart = (cellCoord * canvasSizeU) / gridSizeU;
  let cellEnd = ((cellCoord + vec2<u32>(1u)) * canvasSizeU) / gridSizeU;
  let cellSize = max(vec2<f32>(cellEnd - cellStart), vec2<f32>(1.0));
  let localPixel = safePixel - vec2<f32>(cellStart);
  let localUv = clamp(localPixel / cellSize, vec2<f32>(0.0), vec2<f32>(0.9999));
  let cellIdx = cellCoord.y * gridSizeU.x + cellCoord.x;

  let cellSample = cellColor[cellIdx];
  let tone = cellTone[cellIdx];

  if (u.modes.x == 0u) {
    return resolve_background_layer(cellSample, in.uv);
  }
  return resolve_foreground_layer(localPixel, localUv, cellSize, cellSample, tone, cellIdx);
}
