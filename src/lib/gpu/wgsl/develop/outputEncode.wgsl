// Output encode: optional tonemap, linear→sRGB, optional ordered dither.
// Mirrors `shaders/OutputEncode.frag`. Concatenated with fullscreen + color
// space libs by `passes/develop/outputEncode.ts`.

struct OutputEncodeParams {
  // outputSize.xy in pixels (rest unused, padded to vec4 for std140 alignment).
  outputSize_pad: vec4<f32>,
  // (inputLinear, enableDither, applyToneMap, _) booleans encoded as u32 0/1.
  flags: vec4<u32>,
};

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var<uniform> params: OutputEncodeParams;

fn hash12(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + vec3<f32>(dot(p3, p3.yzx + vec3<f32>(33.33)));
  return fract((p3.x + p3.y) * p3.z);
}

fn tone_map(c: vec3<f32>) -> vec3<f32> {
  return c / (vec3<f32>(1.0) + c);
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let sampled = textureSample(src, smp, in.uv);
  var color = sampled.rgb;
  let alpha = clamp(sampled.a, 0.0, 1.0);

  let inputLinear = params.flags.x != 0u;
  let enableDither = params.flags.y != 0u;
  let applyToneMap = params.flags.z != 0u;

  if (inputLinear) {
    color = max(color, vec3<f32>(0.0));
    if (applyToneMap) {
      color = tone_map(color);
    }
    color = linear_to_srgb(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)));
  }

  if (enableDither) {
    let outSize = max(params.outputSize_pad.xy, vec2<f32>(1.0));
    let pixel = in.uv * outSize;
    let noise = hash12(floor(pixel)) - 0.5;
    color = color + vec3<f32>(noise / 255.0);
  }

  return vec4<f32>(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)), alpha);
}
