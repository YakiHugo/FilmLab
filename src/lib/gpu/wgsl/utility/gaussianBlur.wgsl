// 13-tap Gaussian blur — same weights and sampling strategy as GaussianBlur.frag.
// Run horizontal (dir=(1/w,0)) and vertical (dir=(0,1/h)) for a separable 2D blur.

struct BlurParams {
  // xy=direction (texel units), z=radius multiplier
  params: vec4<f32>,
};

@group(0) @binding(0) var src:        texture_2d<f32>;
@group(0) @binding(1) var smp:        sampler;
@group(0) @binding(2) var<uniform> q: BlurParams;

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let w = array<f32, 7>(0.1610, 0.1486, 0.1169, 0.0784, 0.0448, 0.0218, 0.0090);
  let spread = max(q.params.z, 1.0);
  let step   = q.params.xy * spread;
  let uv     = in.uv;
  var r = textureSampleLevel(src, smp, uv, 0.0) * w[0];
  for (var i = 1; i <= 6; i++) {
    let off = step * f32(i);
    r += textureSampleLevel(src, smp, uv + off, 0.0) * w[i];
    r += textureSampleLevel(src, smp, uv - off, 0.0) * w[i];
  }
  return r;
}
