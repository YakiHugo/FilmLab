// GlowThreshold.frag port.
// Extracts glow mask — midtone + highlight energy, optionally disabled.
// Mirrors GlowThreshold.frag.

struct GlowThresholdParams {
  // x=enabled, y=unused, z=unused, w=unused
  flags:  vec4<u32>,
  // x=intensity, y=midtoneFocus, z=bias
  params: vec4<f32>,
};
// 2 × 16 = 32 bytes

@group(0) @binding(0) var src:        texture_2d<f32>;
@group(0) @binding(1) var smp:        sampler;
@group(0) @binding(2) var<uniform> q: GlowThresholdParams;

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  if (q.flags.x == 0u || q.params.x <= 0.001) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }
  let color     = textureSampleLevel(src, smp, in.uv, 0.0).rgb;
  let lum       = max(luminance_rec709(max(color, vec3<f32>(0.0))), 0.0);
  let lum_norm  = lum / (1.0 + lum);
  let focus     = clamp(q.params.y, 0.0, 1.0);
  let sigma     = mix(0.08, 0.36, clamp(q.params.z, 0.0, 1.0));
  let deviation = (lum_norm - focus) / max(sigma, 0.03);
  let mid_mask  = exp(-(deviation * deviation));
  let hi_mask   = smoothstep(max(0.0, focus * 0.45), 0.95, lum_norm);
  let hi_energy = 1.0 + log2(1.0 + max(lum - 1.0, 0.0)) * (0.35 + 0.4 * clamp(q.params.z, 0.0, 1.0));
  let mask      = clamp(mid_mask * 0.72 + hi_mask * 0.58 * hi_energy, 0.0, 4.0);
  return vec4<f32>(color * mask, 1.0);
}
