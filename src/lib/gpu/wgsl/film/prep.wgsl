// Film prep: expand → highlight compression → developer → tone response.
// Mirrors FilmPrepUber.frag. Concatenated with fullscreen + colorSpace libs
// by passes/film/prep.ts.

struct PrepParams {
  // x=expand, y=compression, z=developer, w=tone
  flags:     vec4<u32>,
  // x=blackPoint, y=whitePoint
  expand:    vec4<f32>,
  // x=highlightRolloff, y=shoulderWidth
  compr:     vec4<f32>,
  // x=developerContrast, y=developerGamma, z=pushPullEv
  developer: vec4<f32>,
  // xyz=colorSeparation
  color_sep: vec4<f32>,
  // x=shoulder, y=toe, z=gamma
  tone:      vec4<f32>,
};
// 6 * 16 = 96 bytes

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var<uniform> p: PrepParams;

fn compress_highlight(x: f32, rolloff: f32, shoulder_width: f32) -> f32 {
  let start = clamp(1.0 - shoulder_width, 0.35, 0.98);
  if (x <= start) { return x; }
  let t = clamp((x - start) / max(1.0 - start, 0.001), 0.0, 4.0);
  let k = max(0.1, rolloff * 4.0 + 0.1);
  let comp = start + (1.0 - start) * (1.0 - exp(-t * k));
  return mix(x, comp, clamp(rolloff, 0.0, 1.0));
}

fn tone_channel(x: f32, shoulder: f32, toe: f32, gamma: f32) -> f32 {
  var v = pow(max(x, 0.0), gamma);
  let k = shoulder * 2.0;
  let comp = v * (1.0 + k) / (v + k + 0.0001);
  v = mix(v, comp, shoulder);
  let toe_gamma = 1.0 / (1.0 + toe);
  let lifted = pow(max(v, 0.0), toe_gamma);
  v = mix(v, lifted, toe);
  return max(v, 0.0);
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let sampled = textureSampleLevel(src, smp, in.uv, 0.0);
  var color = sampled.rgb;
  let push_pull = clamp(p.developer.z, -2.0, 2.0);

  if (p.flags.x != 0u) {
    let black = clamp(p.expand.x, 0.0, 0.99);
    let white = clamp(p.expand.y, black + 0.001, 1.5);
    color = (color - vec3<f32>(black)) / max(white - black, 0.001);
  }

  if (p.flags.y != 0u && p.compr.x > 0.001) {
    color.x = compress_highlight(color.x, p.compr.x, p.compr.y);
    color.y = compress_highlight(color.y, p.compr.x, p.compr.y);
    color.z = compress_highlight(color.z, p.compr.x, p.compr.y);
  }

  if (p.flags.z != 0u) {
    let sep = max(p.color_sep.xyz, vec3<f32>(0.0));
    color = color * sep;
    let dev_exposure = exp2(push_pull * 0.16);
    color = color * dev_exposure;
    let gamma_val = max(0.25, p.developer.y - push_pull * 0.06);
    color = pow(max(color, vec3<f32>(0.0)), vec3<f32>(1.0 / gamma_val));
    let contrast = clamp(p.developer.x + push_pull * 0.08, -1.0, 1.0);
    let pivot = 0.18;
    color = pivot * pow(max(color / pivot, vec3<f32>(0.0)), vec3<f32>(1.0 + contrast));
  }

  if (p.flags.w != 0u) {
    let lum = luminance_rec709(color);
    let mapped = tone_channel(lum, p.tone.x, p.tone.y, max(0.5, p.tone.z - push_pull * 0.04));
    if (lum <= 1e-5) {
      color = vec3<f32>(mapped);
    } else {
      color = color * (mapped / lum);
    }
  }

  return vec4<f32>(max(color, vec3<f32>(0.0)), sampled.a);
}
