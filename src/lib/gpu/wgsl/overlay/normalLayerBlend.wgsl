// Mirrors LayerBlend.frag at blendMode=normal, opacity=1, useMask=false:
//   outRgb = mix(base.rgb, layer.rgb, layer.a)
//   outA   = base.a + layer.a * (1 - base.a)
// The non-premultiplied mix is intentional — proper Porter-Duff would diverge
// from legacy when a downstream overlay re-uses this output as its base, so we
// keep parity with the GLSL chain instead.

@group(0) @binding(0) var t_base:  texture_2d<f32>;
@group(0) @binding(1) var t_layer: texture_2d<f32>;
@group(0) @binding(2) var smp:     sampler;

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let base  = textureSampleLevel(t_base,  smp, in.uv, 0.0);
  let layer = textureSampleLevel(t_layer, smp, in.uv, 0.0);
  let blendFactor = clamp(layer.a, 0.0, 1.0);
  let rgb = mix(base.rgb, layer.rgb, blendFactor);
  let a   = base.a + blendFactor * (1.0 - base.a);
  return vec4<f32>(clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)), clamp(a, 0.0, 1.0));
}
