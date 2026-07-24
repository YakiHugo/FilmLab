// Curve pass — point curve LUT lookup in sRGB space. Two-stage:
// 1. Composite curve (LUT.r) applied to all channels.
// 2. Per-channel curves (LUT.g=red, LUT.b=green, LUT.a=blue).
// HDR content above 1.0 is passed through unchanged. Mirrors Curve.frag.
// Concatenated with fullscreen + colorSpace libs by passes/develop/curve.ts.

struct CurveParams {
  // x=enabled
  flags: vec4<u32>,
};
// 1 * 16 = 16 bytes

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
// 256x1 RGBA16F LUT; R=composite, G=red, B=green, A=blue channel curves.
@group(0) @binding(2) var curveLut: texture_2d<f32>;
@group(0) @binding(3) var<uniform> params: CurveParams;

fn lut_lookup(t: f32) -> vec4<f32> {
  // +0.5 centers the sample in each texel, matching the WebGL2 reference.
  let u = (clamp(t, 0.0, 1.0) * 255.0 + 0.5) / 256.0;
  return textureSampleLevel(curveLut, smp, vec2<f32>(u, 0.5), 0.0);
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let colorLinear = max(textureSample(src, smp, in.uv).rgb, vec3<f32>(0.0));
  if (params.flags.x == 0u) {
    return vec4<f32>(colorLinear, 1.0);
  }

  let color = linear_to_srgb(colorLinear);

  // Stage 1: composite curve.
  let r1 = lut_lookup(color.r).r;
  let g1 = lut_lookup(color.g).r;
  let b1 = lut_lookup(color.b).r;

  // Stage 2: per-channel curves.
  let r2 = lut_lookup(r1).g;
  let g2 = lut_lookup(g1).b;
  let b2 = lut_lookup(b1).a;

  let curved_linear = srgb_to_linear(max(vec3<f32>(r2, g2, b2), vec3<f32>(0.0)));
  let hdr_offset = max(colorLinear - vec3<f32>(1.0), vec3<f32>(0.0));
  return vec4<f32>(max(curved_linear + hdr_offset, vec3<f32>(0.0)), 1.0);
}
