// Maximum filter (dilation) over a ±radius window (max radius 4). Mirrors Dilate.frag.

struct DilateParams {
  // xy=texel size
  texel: vec4<f32>,
  // x=radius (0–4, clamped in shader)
  flags: vec4<u32>,
};

@group(0) @binding(0) var src:        texture_2d<f32>;
@group(0) @binding(1) var smp:        sampler;
@group(0) @binding(2) var<uniform> q: DilateParams;

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let radius = i32(min(q.flags.x, 4u));
  var mx = textureSampleLevel(src, smp, in.uv, 0.0);
  for (var y = -4; y <= 4; y++) {
    for (var x = -4; x <= 4; x++) {
      if (abs(x) > radius || abs(y) > radius) { continue; }
      let off = vec2<f32>(f32(x), f32(y)) * q.texel.xy;
      mx = max(mx, textureSampleLevel(src, smp, in.uv + off, 0.0));
    }
  }
  return mx;
}
