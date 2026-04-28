// Film grain: blue-noise model and procedural crystal model.
// Combines FilmGrain.frag + ProceduralGrain.frag into one shader.
// model < 0.5 = blue noise; model >= 0.5 = procedural.
// Concatenated with fullscreen + colorSpace libs by passes/film/grain.ts.

struct GrainParams {
  // x=enabled, y=isColor
  flags:       vec4<u32>,
  // x=amount, y=size, z=roughness, w=shadowBias
  params0:     vec4<f32>,
  // x=seed, y=model
  params1:     vec4<f32>,
  // x=texWidth, y=texHeight
  tex_size:    vec4<f32>,
  // x=crystalDensity, y=crystalSizeMean, z=crystalSizeVariance, w=scannerMTF
  procedural:  vec4<f32>,
  // xyz=colorSeparation, w=filmFormat
  color_sep:   vec4<f32>,
};
// 6 * 16 = 96 bytes

@group(0) @binding(0) var src:        texture_2d<f32>;
@group(0) @binding(1) var t_blue_noise: texture_2d<f32>;
@group(0) @binding(2) var smp:        sampler;
@group(0) @binding(3) var<uniform> g: GrainParams;

fn hash12(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, vec3<f32>(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn crystal_cell(uv: vec2<f32>, cell_scale: f32, variance: f32, seed: f32) -> f32 {
  let grid = uv * cell_scale;
  let base = floor(grid);
  let frac_part = fract(grid);
  var min_dist = 10.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let offset = vec2<f32>(f32(x), f32(y));
      let cell   = base + offset;
      let jx     = hash12(cell + vec2<f32>(seed, seed * 0.61));
      let jy     = hash12(vec2<f32>(cell.y, cell.x) + vec2<f32>(seed * 0.37, seed * 0.91));
      let point  = offset + vec2<f32>(jx, jy);
      let delta  = point - frac_part;
      min_dist   = min(min_dist, dot(delta, delta));
    }
  }
  let softness = mix(0.8, 3.0, clamp(variance, 0.0, 1.0));
  return exp(-min_dist * softness) - 0.5;
}

fn procedural_grain(uv: vec2<f32>, density: f32, size_mean: f32, size_var: f32, seed: f32) -> f32 {
  let format_scale  = mix(2.6, 0.75, clamp(g.color_sep.w / 3.0, 0.0, 1.0));
  let density_scale = mix(4.0, 16.0, clamp(density, 0.0, 1.0)) * format_scale;
  let size_scale    = mix(1.8, 0.55, clamp(size_mean, 0.0, 1.0));
  return crystal_cell(uv * size_scale, density_scale, size_var, seed);
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let sampled = textureSampleLevel(src, smp, in.uv, 0.0);
  var color = sampled.rgb;

  if (g.flags.x != 0u && g.params0.x > 0.0) {
    let grain_scale = mix(3.0, 0.55, g.params0.y);
    let seed_offset = vec2<f32>(
      fract(g.params1.x * 0.000123),
      fract(g.params1.x * 0.000217),
    );
    let noise_uv   = fract((in.uv * g.tex_size.xy / 64.0) * grain_scale + seed_offset);
    let blue_noise = textureSampleLevel(t_blue_noise, smp, noise_uv, 0.0);

    let lum            = max(luminance_rec709(color), 0.0);
    let lum_compressed = lum / (1.0 + lum);
    let shadow_weight  = 1.0 + (1.0 - lum_compressed) * g.params0.w;
    let black_floor    = smoothstep(0.003, 0.03, lum);
    let hi_weight      = 1.0 / (1.0 + max(lum - 1.0, 0.0) * 0.55);

    var mono_noise: f32;
    if (g.params1.y < 0.5) {
      // Blue noise model
      let coarse  = blue_noise.r - 0.5;
      let fine    = blue_noise.g - 0.5;
      mono_noise  = mix(coarse, fine, clamp(g.params0.z, 0.0, 1.0));
      if (g.flags.y != 0u) {
        let blue_ch = hash12(noise_uv * 127.0 + vec2<f32>(0.31, 0.67)) - 0.5;
        let col_off = vec3<f32>(blue_noise.b - 0.5, blue_noise.a - 0.5, blue_ch);
        let ch_gain = vec3<f32>(1.0) + col_off * vec3<f32>(0.14, 0.14, 0.17);
        let ns      = mono_noise * g.params0.x * 0.55 * shadow_weight * black_floor * hi_weight;
        color = color + ns * ch_gain;
      } else {
        let ns = mono_noise * g.params0.x * 0.55 * shadow_weight * black_floor * hi_weight;
        color = color + vec3<f32>(ns);
      }
    } else {
      // Procedural crystal model
      let mtf = mix(0.75, 1.3, clamp(g.procedural.w, 0.0, 1.0));
      let pgrain_uv = in.uv + seed_offset;
      mono_noise = procedural_grain(
        pgrain_uv,
        g.procedural.x,
        g.procedural.y,
        g.procedural.z,
        g.params1.x * 0.000013,
      );
      mono_noise = mix(mono_noise, mix(blue_noise.r - 0.5, blue_noise.b - 0.5, 0.5), 0.2);
      if (g.flags.y != 0u) {
        let sep      = max(g.color_sep.xyz, vec3<f32>(0.001));
        let ch_noise = vec3<f32>(
          blue_noise.b - 0.5,
          blue_noise.a - 0.5,
          (blue_noise.r + blue_noise.g) * 0.5 - 0.5,
        );
        let rgb_noise = (vec3<f32>(mono_noise) + ch_noise * vec3<f32>(0.42)) * sep;
        color = color + rgb_noise * (g.params0.x * shadow_weight * black_floor * hi_weight * mtf);
      } else {
        let ns = mono_noise * g.params0.x * 0.6 * shadow_weight * mtf * black_floor * hi_weight;
        color = color + vec3<f32>(ns);
      }
    }
  }

  return vec4<f32>(max(color, vec3<f32>(0.0)), sampled.a);
}
