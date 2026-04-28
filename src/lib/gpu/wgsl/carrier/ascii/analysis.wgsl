// Per-cell feature extraction.
//
// One workgroup invocation per cell. Each invocation reads its cell's pixel
// region from the source texture, computes the 27-float feature vector, and
// writes it to the per-cell features storage buffer using the same layout as
// `descriptors.ts`:
//
//   [0]      raw cell luminance density
//   [1..17]  4×4 sub-grid density (per-sector mean luminance)
//   [17..25] 8-bin Sobel gradient histogram (L1-normalized)
//   [25,26]  centroid offset (cx, cy) in [-0.5, 0.5]
//
// Also writes the per-cell averaged RGBA into the `cellColor` storage buffer.
// The averaged colour is the box-filtered cell pixel mean — close enough to
// the browser's `drawImage(W,H,cols,rows)` bilinear downsample that the
// legacy ASCII full-color path produces visually-equivalent output.
//
// Slot 0 (raw luminance) is consumed by the toneNormalize pass which writes
// the post-normalization tone into a separate `cellTone` buffer; selection
// reads cellTone (not features[base+0]) for density-driven glyph picking.

struct AnalysisUniforms {
  imageSize: vec2<u32>,
  gridSize: vec2<u32>,
  cellSize: vec2<u32>,
  _pad: vec2<u32>,
}

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> u: AnalysisUniforms;
@group(0) @binding(2) var<storage, read_write> features: array<f32>;
@group(0) @binding(3) var<storage, read_write> cellColor: array<vec4<f32>>;

const STRIDE: u32 = 27u;
const SUBGRID_DIM: u32 = 4u;
const SUBGRID_SECTORS: u32 = 16u;
const EDGE_BINS: u32 = 8u;
const PI: f32 = 3.14159265358979;
const LUMI_WEIGHTS: vec3<f32> = vec3<f32>(0.2126, 0.7152, 0.0722);

fn loadSample(coord: vec2<i32>) -> vec4<f32> {
  let cx = clamp(coord.x, 0, i32(u.imageSize.x) - 1);
  let cy = clamp(coord.y, 0, i32(u.imageSize.y) - 1);
  return textureLoad(srcTex, vec2<i32>(cx, cy), 0);
}

