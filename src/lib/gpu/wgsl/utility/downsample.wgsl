// 4-corner box filter (2× downsample). Mirrors Downsample.frag.

struct DownsampleParams {
  // xy=half-texel size of the source (i.e. 0.5/srcWidth, 0.5/srcHeight)
  params: vec4<f32>,
};

@group(0) @binding(0) var src:        texture_2d<f32>;
@group(0) @binding(1) var smp:        sampler;
@group(0) @binding(2) var<uniform> q: DownsampleParams;

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let d  = q.params.xy;
  let uv = in.uv;
  let c0 = textureSampleLevel(src, smp, uv + vec2<f32>(-d.x, -d.y), 0.0).rgb;
  let c1 = textureSampleLevel(src, smp, uv + vec2<f32>( d.x, -d.y), 0.0).rgb;
  let c2 = textureSampleLevel(src, smp, uv + vec2<f32>(-d.x,  d.y), 0.0).rgb;
  let c3 = textureSampleLevel(src, smp, uv + vec2<f32>( d.x,  d.y), 0.0).rgb;
  return vec4<f32>((c0 + c1 + c2 + c3) * 0.25, 1.0);
}
