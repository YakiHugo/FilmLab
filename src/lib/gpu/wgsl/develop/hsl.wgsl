// HSL pass — 8-channel hue/saturation/luminance in OKLab space, plus
// 3-primary calibration and B&W mixer. Mirrors HSL.frag.
// Concatenated with fullscreen + colorSpace libs by passes/develop/hsl.ts.

struct HslParams {
  // u_hue[0..3] and [4..7]
  hue0123:    vec4<f32>,
  hue4567:    vec4<f32>,
  // u_saturation[0..3] and [4..7]
  sat0123:    vec4<f32>,
  sat4567:    vec4<f32>,
  // u_luminance[0..3] and [4..7]
  lum0123:    vec4<f32>,
  lum4567:    vec4<f32>,
  // u_bwMix xyz + padding
  bwMix_pad:  vec4<f32>,
  // u_calibrationHue[0..2] + padding
  calHue_pad: vec4<f32>,
  // u_calibrationSaturation[0..2] + padding
  calSat_pad: vec4<f32>,
  // x=enabled, y=bwEnabled, z=calibrationEnabled
  flags:      vec4<u32>,
};
// 10 * 16 = 160 bytes

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var<uniform> params: HslParams;

fn gamut_map_soft_clip(color: vec3<f32>) -> vec3<f32> {
  let minC = min(color.r, min(color.g, color.b));
  let maxC = max(color.r, max(color.g, color.b));
  if (minC >= 0.0 && maxC <= 1.0) {
    return color;
  }
  let lum = luminance_rec709(color);
  let chroma = color - vec3<f32>(lum);
  var scale = 1.0f;
  let upperDelta = maxC - lum;
  let lowerDelta = lum - minC;
  if (maxC > 1.0 && upperDelta > 1.0e-5) {
    scale = min(scale, (1.0 - lum) / upperDelta);
  }
  if (minC < 0.0 && lowerDelta > 1.0e-5) {
    scale = min(scale, lum / lowerDelta);
  }
  let excursion = max(maxC - 1.0, -minC);
  let knee = smoothstep(0.0, 0.25, excursion);
  return vec3<f32>(lum) + chroma * mix(1.0f, scale, knee);
}

fn hue_center(i: i32) -> f32 {
  switch i {
    case 0: { return 0.0; }
    case 1: { return 30.0; }
    case 2: { return 60.0; }
    case 3: { return 120.0; }
    case 4: { return 180.0; }
    case 5: { return 240.0; }
    case 6: { return 285.0; }
    default: { return 320.0; }
  }
}

fn hue_distance(a: f32, b: f32) -> f32 {
  let d = abs(a - b);
  return min(d, 360.0 - d);
}

fn hue_weight(hue_deg: f32, center_deg: f32) -> f32 {
  return 1.0 - smoothstep(18.0, 55.0, hue_distance(hue_deg, center_deg));
}

fn calibration_center(i: i32) -> f32 {
  switch i {
    case 0: { return 12.0; }
    case 1: { return 120.0; }
    default: { return 240.0; }
  }
}

