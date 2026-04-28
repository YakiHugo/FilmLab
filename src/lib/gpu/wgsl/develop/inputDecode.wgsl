// Source decode: clamp + sRGB→linear. Mirrors `shaders/InputDecode.frag`.
// Vertex stage / `VSOut` from `wgsl/lib/fullscreen.wgsl`; sRGB helpers from
// `wgsl/lib/colorSpace.wgsl`; concatenated by `passes/develop/inputDecode.ts`.

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let sampled = textureSample(src, smp, in.uv);
  let color = clamp(sampled.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
  return vec4<f32>(srgb_to_linear(color), sampled.a);
}
