// MaskedBlend.frag port.
// Blends layer over base weighted by mask alpha.
// Bindings: 0=base(priorInput), 1=layer, 2=mask, 3=smp.

@group(0) @binding(0) var t_base:  texture_2d<f32>;
@group(0) @binding(1) var t_layer: texture_2d<f32>;
@group(0) @binding(2) var t_mask:  texture_2d<f32>;
@group(0) @binding(3) var smp:     sampler;

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let base  = textureSampleLevel(t_base,  smp, in.uv, 0.0);
  let layer = textureSampleLevel(t_layer, smp, in.uv, 0.0);
  let m     = clamp(textureSampleLevel(t_mask, smp, in.uv, 0.0).a, 0.0, 1.0);
  return vec4<f32>(
    max(mix(base.rgb, layer.rgb, m), vec3<f32>(0.0)),
    mix(base.a, layer.a, m),
  );
}
