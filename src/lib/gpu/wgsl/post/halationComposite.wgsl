// HalationComposite.frag port.
// Composites blurred halation + bloom energy onto the source image.
// Bindings: 0=src(original film output), 1=blurred_mask(RGB=halation,A=bloom),
//           2=smp, 3=uniform.

struct CompositeParams {
  // x=halation, y=bloom
  flags:           vec4<u32>,
  // x=intensity, y=hue(deg), z=saturation, w=blueComp
  halation_params: vec4<f32>,
  // xyz=tintColor (RGB)
  halation_color:  vec4<f32>,
  // x=bloomIntensity
  bloom_params:    vec4<f32>,
};
// 4 × 16 = 64 bytes

@group(0) @binding(0) var src:          texture_2d<f32>;
@group(0) @binding(1) var blurred_mask: texture_2d<f32>;
@group(0) @binding(2) var smp:          sampler;
@group(0) @binding(3) var<uniform> q:   CompositeParams;

fn hue_to_rgb(hue_deg: f32) -> vec3<f32> {
  let h = fract(hue_deg / 360.0);
  return vec3<f32>(
    clamp(abs(h * 6.0 - 3.0) - 1.0, 0.0, 1.0),
    clamp(2.0 - abs(h * 6.0 - 2.0), 0.0, 1.0),
    clamp(2.0 - abs(h * 6.0 - 4.0), 0.0, 1.0),
  );
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let sampled = textureSampleLevel(src,          smp, in.uv, 0.0);
  let energy  = textureSampleLevel(blurred_mask, smp, in.uv, 0.0);
  var color   = sampled.rgb;

  if (q.flags.x != 0u && q.halation_params.x > 0.001) {
    let hue_tint = hue_to_rgb(q.halation_params.y);
    let sat_tint = mix(vec3<f32>(1.0), hue_tint, clamp(q.halation_params.z, 0.0, 1.0));
    var tint     = mix(q.halation_color.xyz, sat_tint, 0.7);
    tint.b      += q.halation_params.w * 0.35;
    color       += energy.rgb * tint * q.halation_params.x;
  }

  if (q.flags.y != 0u && q.bloom_params.x > 0.001) {
    color += vec3<f32>(energy.a * q.bloom_params.x);
  }

  return vec4<f32>(max(color, vec3<f32>(0.0)), sampled.a);
}
