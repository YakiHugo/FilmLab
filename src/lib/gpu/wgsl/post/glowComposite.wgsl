// GlowComposite.frag port.
// Additively blends the blurred glow mask onto the source.
// Bindings: 0=src, 1=glow_mask(blurred), 2=smp, 3=uniform.

struct GlowCompositeParams {
  // x=enabled
  flags:  vec4<u32>,
  // x=intensity, y=bias
  params: vec4<f32>,
};
// 2 × 16 = 32 bytes

@group(0) @binding(0) var src:        texture_2d<f32>;
@group(0) @binding(1) var glow_mask:  texture_2d<f32>;
@group(0) @binding(2) var smp:        sampler;
@group(0) @binding(3) var<uniform> q: GlowCompositeParams;

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let sampled = textureSampleLevel(src, smp, in.uv, 0.0);
  var color   = sampled.rgb;

  if (q.flags.x != 0u && q.params.x > 0.001) {
    let blurred = textureSampleLevel(glow_mask, smp, in.uv, 0.0).rgb;
    let gain    = clamp(q.params.x, 0.0, 1.0) * mix(0.65, 1.35, clamp(q.params.y, 0.0, 1.0));
    color      += blurred * gain;
  }

  return vec4<f32>(max(color, vec3<f32>(0.0)), sampled.a);
}
