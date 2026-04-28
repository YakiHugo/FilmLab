// Film effects: gate weave → breath → damage → vignette → overscan.
// Mirrors FilmEffectsUber.frag. Concatenated with fullscreen + colorSpace libs
// by passes/film/effects.ts.

struct EffectsParams {
  // x=vignette, y=breath, z=damage, w=gateWeave
  flags:      vec4<u32>,
  // x=overscan
  flags2:     vec4<u32>,
  // x=vignetteAmount, y=vignetteMidpoint, z=vignetteRoundness, w=aspectRatio
  vignette:   vec4<f32>,
  // x=breathAmount, y=breathSeed
  breath:     vec4<f32>,
  // x=damageAmount, y=damageSeed
  damage:     vec4<f32>,
  // x=gateWeaveAmount, y=gateWeaveSeed
  gate_weave: vec4<f32>,
  // x=overscanAmount, y=overscanRoundness
  overscan:   vec4<f32>,
};
// 7 * 16 = 112 bytes

@group(0) @binding(0) var src:      texture_2d<f32>;
@group(0) @binding(1) var t_damage: texture_2d<f32>;
@group(0) @binding(2) var t_border: texture_2d<f32>;
@group(0) @binding(3) var smp:      sampler;
@group(0) @binding(4) var<uniform> e: EffectsParams;

