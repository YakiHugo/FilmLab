// Channel drift signal damage — port of shaders/ChannelDrift.frag.
// Per-channel UV offset in texel units, scaled by intensity.

struct ChannelDriftParams {
  // canvasSize.xy + intensity.z; .w reserved.
  canvasIntensity: vec4<f32>,
  // redOffset.xy + greenOffset.zw (texel units, signed).
  redGreenOffset: vec4<f32>,
  // blueOffset.xy; .zw reserved.
  blueOffset: vec4<f32>,
};

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var srcSampler: sampler;
@group(0) @binding(2) var<uniform> params: ChannelDriftParams;

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let canvas_size = params.canvasIntensity.xy;
  let intensity = params.canvasIntensity.z;
  let texel = vec2<f32>(1.0, 1.0) / canvas_size;

  let red_offset = params.redGreenOffset.xy;
  let green_offset = params.redGreenOffset.zw;
  let blue_offset_xy = params.blueOffset.xy;

  let r_uv = in.uv + red_offset * texel * intensity;
  let g_uv = in.uv + green_offset * texel * intensity;
  let b_uv = in.uv + blue_offset_xy * texel * intensity;

  let r = textureSample(srcTex, srcSampler, r_uv).r;
  let g = textureSample(srcTex, srcSampler, g_uv).g;
  let b = textureSample(srcTex, srcSampler, b_uv).b;
  let a = textureSample(srcTex, srcSampler, in.uv).a;

  return vec4<f32>(r, g, b, a);
}
