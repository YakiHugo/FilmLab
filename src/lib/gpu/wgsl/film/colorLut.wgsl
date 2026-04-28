// Film color LUT: color matrix → 3D LUT (+ mix) → custom 3D LUT.
// Mirrors FilmColorLutUber.frag. Concatenated with fullscreen + colorSpace libs
// by passes/film/colorLut.ts.

struct ColorLutParams {
  // x=colorMatrix, y=lut, z=lutMix, w=customLut
  flags:      vec4<u32>,
  // colorMatrix columns (xyz used, w padding)
  col0:       vec4<f32>,
  col1:       vec4<f32>,
  col2:       vec4<f32>,
  // x=lutIntensity, y=lutMixFactor, z=customLutIntensity
  lut_params: vec4<f32>,
};
// 5 * 16 = 80 bytes

@group(0) @binding(0) var src:         texture_2d<f32>;
@group(0) @binding(1) var smp:         sampler;
@group(0) @binding(2) var t_lut:       texture_3d<f32>;
@group(0) @binding(3) var t_lut_blend: texture_3d<f32>;
@group(0) @binding(4) var t_custom:    texture_3d<f32>;
@group(0) @binding(5) var<uniform> p:  ColorLutParams;

fn sample_3d_lut(t: texture_3d<f32>, c: vec3<f32>) -> vec3<f32> {
  let clamped = clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
  let lut_size = f32(textureDimensions(t, 0u).x);
  let uvw = (clamped * (lut_size - 1.0) + 0.5) / lut_size;
  return textureSampleLevel(t, smp, uvw, 0.0).rgb;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let sampled = textureSampleLevel(src, smp, in.uv, 0.0);
  var color = max(sampled.rgb, vec3<f32>(0.0));

  if (p.flags.x != 0u) {
    let m = mat3x3<f32>(p.col0.xyz, p.col1.xyz, p.col2.xyz);
    color = max(m * color, vec3<f32>(0.0));
  }

  if (p.flags.y != 0u && p.lut_params.x > 0.0) {
    let base_linear = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
    let hdr_offset  = max(color - vec3<f32>(1.0), vec3<f32>(0.0));
    let base_srgb   = linear_to_srgb(base_linear);
    var lut_mapped  = sample_3d_lut(t_lut, base_srgb);
    if (p.flags.z != 0u) {
      let blend_mapped = sample_3d_lut(t_lut_blend, base_srgb);
      lut_mapped = mix(lut_mapped, blend_mapped, clamp(p.lut_params.y, 0.0, 1.0));
    }
    let lut_color = mix(base_srgb, lut_mapped, clamp(p.lut_params.x, 0.0, 1.0));
    color = srgb_to_linear(max(lut_color, vec3<f32>(0.0))) + hdr_offset;
  }

  if (p.flags.w != 0u && p.lut_params.z > 0.0) {
    let base_linear   = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
    let hdr_offset    = max(color - vec3<f32>(1.0), vec3<f32>(0.0));
    let base_srgb     = linear_to_srgb(base_linear);
    let custom_mapped = sample_3d_lut(t_custom, base_srgb);
    let lut_color     = mix(base_srgb, custom_mapped, clamp(p.lut_params.z, 0.0, 1.0));
    color = srgb_to_linear(max(lut_color, vec3<f32>(0.0))) + hdr_offset;
  }

  return vec4<f32>(max(color, vec3<f32>(0.0)), sampled.a);
}
