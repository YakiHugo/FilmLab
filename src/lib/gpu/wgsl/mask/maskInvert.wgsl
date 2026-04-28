// MaskInvert.frag port.
// Inverts the alpha channel; RGB output is white.

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let alpha = 1.0 - textureSampleLevel(src, smp, in.uv, 0.0).a;
  return vec4<f32>(1.0, 1.0, 1.0, clamp(alpha, 0.0, 1.0));
}
