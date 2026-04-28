// Master adjustment: exposure, LMS white balance, contrast, tonal range,
// curves, OKLab HSL, 3-way color grading, dehaze. Mirrors
// `shaders/MasterAdjustment.frag`. Concatenated with fullscreen + color space
// libs by `passes/develop/master.ts`.

struct MasterParams {
  whiteBalanceLmsScale: vec4<f32>,         // xyz used
  tonalRange: vec4<f32>,                   // (highlights, shadows, whites, blacks)
  curve: vec4<f32>,                        // (curveHi, curveLights, curveDarks, curveShadows)
  colorGradeShadows: vec4<f32>,            // xyz: (hueDeg, sat, luminance)
  colorGradeMidtones: vec4<f32>,
  colorGradeHighlights: vec4<f32>,
  // (exposure, contrast, hueShiftDeg, saturation)
  scalars0: vec4<f32>,
  // (vibrance, luminance, colorGradeBlend, colorGradeBalance)
  scalars1: vec4<f32>,
  // (dehaze, _, _, _)
  scalars2: vec4<f32>,
};

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var<uniform> params: MasterParams;

fn grade_tint(grade: vec3<f32>) -> vec3<f32> {
  let hue = fract((grade.x + 180.0) / 360.0);
  let sat = clamp(grade.y, 0.0, 1.0);
  let rgb = hsv_to_rgb_fast(vec3<f32>(hue, 1.0, 1.0));
  return (rgb - vec3<f32>(0.5)) * sat;
}

fn apply_color_grading(color_in: vec3<f32>, lum: f32) -> vec3<f32> {
  let blend = clamp(params.scalars1.z, 0.0, 1.0);
  if (blend < 0.0001) {
    return color_in;
  }
  let balance = clamp(params.scalars1.w, -1.0, 1.0);
  let shadowEdge = clamp(0.45 + balance * 0.2, 0.2, 0.7);
  let highlightEdge = clamp(0.55 + balance * 0.2, 0.3, 0.8);
  let wShadows = 1.0 - smoothstep(0.05, shadowEdge, lum);
  let wHighlights = smoothstep(highlightEdge, 0.95, lum);
  let wMidtones = clamp(1.0 - wShadows - wHighlights, 0.0, 1.0);

  let tint = grade_tint(params.colorGradeShadows.xyz) * wShadows
           + grade_tint(params.colorGradeMidtones.xyz) * wMidtones
           + grade_tint(params.colorGradeHighlights.xyz) * wHighlights;
  var color = color_in + tint * blend * 0.45;

  let luminanceShift = (params.colorGradeShadows.z * wShadows
                     + params.colorGradeMidtones.z * wMidtones
                     + params.colorGradeHighlights.z * wHighlights) * blend * 0.25;
  color = color * (1.0 + luminanceShift);
  return max(color, vec3<f32>(0.0));
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  var color = textureSample(src, smp, in.uv).rgb;

  let exposure = params.scalars0.x;
  let contrast = params.scalars0.y;
  let hueShift = params.scalars0.z;
  let saturation = params.scalars0.w;
  let vibrance = params.scalars1.x;
  let luminance = params.scalars1.y;
  let dehaze = params.scalars2.x;

  // Step 1: Exposure (linear).
  color = color * exp2(exposure);

  // Step 2: LMS white balance.
  color = white_balance_lms(color, params.whiteBalanceLmsScale.xyz);

  // Step 3: Contrast around 0.18 mid-gray.
  let pivot = 0.18;
  color = pivot * pow(max(color / pivot, vec3<f32>(0.0)), vec3<f32>(1.0 + contrast * 0.01));

  // Step 4: Tonal range.
  var lum = luminance_rec709(color);
  let hiMask = smoothstep(0.5, 1.0, lum);
  let shMask = 1.0 - smoothstep(0.0, 0.5, lum);
  let whMask = smoothstep(0.75, 1.0, lum);
  let blMask = 1.0 - smoothstep(0.0, 0.25, lum);
  let tonalDelta = hiMask * params.tonalRange.x * 0.01
                 + shMask * params.tonalRange.y * 0.01
                 + whMask * params.tonalRange.z * 0.01
                 + blMask * params.tonalRange.w * 0.01;
  color = color + color * tonalDelta;

  // Step 5: Curves (4-segment additive).
  lum = luminance_rec709(color);
  let curveDelta = smoothstep(0.7, 1.0, lum) * params.curve.x * 0.01
                 + smoothstep(0.4, 0.7, lum) * (1.0 - smoothstep(0.7, 0.85, lum)) * params.curve.y * 0.01
                 + smoothstep(0.15, 0.4, lum) * (1.0 - smoothstep(0.4, 0.55, lum)) * params.curve.z * 0.01
                 + (1.0 - smoothstep(0.1, 0.3, lum)) * params.curve.w * 0.01;
  color = color + color * curveDelta;

  // Step 6: OKLab HSL.
  var lab = rgb_to_oklab(color);
  let angle = hueShift * 3.14159265 / 180.0;
  let ca = cos(angle);
  let sa = sin(angle);
  lab = vec3<f32>(lab.x, lab.y * ca - lab.z * sa, lab.y * sa + lab.z * ca);
  lab = vec3<f32>(lab.x, lab.y * (1.0 + saturation * 0.01), lab.z * (1.0 + saturation * 0.01));
  let chroma = length(lab.yz);
  let vibranceBoost = vibrance * 0.01 * (1.0 - smoothstep(0.0, 0.15, chroma));
  lab = vec3<f32>(lab.x, lab.y * (1.0 + vibranceBoost), lab.z * (1.0 + vibranceBoost));
  lab = vec3<f32>(lab.x * (1.0 + luminance * 0.01), lab.y, lab.z);
  color = oklab_to_rgb(lab);
  color = max(color, vec3<f32>(0.0));

  // Step 7: 3-way color grading.
  lum = luminance_rec709(color);
  color = apply_color_grading(color, lum);

  // Step 8: Dehaze.
  if (abs(dehaze) > 0.001) {
    let haze = dehaze * 0.01;
    let darkChannel = min(color.r, min(color.g, color.b));
    let t = clamp(1.0 - haze * darkChannel * 2.0, 0.1, 2.0);
    let atmosphere = vec3<f32>(1.0);
    color = (color - atmosphere * (1.0 - t)) / t;
    color = max(color, vec3<f32>(0.0));
  }

  // Step 9: Linear output.
  color = max(color, vec3<f32>(0.0));
  return vec4<f32>(color, 1.0);
}