fn hash12_e(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, vec3<f32>(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn rounded_rect_mask(uv: vec2<f32>, roundness: f32) -> f32 {
  let centered = abs(uv - vec2<f32>(0.5)) * 2.0;
  let corner   = mix(0.02, 0.28, clamp(roundness, 0.0, 1.0));
  let q        = centered - vec2<f32>(1.0 - corner);
  let outside  = length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - corner;
  return 1.0 - smoothstep(-0.005, 0.03, outside);
}

fn apply_gate_weave(uv: vec2<f32>) -> vec2<f32> {
  let amount    = clamp(e.gate_weave.x, 0.0, 1.0);
  let seed      = e.gate_weave.y * 0.0001;
  let offset_x  = (hash12_e(vec2<f32>(seed, seed * 1.3)) - 0.5) * amount * 0.003;
  let offset_y  = (hash12_e(vec2<f32>(seed * 2.1, seed)) - 0.5) * amount * 0.002;
  let rotation  = (hash12_e(vec2<f32>(seed * 0.7, seed * 1.9)) - 0.5) * amount * 0.001;
  let center    = uv - vec2<f32>(0.5);
  let c_r       = cos(rotation);
  let s_r       = sin(rotation);
  let rotated   = vec2<f32>(center.x * c_r - center.y * s_r,
                             center.x * s_r + center.y * c_r);
  return rotated + vec2<f32>(0.5) + vec2<f32>(offset_x, offset_y);
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  var raw_uv = in.uv;
  var gate_weave_oob = false;

  if (e.flags.w != 0u && e.gate_weave.x > 0.001) {
    raw_uv = apply_gate_weave(in.uv);
    gate_weave_oob = raw_uv.x < 0.0 || raw_uv.x > 1.0 || raw_uv.y < 0.0 || raw_uv.y > 1.0;
  }

  let warped_uv = clamp(raw_uv, vec2<f32>(0.0), vec2<f32>(1.0));
  let sampled   = textureSampleLevel(src, smp, warped_uv, 0.0);
  var color     = sampled.rgb;

  if (gate_weave_oob) {
    var border_color: vec3<f32>;
    if (e.flags2.x != 0u) {
      border_color = textureSampleLevel(t_border, smp, fract(in.uv * vec2<f32>(1.0, 1.5)), 0.0).rgb * 0.08;
    } else {
      border_color = vec3<f32>(0.01);
    }
    color = mix(color, border_color, 0.95);
  }

  if (e.flags.y != 0u && e.breath.x > 0.001) {
    let amount      = clamp(e.breath.x, 0.0, 1.0);
    let seed        = e.breath.y * 0.0001;
    let n0          = hash12_e(vec2<f32>(seed, seed * 1.7));
    let n1          = hash12_e(vec2<f32>(seed * 3.1, seed * 0.91));
    let n2          = hash12_e(vec2<f32>(seed * 1.3, seed * 2.4));
    let seed_offset = vec2<f32>(fract(seed * 0.73), fract(seed * 0.37));
    let spatial_uv  = warped_uv * 0.5 + seed_offset;
    let sp_noise    = hash12_e(floor(spatial_uv * 4.0)) * 0.5 + 0.5;
    let exposure    = (n0 - 0.5) * 0.16 * amount;
    let contrast    = (n1 - 0.5) * 0.22 * amount;
    let local_exp   = exposure * (0.7 + sp_noise * 0.6);
    let local_con   = contrast * (0.8 + sp_noise * 0.4);
    let tint        = vec3<f32>((n2 - 0.5) * 0.035, 0.0, (0.5 - n2) * 0.03) * amount;
    color = color * exp2(local_exp);
    let pivot = 0.18;
    color = pivot * pow(max(color / pivot, vec3<f32>(0.0)), vec3<f32>(1.0 + local_con));
    color = color + tint * (0.8 + sp_noise * 0.4);
  }

  if (e.flags.z != 0u && e.damage.x > 0.001) {
    let amount      = clamp(e.damage.x, 0.0, 1.0);
    let seed_offset = vec2<f32>(
      fract(e.damage.y * 0.00013),
      fract(e.damage.y * 0.00027),
    );
    let damage_uv  = fract(warped_uv * vec2<f32>(1.2, 1.35) + seed_offset);
    let damage_tex = textureSampleLevel(t_damage, smp, damage_uv, 0.0).rgb;
    let dust       = smoothstep(0.92, 1.0, damage_tex.r + hash12_e(damage_uv * 127.0) * 0.12);
    let scratch    = smoothstep(0.8, 1.0, abs(fract((damage_uv.x + seed_offset.x) * 90.0) - 0.5) * 2.0)
                   * smoothstep(0.6, 1.0, damage_tex.g + hash12_e(vec2<f32>(damage_uv.y, damage_uv.x) * 191.0) * 0.2);
    color = mix(color, color * 0.6, dust * amount * 0.55);
    color = color + vec3<f32>(scratch * amount * 0.11);
  }

  if (e.flags.x != 0u && abs(e.vignette.x) >= 0.001) {
    var center = warped_uv - vec2<f32>(0.5);
    center.x   = center.x * mix(1.0, e.vignette.w, e.vignette.z);
    let dist   = length(center) * 2.0;
    let edge   = smoothstep(e.vignette.y, 1.0, dist);
    if (e.vignette.x > 0.0) {
      let darkening = 1.0 - edge * edge * e.vignette.x;
      let cr        = 1.0 - edge * e.vignette.x * 0.15;
      color = mix(vec3<f32>(0.18), color, cr) * darkening;
    } else {
      color = color + vec3<f32>(edge * edge * abs(e.vignette.x) * 0.35);
    }
  }

  if (e.flags2.x != 0u && e.overscan.x > 0.001) {
    let amount       = clamp(e.overscan.x, 0.0, 1.0);
    let frame_mask   = rounded_rect_mask(in.uv, e.overscan.y);
    let edge         = 1.0 - frame_mask;
    let sband_left   = 1.0 - smoothstep(0.02, 0.035, in.uv.x);
    let sband_right  = smoothstep(0.965, 0.98, in.uv.x);
    let hole_left    = 1.0 - smoothstep(0.08, 0.12, abs(fract(in.uv.y * 8.0) - 0.5));
    let hole_right   = 1.0 - smoothstep(0.08, 0.12, abs(fract(in.uv.y * 8.0 + 0.5) - 0.5));
    let sprocket_l   = sband_left * hole_left;
    let sprocket_r   = sband_right * hole_right;
    let sprocket     = clamp(sprocket_l + sprocket_r, 0.0, 1.0);
    let border_tex   = textureSampleLevel(t_border, smp, fract(in.uv * vec2<f32>(1.0, 1.5)), 0.0).rgb;
    let border_color = mix(vec3<f32>(0.015), border_tex * 0.12, 0.45);
    color = mix(color, border_color, edge * amount * 0.92);
    color = mix(color, vec3<f32>(0.0), sprocket * amount * 0.8);
  }

  return vec4<f32>(max(color, vec3<f32>(0.0)), sampled.a);
}
