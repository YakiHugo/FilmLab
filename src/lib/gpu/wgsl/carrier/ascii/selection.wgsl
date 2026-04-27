// Per-cell glyph matching.
//
// One workgroup invocation per cell. Distance against every glyph descriptor:
//
//   d = (1 - w) * densityDist + w * (subgridDist + edgeDist + centroidDist)
//
// where w = clamp(structureWeight, 0, 1). w=0 reduces to density-only
// selection (matching the WebGL2 path's tone→idx mapping when the charset is
// density-sorted); w=1 ignores overall density and ranks purely by spatial
// structure.
//
// Sub-component distances are L2² normalized by their bin count so each
// component contributes on a comparable scale (≈ [0, 1]).

struct SelectionUniforms {
  cellCount: u32,
  glyphCount: u32,
  structureWeight: f32,
  _pad: f32,
}

@group(0) @binding(0) var<storage, read> features: array<f32>;
@group(0) @binding(1) var<storage, read> glyphs: array<f32>;
@group(0) @binding(2) var<storage, read_write> selection: array<u32>;
@group(0) @binding(3) var<uniform> u: SelectionUniforms;
@group(0) @binding(4) var<storage, read> cellTone: array<f32>;

const STRIDE: u32 = 27u;
const SUBGRID_SECTORS: u32 = 16u;
const EDGE_BINS: u32 = 8u;

@compute @workgroup_size(64, 1, 1)
fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let cellIdx = gid.x;
  if (cellIdx >= u.cellCount) {
    return;
  }
  let cellBase = cellIdx * STRIDE;
  let w = clamp(u.structureWeight, 0.0, 1.0);

  // cellTone replaces the raw-luminance density slot — it is the
  // post-normalization tone (brightness/contrast/density/coverage/invert/
  // edge/dither). With density-sorted glyph descriptors, picking the glyph
  // closest in density to `cellTone` is equivalent to the legacy
  // `idx = round(tone * (n-1))` mapping.
  let cellDensity = cellTone[cellIdx];
  let cellCx = features[cellBase + 25u];
  let cellCy = features[cellBase + 26u];

  var bestIdx: u32 = 0u;
  var bestDist: f32 = 1.0e30;

  for (var g: u32 = 0u; g < u.glyphCount; g = g + 1u) {
    let gBase = g * STRIDE;
    let gDensity = glyphs[gBase + 0u];

    let dDensity = cellDensity - gDensity;
    let densityDist = dDensity * dDensity;

    var subgridDist: f32 = 0.0;
    for (var i: u32 = 0u; i < SUBGRID_SECTORS; i = i + 1u) {
      let d = features[cellBase + 1u + i] - glyphs[gBase + 1u + i];
      subgridDist = subgridDist + d * d;
    }
    subgridDist = subgridDist / f32(SUBGRID_SECTORS);

    var edgeDist: f32 = 0.0;
    for (var i: u32 = 0u; i < EDGE_BINS; i = i + 1u) {
      let d = features[cellBase + 1u + SUBGRID_SECTORS + i]
            - glyphs[gBase + 1u + SUBGRID_SECTORS + i];
      edgeDist = edgeDist + d * d;
    }
    edgeDist = edgeDist / f32(EDGE_BINS);

    let dCx = cellCx - glyphs[gBase + 25u];
    let dCy = cellCy - glyphs[gBase + 26u];
    let centroidDist = (dCx * dCx + dCy * dCy) / 2.0;

    let dist = (1.0 - w) * densityDist + w * (subgridDist + edgeDist + centroidDist);

    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = g;
    }
  }

  selection[cellIdx] = bestIdx;
}
