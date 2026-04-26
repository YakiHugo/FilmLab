// Film print: print stock/density/contrast, CMY color head, color cast,
// print toning. Mirrors FilmPrintUber.frag. Concatenated with fullscreen +
// colorSpace libs by passes/film/print.ts.

struct PrintParams {
  // x=print, y=cmy, z=colorCast, w=toning
  flags:            vec4<u32>,
  // x=printLut
  flags2:           vec4<u32>,
  // x=density, y=contrast, z=warmth, w=stock
  print_params:     vec4<f32>,
  // x=printLutIntensity, y=targetWhiteKelvin
  lut_params:       vec4<f32>,
  // x=cyan, y=magenta, z=yellow
  cmy:              vec4<f32>,
  cast_shadows:     vec4<f32>,
  cast_midtones:    vec4<f32>,
  cast_highlights:  vec4<f32>,
  toning_shadows:   vec4<f32>,
  toning_midtones:  vec4<f32>,
  toning_highlights: vec4<f32>,
  // x=toningStrength
  toning_strength:  vec4<f32>,
};
// 12 * 16 = 192 bytes

@group(0) @binding(0) var src:       texture_2d<f32>;
@group(0) @binding(1) var smp:       sampler;
@group(0) @binding(2) var t_print_lut: texture_3d<f32>;
@group(0) @binding(3) var<uniform> q: PrintParams;

fn resolve_print_stock(stock: f32) -> mat3x3<f32> {
  if (stock > 2.5) {
    return mat3x3<f32>(
      vec3<f32>( 1.02, -0.01, -0.01),
      vec3<f32>(-0.01,  1.02, -0.01),
      vec3<f32>(-0.01, -0.01,  1.02),
    );
  }
  if (stock > 1.5) {
    return mat3x3<f32>(
      vec3<f32>(0.96, 0.02, 0.02),
      vec3<f32>(0.01, 0.98, 0.01),
      vec3<f32>(0.02, 0.02, 0.96),
    );
  }
  if (stock > 0.5) {
    return mat3x3<f32>(
      vec3<f32>(0.99, 0.01,  0.00),
      vec3<f32>(0.01, 1.00, -0.01),
      vec3<f32>(0.00, 0.02,  0.98),
    );
  }
  return mat3x3<f32>(
    vec3<f32>( 1.01, -0.01,  0.00),
    vec3<f32>( 0.00,  1.00,  0.00),
    vec3<f32>(-0.01,  0.01,  1.00),
  );
}

