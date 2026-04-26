// LinearGradientMask.frag port.
// Generates a white RGBA mask with alpha = linear gradient from start→end.
// No source texture required — purely UV-based.

struct LinearGradientParams {
  // x=invert
  flags:     vec4<u32>,
  // xy=start(UV), zw=end(UV)
  start_end: vec4<f32>,
  // x=feather [0,1]
  feather:   vec4<f32>,
};

@group(0) @binding(0) var<uniform> q: LinearGradientParams;

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let axis    = q.start_end.zw - q.start_end.xy;
  let len_sq  = max(dot(axis, axis), 1e-6);
  let t       = clamp(dot(in.uv - q.start_end.xy, axis) / len_sq, 0.0, 1.0);
  let feather = clamp(q.feather.x, 0.0, 1.0);
  let edge0   = clamp(0.5 - 0.5 * feather, 0.0, 1.0);
  let edge1   = clamp(0.5 + 0.5 * feather, 0.0, 1.0);
  // step(t, 0.5): 1 when t≤0.5, 0 when t>0.5 — hard edge at midpoint when no feather.
  var alpha   = select(1.0 - smoothstep(edge0, edge1, t), step(t, 0.5), edge0 >= edge1);
  if (q.flags.x != 0u) { alpha = 1.0 - alpha; }
  return vec4<f32>(1.0, 1.0, 1.0, clamp(alpha, 0.0, 1.0));
}