fn calibration_weight(hue_deg: f32, center_deg: f32) -> f32 {
  return 1.0 - smoothstep(8.0, 35.0, hue_distance(hue_deg, center_deg));
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let color = max(textureSample(src, smp, in.uv).rgb, vec3<f32>(0.0));
  if (params.flags.x == 0u) {
    return vec4<f32>(color, 1.0);
  }

  var lab = rgb_to_oklab(max(color, vec3<f32>(0.0)));
  let ab = lab.yz;
  let chroma = length(ab);
  var hue_deg = 0.0f;
  if (chroma > 1.0e-5) {
    hue_deg = degrees(atan2(ab.y, ab.x));
    if (hue_deg < 0.0) {
      hue_deg += 360.0;
    }
  }

  // Load 8-channel arrays into function-scope vars for dynamic loop indexing.
  var hue = array<f32, 8>(
    params.hue0123.x, params.hue0123.y, params.hue0123.z, params.hue0123.w,
    params.hue4567.x, params.hue4567.y, params.hue4567.z, params.hue4567.w,
  );
  var sat = array<f32, 8>(
    params.sat0123.x, params.sat0123.y, params.sat0123.z, params.sat0123.w,
    params.sat4567.x, params.sat4567.y, params.sat4567.z, params.sat4567.w,
  );
  var lum = array<f32, 8>(
    params.lum0123.x, params.lum0123.y, params.lum0123.z, params.lum0123.w,
    params.lum4567.x, params.lum4567.y, params.lum4567.z, params.lum4567.w,
  );

  let chroma_weight = smoothstep(0.01, 0.08, chroma);
  var weight_sum = 0.0f;
  var hue_shift = 0.0f;
  var sat_delta = 0.0f;
  var lum_delta = 0.0f;
  for (var i = 0; i < 8; i += 1) {
    let w = hue_weight(hue_deg, hue_center(i)) * chroma_weight;
    weight_sum += w;
    hue_shift += hue[i] * w;
    sat_delta += sat[i] * w;
    lum_delta += lum[i] * w;
  }
  if (weight_sum > 1.0e-5) {
    hue_shift /= weight_sum;
    sat_delta /= weight_sum;
    lum_delta /= weight_sum;
  }

  let hue_shift_deg = hue_shift * 0.45;
  let sat_scale = max(0.0f, 1.0 + sat_delta * 0.01);
  let lum_scale = max(0.0f, 1.0 + lum_delta * 0.01);

  var cur_ab = ab;
  if (chroma > 1.0e-5) {
    let hue_rad = atan2(ab.y, ab.x) + radians(hue_shift_deg);
    cur_ab = vec2<f32>(cos(hue_rad), sin(hue_rad)) * (chroma * sat_scale);
  } else {
    cur_ab = ab * sat_scale;
  }
  lab = vec3<f32>(max(lab.x * lum_scale, 0.0), cur_ab.x, cur_ab.y);

  if (params.flags.z != 0u) {
    let cal_ab = lab.yz;
    let cal_chroma = length(cal_ab);
    if (cal_chroma > 1.0e-5) {
      let cal_hue_rad = atan2(cal_ab.y, cal_ab.x);
      var cal_hue_deg = degrees(cal_hue_rad);
      if (cal_hue_deg < 0.0) {
        cal_hue_deg += 360.0;
      }
      var cal_hue = array<f32, 3>(params.calHue_pad.x, params.calHue_pad.y, params.calHue_pad.z);
      var cal_sat = array<f32, 3>(params.calSat_pad.x, params.calSat_pad.y, params.calSat_pad.z);
      var cal_weight_sum = 0.0f;
      var cal_hue_shift = 0.0f;
      var cal_sat_delta = 0.0f;
      for (var i = 0; i < 3; i += 1) {
        let w = calibration_weight(cal_hue_deg, calibration_center(i));
        cal_weight_sum += w;
        cal_hue_shift += cal_hue[i] * w;
        cal_sat_delta += cal_sat[i] * w;
      }
      if (cal_weight_sum > 1.0e-5) {
        cal_hue_shift /= cal_weight_sum;
        cal_sat_delta /= cal_weight_sum;
      }
      let calibrated_hue = cal_hue_rad + radians(cal_hue_shift * 0.35);
      let calibrated_chroma = cal_chroma * max(0.0f, 1.0 + cal_sat_delta * 0.01);
      lab = vec3<f32>(lab.x, cos(calibrated_hue) * calibrated_chroma, sin(calibrated_hue) * calibrated_chroma);
    }
  }

  var adjusted = gamut_map_soft_clip(oklab_to_rgb(lab));
  if (params.flags.y != 0u) {
    let bw_weights = max(params.bwMix_pad.xyz, vec3<f32>(0.0));
    let bw_sum = max(bw_weights.r + bw_weights.g + bw_weights.b, 1.0e-5);
    adjusted = vec3<f32>(dot(adjusted, bw_weights / bw_sum));
  }
  return vec4<f32>(adjusted, 1.0);
}
