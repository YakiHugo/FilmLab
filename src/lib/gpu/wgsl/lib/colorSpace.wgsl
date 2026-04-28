// Color-space helpers shared across develop / film / post passes.
// Concatenated before each pass fragment shader at module scope.
//
// Coefficients mirror the canonical sources:
//   - sRGB IEC 61966-2-1 transfer (encoding & decoding form)
//   - CAT02 chromatic adaptation matrix (von Kries variant)
//   - OKLab (Bjorn Ottosson, 2020)
// Any precision drift vs the GLSL ports must come from f32-rounding alone, not
// from coefficient differences — the constants below are byte-for-byte equal
// to the WebGL2 sources.

fn srgb_to_linear(c: vec3<f32>) -> vec3<f32> {
  let lin = c / 12.92;
  let pwr = pow((c + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4));
  let mask = step(vec3<f32>(0.04045), c);
  return mix(lin, pwr, mask);
}

fn linear_to_srgb(c: vec3<f32>) -> vec3<f32> {
  let lin = c * 12.92;
  let pwr = 1.055 * pow(max(c, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.4)) - 0.055;
  let mask = step(vec3<f32>(0.0031308), c);
  return mix(lin, pwr, mask);
}

fn luminance_rec709(c: vec3<f32>) -> f32 {
  return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

// CAT02 — store as row-major coefficients but build column-major matrices to
// match GLSL `mat3(...)`. WGSL `mat3x3<f32>(c0, c1, c2)` is column-major.
fn rgb_to_lms(linear_rgb: vec3<f32>) -> vec3<f32> {
  let m = mat3x3<f32>(
    vec3<f32>( 0.7328, -0.7036,  0.0030),
    vec3<f32>( 0.4296,  1.6975,  0.0136),
    vec3<f32>(-0.1624,  0.0061,  0.9834),
  );
  return m * linear_rgb;
}

fn lms_to_rgb(lms: vec3<f32>) -> vec3<f32> {
  let m = mat3x3<f32>(
    vec3<f32>( 1.0961,  0.4544, -0.0096),
    vec3<f32>(-0.2789,  0.4735, -0.0057),
    vec3<f32>( 0.1827,  0.0721,  1.0153),
  );
  return m * lms;
}

fn white_balance_lms(linear_rgb: vec3<f32>, lms_scale: vec3<f32>) -> vec3<f32> {
  var lms = rgb_to_lms(linear_rgb);
  lms = lms * max(lms_scale, vec3<f32>(0.0001));
  return lms_to_rgb(lms);
}

// OKLab from linear sRGB.
fn rgb_to_oklab(c: vec3<f32>) -> vec3<f32> {
  var l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  var m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  var s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  l = pow(max(l, 0.0), 1.0 / 3.0);
  m = pow(max(m, 0.0), 1.0 / 3.0);
  s = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3<f32>(
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  );
}

fn oklab_to_rgb(o: vec3<f32>) -> vec3<f32> {
  var l = o.x + 0.3963377774 * o.y + 0.2158037573 * o.z;
  var m = o.x - 0.1055613458 * o.y - 0.0638541728 * o.z;
  var s = o.x - 0.0894841775 * o.y - 1.2914855480 * o.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return vec3<f32>(
     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  );
}

fn hsv_to_rgb_fast(c: vec3<f32>) -> vec3<f32> {
  let p = abs(fract(vec3<f32>(c.x) + vec3<f32>(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - vec3<f32>(3.0));
  let rgb = clamp(p - vec3<f32>(1.0), vec3<f32>(0.0), vec3<f32>(1.0));
  return c.z * mix(vec3<f32>(1.0), rgb, vec3<f32>(c.y));
}
