// Identity fragment that pairs with `wgsl/lib/fullscreen.wgsl` (concatenated
// at compile time by `passes/utility/passthrough.ts`). Vertex stage and the
// `VSOut` struct are provided by the shared lib.

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  return textureSample(src, smp, in.uv);
}
