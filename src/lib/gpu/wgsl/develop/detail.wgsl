// Detail pass — texture enhancement, clarity, sharpening, and in-pass noise
// reduction. All sampling is in uniform CF (u_enabled / sharpen / nrLuma
// guards are all uniform-buffer-derived). Mirrors Detail.frag.
// Concatenated with fullscreen + colorSpace libs by passes/develop/detail.ts.

struct DetailParams {
  // xy=texelSize (1/W, 1/H), z=shortEdgePx (0 = derive from texelSize), w=pad
  texelSize_shortEdge_pad: vec4<f32>,
  // x=texture, y=clarity, z=sharpening, w=sharpenRadius
  scalars0: vec4<f32>,
  // x=sharpenDetail, y=masking, z=noiseReduction, w=colorNoiseReduction
  scalars1: vec4<f32>,
  // x=enabled
  flags: vec4<u32>,
};
// 4 * 16 = 64 bytes

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var<uniform> params: DetailParams;

fn sample_cross_blur(uv: vec2<f32>, texel: vec2<f32>, radius_px: f32) -> vec3<f32> {
  let dx = vec2<f32>(texel.x * radius_px, 0.0);
  let dy = vec2<f32>(0.0, texel.y * radius_px);
  let north  = textureSample(src, smp, uv - dy).rgb;
  let south  = textureSample(src, smp, uv + dy).rgb;
  let east   = textureSample(src, smp, uv + dx).rgb;
  let west   = textureSample(src, smp, uv - dx).rgb;
  let center = textureSample(src, smp, uv).rgb;
  return (center * 4.0 + north + south + east + west) / 8.0;
}

fn sample_ring_blur(uv: vec2<f32>, texel: vec2<f32>, radius_px: f32) -> vec3<f32> {
  let dx  = vec2<f32>(texel.x * radius_px, 0.0);
  let dy  = vec2<f32>(0.0, texel.y * radius_px);
  let ddx = dx * 0.70710678;
  let ddy = dy * 0.70710678;
  let p0 = textureSample(src, smp, uv + dx).rgb;
  let p1 = textureSample(src, smp, uv - dx).rgb;
  let p2 = textureSample(src, smp, uv + dy).rgb;
  let p3 = textureSample(src, smp, uv - dy).rgb;
  let p4 = textureSample(src, smp, uv + ddx + ddy).rgb;
  let p5 = textureSample(src, smp, uv + ddx - ddy).rgb;
  let p6 = textureSample(src, smp, uv - ddx + ddy).rgb;
  let p7 = textureSample(src, smp, uv - ddx - ddy).rgb;
  return (p0 + p1 + p2 + p3 + p4 + p5 + p6 + p7) * 0.125;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let center = textureSample(src, smp, in.uv).rgb;
  if (params.flags.x == 0u) {
    return vec4<f32>(center, 1.0);
  }

  let texel = params.texelSize_shortEdge_pad.xy;
  let short_edge_raw = params.texelSize_shortEdge_pad.z;
  var short_edge_px: f32;
  if (short_edge_raw > 0.0) {
    short_edge_px = short_edge_raw;
  } else {
    let max_texel = max(texel.x, texel.y);
    short_edge_px = select(1.0 / max_texel, 1.0, max_texel <= 0.0);
  }
  short_edge_px = max(short_edge_px, 1.0);

  let sharpen_radius_01 = clamp(params.scalars0.w * 0.01, 0.0, 1.0);
  let sharpen_radius = mix(0.8, 2.4, sharpen_radius_01);
  let medium_radius_px = max(1.0, short_edge_px * 0.008);
  let coarse_radius_px = max(medium_radius_px + 0.5, short_edge_px * 0.03);

  let blur_fine   = sample_cross_blur(in.uv, texel, sharpen_radius);
  let blur_medium = sample_ring_blur(in.uv, texel, medium_radius_px);
  let blur_coarse = sample_ring_blur(in.uv, texel, coarse_radius_px);
  let blur_clarity = mix(blur_medium, blur_coarse, 0.55);

  let hp_fine   = center - blur_fine;
  let hp_coarse = center - blur_clarity;

  let lum_center   = luminance_rec709(center);
  let lum_blur_fine = luminance_rec709(blur_fine);
  let edge_strength = abs(lum_center - lum_blur_fine);

  var color = center;

  color += hp_fine * (params.scalars0.x * 0.01) * 0.75;

  let lum_coarse = luminance_rec709(hp_coarse);
  color += vec3<f32>(lum_coarse * (params.scalars0.y * 0.01) * 0.95);

  let sharpen = clamp(params.scalars0.z * 0.01, 0.0, 1.0);
  if (sharpen > 0.0) {
    let detail_gain    = mix(0.55, 1.75, clamp(params.scalars1.x * 0.01, 0.0, 1.0));
    let mask_threshold = mix(0.0, 0.28, clamp(params.scalars1.y * 0.01, 0.0, 1.0));
    let edge_mask = smoothstep(mask_threshold, mask_threshold + 0.18, edge_strength * 4.0);
    color += hp_fine * sharpen * detail_gain * edge_mask;
  }

  let nr_luma   = clamp(params.scalars1.z * 0.01, 0.0, 1.0) * 0.35;
  let nr_chroma = clamp(params.scalars1.w * 0.01, 0.0, 1.0) * 0.35;
  if (nr_luma > 0.0 || nr_chroma > 0.0) {
    let soft       = mix(blur_fine, blur_medium, 0.45);
    let lum_color  = luminance_rec709(color);
    let lum_soft   = luminance_rec709(soft);
    let flat_mask  = 1.0 - smoothstep(0.02, 0.14, edge_strength * 3.0);
    let out_luma   = mix(lum_color, lum_soft, nr_luma * flat_mask);
    let out_chroma = mix(color - vec3<f32>(lum_color), soft - vec3<f32>(lum_soft), nr_chroma * flat_mask);
    color = vec3<f32>(out_luma) + out_chroma;
  }

  return vec4<f32>(max(color, vec3<f32>(0.0)), 1.0);
}