@compute @workgroup_size(8, 8, 1)
fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let cellX = gid.x;
  let cellY = gid.y;
  if (cellX >= u.gridSize.x || cellY >= u.gridSize.y) {
    return;
  }
  let cellIdx = cellY * u.gridSize.x + cellX;
  let baseOffset = cellIdx * STRIDE;

  let cw = u.cellSize.x;
  let ch = u.cellSize.y;
  let pxStartX = cellX * cw;
  let pxStartY = cellY * ch;

  var sectorSums: array<f32, 16>;
  var sectorCounts: array<f32, 16>;
  var edge: array<f32, 8>;
  for (var i: u32 = 0u; i < SUBGRID_SECTORS; i = i + 1u) {
    sectorSums[i] = 0.0;
    sectorCounts[i] = 0.0;
  }
  for (var i: u32 = 0u; i < EDGE_BINS; i = i + 1u) {
    edge[i] = 0.0;
  }

  var totalLumi: f32 = 0.0;
  var sumX: f32 = 0.0;
  var sumY: f32 = 0.0;
  var colorSum: vec4<f32> = vec4<f32>(0.0);

  // Pass 1: density / sub-grid / centroid / colour accumulators.
  for (var dy: u32 = 0u; dy < ch; dy = dy + 1u) {
    for (var dx: u32 = 0u; dx < cw; dx = dx + 1u) {
      let sample = loadSample(vec2<i32>(i32(pxStartX + dx), i32(pxStartY + dy)));
      let lumi = dot(sample.rgb, LUMI_WEIGHTS);
      var sx = (dx * SUBGRID_DIM) / cw;
      var sy = (dy * SUBGRID_DIM) / ch;
      if (sx >= SUBGRID_DIM) { sx = SUBGRID_DIM - 1u; }
      if (sy >= SUBGRID_DIM) { sy = SUBGRID_DIM - 1u; }
      let s = sy * SUBGRID_DIM + sx;
      sectorSums[s] = sectorSums[s] + lumi;
      sectorCounts[s] = sectorCounts[s] + 1.0;
      totalLumi = totalLumi + lumi;
      sumX = sumX + lumi * f32(dx);
      sumY = sumY + lumi * f32(dy);
      colorSum = colorSum + sample;
    }
  }

  // Pass 2: 3×3 Sobel for the gradient histogram. Border pixels within the
  // cell are skipped (Sobel needs a full 3×3 neighbourhood).
  for (var dy: u32 = 1u; dy + 1u < ch; dy = dy + 1u) {
    for (var dx: u32 = 1u; dx + 1u < cw; dx = dx + 1u) {
      let px = i32(pxStartX + dx);
      let py = i32(pxStartY + dy);
      let l00 = dot(loadSample(vec2<i32>(px - 1, py - 1)).rgb, LUMI_WEIGHTS);
      let l01 = dot(loadSample(vec2<i32>(px,     py - 1)).rgb, LUMI_WEIGHTS);
      let l02 = dot(loadSample(vec2<i32>(px + 1, py - 1)).rgb, LUMI_WEIGHTS);
      let l10 = dot(loadSample(vec2<i32>(px - 1, py)).rgb, LUMI_WEIGHTS);
      let l12 = dot(loadSample(vec2<i32>(px + 1, py)).rgb, LUMI_WEIGHTS);
      let l20 = dot(loadSample(vec2<i32>(px - 1, py + 1)).rgb, LUMI_WEIGHTS);
      let l21 = dot(loadSample(vec2<i32>(px,     py + 1)).rgb, LUMI_WEIGHTS);
      let l22 = dot(loadSample(vec2<i32>(px + 1, py + 1)).rgb, LUMI_WEIGHTS);
      let gx = (l02 + 2.0 * l12 + l22) - (l00 + 2.0 * l10 + l20);
      let gy = (l20 + 2.0 * l21 + l22) - (l00 + 2.0 * l01 + l02);
      let mag = sqrt(gx * gx + gy * gy);
      if (mag <= 0.0) {
        continue;
      }
      var orient = atan2(gy, gx);
      if (orient < 0.0) { orient = orient + PI; }
      var bin = u32(floor(orient / PI * f32(EDGE_BINS)));
      if (bin >= EDGE_BINS) { bin = EDGE_BINS - 1u; }
      edge[bin] = edge[bin] + mag;
    }
  }

  let cellPxCount = f32(cw * ch);
  let density = totalLumi / cellPxCount;

  var cx: f32 = 0.0;
  var cy: f32 = 0.0;
  if (totalLumi > 0.0) {
    cx = sumX / totalLumi / f32(cw) - 0.5;
    cy = sumY / totalLumi / f32(ch) - 0.5;
  }

  var edgeSum: f32 = 0.0;
  for (var i: u32 = 0u; i < EDGE_BINS; i = i + 1u) {
    edgeSum = edgeSum + edge[i];
  }

  features[baseOffset + 0u] = density;
  for (var i: u32 = 0u; i < SUBGRID_SECTORS; i = i + 1u) {
    let count = sectorCounts[i];
    var v: f32 = 0.0;
    if (count > 0.0) {
      v = sectorSums[i] / count;
    }
    features[baseOffset + 1u + i] = v;
  }
  for (var i: u32 = 0u; i < EDGE_BINS; i = i + 1u) {
    var v: f32 = 0.0;
    if (edgeSum > 0.0) {
      v = edge[i] / edgeSum;
    }
    features[baseOffset + 1u + SUBGRID_SECTORS + i] = v;
  }
  features[baseOffset + 25u] = cx;
  features[baseOffset + 26u] = cy;

  cellColor[cellIdx] = colorSum / cellPxCount;
}
