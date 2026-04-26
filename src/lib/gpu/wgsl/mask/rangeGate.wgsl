// LocalMaskRangeGate.frag port.
// Modulates an existing mask by luma/color range derived from source.
// Bindings: 0=src(linear source), 1=t_mask, 2=smp, 3=uniform.

struct RangeParams {
  // x=useLumaRange, y=useColorRange
  flags:  vec4<u32>,
  // x=lumaMin, y=lumaMax, z=lumaFeather
  luma:   vec4<f32>,
  // x=hueCenter(deg), y=hueRange(deg), z=hueFeather(deg), w=satMin
  color:  vec4<f32>,
  // x=satFeather
  color2: vec4<f32>,
};
// 4 × 16 = 64 bytes

@group(0) @binding(0) var src:        texture_2d<f32>;
@group(0) @binding(1) var t_mask:     texture_2d<f32>;
@group(0) @binding(2) var smp:        sampler;
@group(0) @binding(3) var<uniform> q: RangeParams;

fn hue_distance(a: f32, b: f32) -> f32 {
  let d = abs(a - b) % 360.0;
  return select(d, 360.0 - d, d > 180.0);
}

fn hue_sat(c: vec3<f32>) -> vec2<f32> {
  let mx   = max(max(c.r, c.g), c.b);
  let mn   = min(min(c.r, c.g), c.b);
  let diff = mx - mn;
  let sat  = select(diff / mx, 0.0, mx <= 1e-6);
  if (diff <= 1e-6) { return vec2<f32>(0.0, sat); }
  var h: f32;
  if (mx == c.r) {
    h = ((c.g - c.b) / diff % 6.0 + 6.0) % 6.0;
  } else if (mx == c.g) {
    h = (c.b - c.r) / diff + 2.0;
  } else {
    h = (c.r - c.g) / diff + 4.0;
  }
  h = h * 60.0;
  if (h < 0.0) { h += 360.0; }
  return vec2<f32>(h, sat);
}

fn luma_weight(lum: f32) -> f32 {
  if (q.flags.x == 0u) { return 1.0; }
  if (lum < q.luma.x) {
    return select(0.0, smoothstep(q.luma.x - q.luma.z, q.luma.x, lum), q.luma.z > 1e-4);
  }
  if (lum > q.luma.y) {
    return select(0.0, 1.0 - smoothstep(q.luma.y, q.luma.y + q.luma.z, lum), q.luma.z > 1e-4);
  }
  return 1.0;
}

fn color_weight(hue: f32, sat: f32) -> f32 {
  if (q.flags.y == 0u) { return 1.0; }
  var hw = 1.0;
  if (q.color.y < 179.999) {
    if (sat <= 1e-3) { return 0.0; }
    let d = hue_distance(hue, q.color.x);
    if (d <= q.color.y) {
      hw = 1.0;
    } else if (q.color.z <= 1e-4) {
      hw = 0.0;
    } else {
      hw = 1.0 - smoothstep(q.color.y, min(180.0, q.color.y + q.color.z), d);
    }
  }
  var sw = 1.0;
  if (q.color.w > 1e-4) {
    sw = select(
      select(0.0, 1.0, sat >= q.color.w),
      smoothstep(q.color.w, min(1.0, q.color.w + q.color2.x), sat),
      q.color2.x > 1e-4,
    );
  }
  return hw * sw;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let ma = clamp(textureSampleLevel(t_mask, smp, in.uv, 0.0).a, 0.0, 1.0);
  if (ma <= 1e-6) { return vec4<f32>(1.0, 1.0, 1.0, 0.0); }
  let src_c  = clamp(textureSampleLevel(src, smp, in.uv, 0.0).rgb, vec3<f32>(0.0), vec3<f32>(1.0));
  var weight = luma_weight(dot(src_c, vec3<f32>(0.2126, 0.7152, 0.0722)));
  if (weight > 1e-4 && q.flags.y != 0u) {
    let hs = hue_sat(src_c);
    weight *= color_weight(hs.x, hs.y);
  }
  return vec4<f32>(1.0, 1.0, 1.0, clamp(ma * weight, 0.0, 1.0));
}
