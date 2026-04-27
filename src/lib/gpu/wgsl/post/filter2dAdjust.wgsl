// Filter2D adjust pass — port of shaders/Filter2dAdjust.frag.
// Brightness scale (with floor at 0) followed by hue rotation in YIQ space.
// Blur and dilate are separate utility passes; the surface adapter composes
// adjust → blur(h) → blur(v) → dilate to match the GLSL pipeline.

struct Filter2dAdjustParams {
  // brightnessHue.x = brightnessFactor (>= 0); .y = hueRadians; .zw reserved.
  brightnessHue: vec4<f32>,
};

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var srcSampler: sampler;
@group(0) @binding(2) var<uniform> params: Filter2dAdjustParams;

// Both GLSL `mat3` and WGSL `mat3x3` constructors are column-major; each
// inner vec3 below is one column, mirroring the original GLSL constants
// scalar-for-scalar.
const RGB_TO_YIQ = mat3x3<f32>(
  vec3<f32>(0.299,  0.587,  0.114),
  vec3<f32>(0.596, -0.275, -0.321),
  vec3<f32>(0.212, -0.523,  0.311),
);

const YIQ_TO_RGB = mat3x3<f32>(
  vec3<f32>(1.0,    0.956,  0.621),
  vec3<f32>(1.0,   -0.272, -0.647),
  vec3<f32>(1.0,   -1.106,  1.703),
);

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let sampled = textureSample(srcTex, srcSampler, in.uv);
  let brightness = params.brightnessHue.x;
  let hue_radians = params.brightnessHue.y;

  var color = max(sampled.rgb * brightness, vec3<f32>(0.0));

  if (abs(hue_radians) > 0.0001) {
    var yiq = RGB_TO_YIQ * color;
    let chroma = length(yiq.yz);
    let angle = atan2(yiq.z, yiq.y) + hue_radians;
    yiq.y = chroma * cos(angle);
    yiq.z = chroma * sin(angle);
    color = YIQ_TO_RGB * yiq;
  }

  return vec4<f32>(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)), sampled.a);
}
