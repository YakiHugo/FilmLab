// Combines TimestampOverlay.frag (rect + glyph layer) and the LayerBlend.frag
// normal/opacity=1 sourceOver into one fragment. The legacy WebGL path needed
// two passes plus a layer texture; in WGSL we do not gain anything from the
// split, so the composite happens inline.

struct TimestampParams {
  // canvasW, canvasH, charCount(f32), glyphCount(f32)
  canvasAndCounts: vec4<f32>,
  // rectLeft, rectTop, rectWidth, rectHeight
  rect: vec4<f32>,
  // textStartX, textStartY, cellWidth, cellHeight
  textStartAndCell: vec4<f32>,
  // atlasCols, atlasRows, _pad, _pad
  atlasGrid: vec4<f32>,
  backgroundColor: vec4<f32>,
  textColor: vec4<f32>,
  // GLSL `u_glyphIndices[64]` packed 4-per-vec4 (uniform-array stride is 16B
  // in WGSL; flat scalars would waste 4× the storage).
  glyphIndices: array<vec4<f32>, 16>,
};

@group(0) @binding(0) var t_base:  texture_2d<f32>;
@group(0) @binding(1) var t_glyph: texture_2d<f32>;
@group(0) @binding(2) var smp:     sampler;
@group(0) @binding(3) var<uniform> params: TimestampParams;

fn isInsideRect(pixel: vec2<f32>, rect: vec4<f32>) -> bool {
  return pixel.x >= rect.x &&
         pixel.y >= rect.y &&
         pixel.x < rect.x + rect.z &&
         pixel.y < rect.y + rect.w;
}

fn fetchGlyphIndex(cellIndex: u32) -> f32 {
  let group = cellIndex / 4u;
  let lane = cellIndex % 4u;
  return params.glyphIndices[group][lane];
}

fn resolveGlyphMask(pixel: vec2<f32>) -> f32 {
  let textStart = params.textStartAndCell.xy;
  let cellSize  = params.textStartAndCell.zw;
  let charCount = i32(params.canvasAndCounts.z);
  let glyphCount = i32(params.canvasAndCounts.w);

  let local = pixel - textStart;
  if (local.x < 0.0 || local.y < 0.0) { return 0.0; }
  if (local.y >= cellSize.y) { return 0.0; }
  if (local.x >= cellSize.x * f32(max(charCount, 0))) { return 0.0; }

  let cellIndex = i32(floor(local.x / max(cellSize.x, 1.0)));
  if (cellIndex < 0 || cellIndex >= charCount || cellIndex >= 64) { return 0.0; }

  let glyphIndexValue = fetchGlyphIndex(u32(cellIndex));
  if (glyphIndexValue < 0.0) { return 0.0; }

  let glyphIndex = i32(floor(glyphIndexValue + 0.5));
  if (glyphIndex < 0 || glyphIndex >= glyphCount) { return 0.0; }

  let atlasCols = max(i32(floor(params.atlasGrid.x + 0.5)), 1);
  let glyphLocalUv = vec2<f32>(
    fract(local.x / max(cellSize.x, 1.0)),
    clamp(local.y / max(cellSize.y, 1.0), 0.0, 0.9999),
  );
  let atlasCol = glyphIndex % atlasCols;
  let atlasRow = glyphIndex / atlasCols;
  let atlasOrigin = vec2<f32>(f32(atlasCol), f32(atlasRow));
  let denom = max(params.atlasGrid.xy, vec2<f32>(1.0, 1.0));
  let atlasUv = (atlasOrigin + glyphLocalUv) / denom;
  return textureSampleLevel(t_glyph, smp, atlasUv, 0.0).r;
}

fn overlaySourceOver(base: vec4<f32>, layer: vec4<f32>) -> vec4<f32> {
  let outAlpha = layer.a + base.a * (1.0 - layer.a);
  if (outAlpha <= 1e-5) {
    return vec4<f32>(0.0);
  }
  let outRgb = (layer.rgb * layer.a + base.rgb * base.a * (1.0 - layer.a)) / outAlpha;
  return vec4<f32>(clamp(outRgb, vec3<f32>(0.0), vec3<f32>(1.0)), clamp(outAlpha, 0.0, 1.0));
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let canvasSize = params.canvasAndCounts.xy;
  let pixel = in.uv * canvasSize;

  var overlay = vec4<f32>(0.0);
  if (isInsideRect(pixel, params.rect)) {
    overlay = params.backgroundColor;
  }
  let glyphMask = resolveGlyphMask(pixel);
  if (glyphMask > 0.001) {
    overlay = overlaySourceOver(
      overlay,
      vec4<f32>(params.textColor.rgb, params.textColor.a * glyphMask),
    );
  }

  let base = textureSampleLevel(t_base, smp, in.uv, 0.0);
  let blendFactor = clamp(overlay.a, 0.0, 1.0);
  let rgb = mix(base.rgb, overlay.rgb, blendFactor);
  let a   = base.a + blendFactor * (1.0 - base.a);
  return vec4<f32>(clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)), clamp(a, 0.0, 1.0));
}
