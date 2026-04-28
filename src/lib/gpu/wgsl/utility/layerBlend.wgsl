// LayerBlend.frag port.
// Composites a layer over a base with blend mode + opacity + optional mask.
// Bindings: 0=base(priorInput), 1=layer, 2=mask, 3=smp, 4=uniform.

struct LayerBlendParams {
  // x=blendMode(0=normal,1=multiply,2=screen,3=overlay,4=softLight),
  // y=useMask, z=invertMask
  flags:  vec4<u32>,
  // x=opacity
  params: vec4<f32>,
};

@group(0) @binding(0) var t_base:     texture_2d<f32>;
@group(0) @binding(1) var t_layer:    texture_2d<f32>;
@group(0) @binding(2) var t_mask:     texture_2d<f32>;
@group(0) @binding(3) var smp:        sampler;
@group(0) @binding(4) var<uniform> q: LayerBlendParams;

fn blend_multiply(b: vec3<f32>, l: vec3<f32>) -> vec3<f32> { return b * l; }
fn blend_screen  (b: vec3<f32>, l: vec3<f32>) -> vec3<f32> { return 1.0 - (1.0 - b) * (1.0 - l); }

fn blend_overlay(b: vec3<f32>, l: vec3<f32>) -> vec3<f32> {
  return mix(2.0 * b * l, 1.0 - 2.0 * (1.0 - b) * (1.0 - l), step(vec3<f32>(0.5), b));
}

fn blend_soft_light(b: vec3<f32>, l: vec3<f32>) -> vec3<f32> {
  let d = mix(
    ((16.0 * b - 12.0) * b + 4.0) * b,
    sqrt(b),
    step(vec3<f32>(0.25), b),
  );
  return mix(
    b - (1.0 - 2.0 * l) * b * (1.0 - b),
    b + (2.0 * l - 1.0) * (d - b),
    step(vec3<f32>(0.5), l),
  );
}

fn resolve_blend(b: vec3<f32>, l: vec3<f32>) -> vec3<f32> {
  switch (q.flags.x) {
    case 1u: { return blend_multiply(b, l); }
    case 2u: { return blend_screen(b, l); }
    case 3u: { return blend_overlay(b, l); }
    case 4u: { return blend_soft_light(b, l); }
    default: { return l; }
  }
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let base  = textureSampleLevel(t_base,  smp, in.uv, 0.0);
  let layer = textureSampleLevel(t_layer, smp, in.uv, 0.0);
  var m     = 1.0;
  if (q.flags.y != 0u) {
    m = clamp(textureSampleLevel(t_mask, smp, in.uv, 0.0).a, 0.0, 1.0);
    if (q.flags.z != 0u) { m = 1.0 - m; }
  }
  let factor = clamp(q.params.x, 0.0, 1.0) * m * clamp(layer.a, 0.0, 1.0);
  let color  = mix(base.rgb, resolve_blend(base.rgb, layer.rgb), factor);
  let alpha  = base.a + factor * (1.0 - base.a);
  return vec4<f32>(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)), clamp(alpha, 0.0, 1.0));
}