fn kelvin_to_rgb(kelvin: f32) -> vec3<f32> {
  let t = clamp(kelvin, 1000.0, 40000.0) / 100.0;
  var r: f32;
  var g: f32;
  var b: f32;
  if (t <= 66.0) {
    r = 1.0;
    g = clamp((99.4708 * log(max(t, 1.0)) - 161.11957) / 255.0, 0.0, 1.0);
    if (t <= 19.0) {
      b = 0.0;
    } else {
      b = clamp((138.51773 * log(max(t - 10.0, 1.0)) - 305.0448) / 255.0, 0.0, 1.0);
    }
  } else {
    r = clamp((329.69873 * pow(t - 60.0, -0.13320476)) / 255.0, 0.0, 1.0);
    g = clamp((288.12216 * pow(t - 60.0, -0.075514846)) / 255.0, 0.0, 1.0);
    b = 1.0;
  }
  return vec3<f32>(r, g, b);
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let sampled = textureSampleLevel(src, smp, in.uv, 0.0);
  var color = sampled.rgb;

  if (q.flags.x != 0u) {
    color = resolve_print_stock(q.print_params.w) * color;

    let density  = clamp(q.print_params.x, -1.0, 1.0);
    color = color * exp2(-density * 0.8);

    let contrast = clamp(q.print_params.y, -1.0, 1.0);
    let pivot    = 0.18;
    color = pivot * pow(max(color / pivot, vec3<f32>(0.0)), vec3<f32>(1.0 + contrast));

    if (q.flags2.x != 0u && q.print_params.w > 2.5) {
      let base_linear = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
      let hdr_offset  = max(color - vec3<f32>(1.0), vec3<f32>(0.0));
      let lut_size    = f32(textureDimensions(t_print_lut, 0u).x);
      let uvw         = (base_linear * (lut_size - 1.0) + 0.5) / lut_size;
      let lut_color   = textureSampleLevel(t_print_lut, smp, uvw, 0.0).rgb;
      let mixed       = mix(base_linear, lut_color, clamp(q.lut_params.x, 0.0, 1.0));
      color = mixed + hdr_offset;
    }

    let target_white = srgb_to_linear(kelvin_to_rgb(clamp(q.lut_params.y, 5500.0, 6500.0)));
    let d65_white    = srgb_to_linear(kelvin_to_rgb(6500.0));
    let white_scale  = clamp(d65_white / max(target_white, vec3<f32>(0.1)), vec3<f32>(0.7), vec3<f32>(1.5));
    color = color * white_scale;

    let warmth = clamp(q.print_params.z, -1.0, 1.0);
    color = color + vec3<f32>(warmth * 0.05, warmth * 0.012, -warmth * 0.03);
  }

  if (q.flags.y != 0u) {
    let cyan    = sign(q.cmy.x) * pow(abs(clamp(q.cmy.x, -1.0, 1.0)), 0.9);
    let magenta = sign(q.cmy.y) * pow(abs(clamp(q.cmy.y, -1.0, 1.0)), 0.9);
    let yellow  = sign(q.cmy.z) * pow(abs(clamp(q.cmy.z, -1.0, 1.0)), 0.9);
    let cmy_mat = mat3x3<f32>(
      vec3<f32>(1.0 - cyan * 0.35,  cyan * 0.06,    cyan * 0.05),
      vec3<f32>(magenta * 0.08,     1.0 - magenta * 0.38, magenta * 0.06),
      vec3<f32>(yellow * 0.05,      yellow * 0.08,  1.0 - yellow * 0.32),
    );
    let exp_comp = max(0.75, 1.0 - (abs(cyan) + abs(magenta) + abs(yellow)) * 0.04);
    color = max(cmy_mat * color, vec3<f32>(0.0)) * exp_comp;
  }

  if (q.flags.z != 0u) {
    let lum        = max(luminance_rec709(color), 0.0);
    let lum_norm   = lum / (1.0 + lum);
    let sh_mask    = 1.0 - smoothstep(0.0, 0.34, lum_norm);
    let hi_mask    = smoothstep(0.46, 0.86, lum_norm);
    let mid_mask   = clamp(1.0 - sh_mask - hi_mask, 0.0, 1.0);
    let hi_energy  = 1.0 + log2(1.0 + max(lum - 1.0, 0.0)) * 0.35;
    color = color + q.cast_shadows.xyz * sh_mask
                  + q.cast_midtones.xyz * mid_mask
                  + q.cast_highlights.xyz * hi_mask * hi_energy;
  }

  if (q.flags.w != 0u && q.toning_strength.x > 0.001) {
    let lum        = max(luminance_rec709(color), 0.0);
    let lum_norm   = lum / (1.0 + lum);
    let sh_mask    = 1.0 - smoothstep(0.0, 0.36, lum_norm);
    let hi_mask    = smoothstep(0.44, 0.86, lum_norm);
    let mid_mask   = clamp(1.0 - sh_mask - hi_mask, 0.0, 1.0);
    let hi_energy  = 1.0 + log2(1.0 + max(lum - 1.0, 0.0)) * 0.3;
    let tone       = q.toning_shadows.xyz * sh_mask
                   + q.toning_midtones.xyz * mid_mask
                   + q.toning_highlights.xyz * hi_mask * hi_energy;
    color = color + tone * clamp(q.toning_strength.x, 0.0, 1.0);
  }

  return vec4<f32>(max(color, vec3<f32>(0.0)), sampled.a);
}
