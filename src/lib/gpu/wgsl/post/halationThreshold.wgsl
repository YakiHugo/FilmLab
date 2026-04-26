// HalationThreshold.frag port.
// Extracts halation + bloom energy from a linear-light source.
// Output: RGB = source * halation energy (red-weighted), A = bloom energy (luma).
// Mirrors HalationThreshold.frag exactly.

struct ThresholdParams {
  // x=halationThreshold, y=bloomThreshold
  params: vec4<f32>,
};

@group(0) @binding(0) var src:        texture_2d<f32>;
@group(0) @binding(1) var smp:        sampler;
@group(0) @binding(2) var<uniform> q: ThresholdParams;

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let color     = max(textureSampleLevel(src, smp, in.uv, 0.0).rgb, vec3<f32>(0.0));
  let lum       = luminance_rec709(color);
  let red_lum   = dot(color, vec3<f32>(0.55, 0.35, 0.10));
  let halation  = max(red_lum - q.params.x, 0.0);
  let bloom     = max(lum    - q.params.y, 0.0);
  return vec4<f32>(color * halation, bloom);
}
