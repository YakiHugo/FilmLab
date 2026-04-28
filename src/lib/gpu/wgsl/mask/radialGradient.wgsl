// RadialGradientMask.frag port.
// Generates a white RGBA mask with alpha = radial gradient from center.
// No source texture required.

struct RadialGradientParams {
  // x=invert
  flags:         vec4<u32>,
  // xy=center(UV), zw=radius(UV)
  center_radius: vec4<f32>,
  // x=feather [0,1]
  feather:       vec4<f32>,
};

@group(0) @binding(0) var<uniform> q: RadialGradientParams;

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let radius  = max(q.center_radius.zw, vec2<f32>(0.0001));
  let delta   = (in.uv - q.center_radius.xy) / radius;
  let dist    = length(delta);
  let feather = clamp(q.feather.x, 0.0, 1.0);
  let inner   = max(0.0, 1.0 - feather);
  // step(dist, 1.0): 1 when dist≤1 (inside ellipse), 0 outside.
  var alpha   = select(1.0 - smoothstep(inner, 1.0, dist), step(dist, 1.0), inner >= 1.0);
  if (q.flags.x != 0u) { alpha = 1.0 - alpha; }
  return vec4<f32>(1.0, 1.0, 1.0, clamp(alpha, 0.0, 1.0));
}
