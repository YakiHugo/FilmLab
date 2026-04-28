// 5×5 edge-preserving bilateral filter. Mirrors BilateralScale.frag.

struct BilateralParams {
  // xy=texelSize, z=sigmaRange, w=strength
  params: vec4<f32>,
};

@group(0) @binding(0) var src:        texture_2d<f32>;
@group(0) @binding(1) var smp:        sampler;
@group(0) @binding(2) var<uniform> q: BilateralParams;

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let center     = textureSampleLevel(src, smp, in.uv, 0.0).rgb;
  let center_lum = luminance_rec709(center);
  let inv2spa    = 1.0 / (2.0 * 1.5 * 1.5);
  let inv2rng    = 1.0 / max(2.0 * q.params.z * q.params.z, 1e-5);
  var sum        = vec3<f32>(0.0);
  var w_sum      = 0.0;
  for (var y = -2; y <= 2; y++) {
    for (var x = -2; x <= 2; x++) {
      let off  = vec2<f32>(f32(x), f32(y)) * q.params.xy;
      let s    = textureSampleLevel(src, smp, in.uv + off, 0.0).rgb;
      let sp_w = exp(-f32(x * x + y * y) * inv2spa);
      let rd   = luminance_rec709(s) - center_lum;
      let rw   = exp(-(rd * rd) * inv2rng);
      let w    = sp_w * rw;
      sum   += s * w;
      w_sum += w;
    }
  }
  let filtered = sum / max(w_sum, 1e-5);
  return vec4<f32>(mix(center, filtered, clamp(q.params.w, 0.0, 1.0)), 1.0);
}
