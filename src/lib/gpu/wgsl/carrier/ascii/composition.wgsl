// ASCII composition (Slice 1 — foreground glyph rendering only).
//
// Reads the per-cell glyph index produced by `selection.wgsl` and stamps
// the matching atlas tile into the cell's pixel region. Only enough of the
// existing AsciiCarrier.frag is ported to validate the compute pipeline
// against synthetic fixtures; dual-layer / dot mode / color modes / grid
// overlay land in Slice 6 when the integration drives them in.
//
// Y-invariant UV (matches `wgsl/passthrough.wgsl`).

struct CompositionUniforms {
  canvasSize: vec2<f32>,
  gridSize: vec2<f32>,
  cellSize: vec2<f32>,
  atlasGrid: vec2<f32>,
  foregroundOpacity: f32,
  _pad: f32,
}

@group(0) @binding(0) var atlasTex: texture_2d<f32>;
@group(0) @binding(1) var atlasSmp: sampler;
@group(0) @binding(2) var<uniform> u: CompositionUniforms;
@group(0) @binding(3) var<storage, read> selection: array<u32>;

const ASCII_GRAYSCALE_HIGHLIGHT: vec3<f32> = vec3<f32>(245.0 / 255.0);

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VSOut {
  var positions = array<vec2<f32>, 4>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0,  1.0),
  );
  let p = positions[idx];
  var out: VSOut;
  out.position = vec4<f32>(p, 0.0, 1.0);
  out.uv = vec2<f32>(p.x * 0.5 + 0.5, (1.0 - p.y) * 0.5);
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let pixel = in.uv * u.canvasSize;
  let cellSize = max(u.cellSize, vec2<f32>(1.0));
  let gridSize = max(u.gridSize, vec2<f32>(1.0));
  let atlasGrid = max(u.atlasGrid, vec2<f32>(1.0));

  let cellCol = clamp(floor(pixel.x / cellSize.x), 0.0, gridSize.x - 1.0);
  let cellRow = clamp(floor(pixel.y / cellSize.y), 0.0, gridSize.y - 1.0);
  let cellIdx = u32(cellRow) * u32(gridSize.x) + u32(cellCol);
  let glyphIdx = selection[cellIdx];

  let localUv = fract(pixel / cellSize);
  let glyphCol = f32(glyphIdx % u32(atlasGrid.x));
  let glyphRow = f32(glyphIdx / u32(atlasGrid.x));
  let atlasUv = (vec2<f32>(glyphCol, glyphRow) + localUv) / atlasGrid;
  let glyphAlpha = textureSample(atlasTex, atlasSmp, atlasUv).a;

  let opacity = clamp(u.foregroundOpacity, 0.0, 1.0);
  let alpha = opacity * glyphAlpha;
  return vec4<f32>(ASCII_GRAYSCALE_HIGHLIGHT * alpha, alpha);
}
