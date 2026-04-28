// BrushMaskStamp.frag port.
// Accumulates a single brush dab onto an existing mask (uSampler = prior mask).
// Alpha: soft falloff from innerRadius to outerRadius, combined with previous alpha.

struct StampParams {
  // xy=canvasSize(px), zw=centerPx
  params:  vec4<f32>,
  // x=radiusPx, y=innerRadiusPx, z=flow
  params2: vec4<f32>,
};

@group(0) @binding(0) var src:        texture_2d<f32>;
@group(0) @binding(1) var smp:        sampler;
@group(0) @binding(2) var<uniform> q: StampParams;

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let prev  = textureSampleLevel(src, smp, in.uv, 0.0).a;
  let pixel = in.uv * q.params.xy;
  let dist  = length(pixel - q.params.zw);
  var dab   = 0.0;
  if (dist <= q.params2.x) {
    if (q.params2.x <= q.params2.y + 1e-4) {
      dab = q.params2.z;
    } else {
      dab = q.params2.z * (1.0 - smoothstep(q.params2.y, q.params2.x, dist));
    }
  }
  let alpha = dab + prev * (1.0 - dab);
  return vec4<f32>(1.0, 1.0, 1.0, clamp(alpha, 0.0, 1.0));
}
