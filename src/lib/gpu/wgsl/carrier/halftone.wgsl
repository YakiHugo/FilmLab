// Halftone carrier — port of shaders/HalftoneCarrier.frag.
// Mono / CMYK / RGB color modes; circle / diamond / line / square dot shapes.

struct HalftoneParams {
  // canvasSize.xy, frequency.z, angle.w
  canvasSizeFreqAngle: vec4<f32>,
  // shape.x, colorMode.y, dotScale.z, contrast.w
  shapeColorScaleContrast: vec4<f32>,
  // bgColor.rgb + backgroundOpacity.a
  backgroundColor: vec4<f32>,
  // invert flag in .x; rest reserved
  flags: vec4<u32>,
};

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var srcSampler: sampler;
@group(0) @binding(2) var<uniform> params: HalftoneParams;

const PI: f32 = 3.14159265359;

fn rotation_matrix(angle_deg: f32) -> mat2x2<f32> {
  let a = angle_deg * PI / 180.0;
  let c = cos(a);
  let s = sin(a);
  // GLSL `mat2(c, -s, s, c)` — column-major: col0=(c,-s), col1=(s,c).
  return mat2x2<f32>(vec2<f32>(c, -s), vec2<f32>(s, c));
}

fn halftone_cell(pos: vec2<f32>, luminance: f32, dot_scale: f32, contrast: f32, shape: f32) -> f32 {
  var threshold = clamp(luminance, 0.0, 1.0);
  threshold = pow(threshold, contrast);
  let radius = threshold * dot_scale;

  if (shape < 0.5) {
    let dist = length(pos - vec2<f32>(0.5));
    return smoothstep(radius + 0.02, radius - 0.02, dist);
  }
  if (shape < 1.5) {
    let dist = abs(pos.x - 0.5) + abs(pos.y - 0.5);
    return smoothstep(radius * 1.414 + 0.02, radius * 1.414 - 0.02, dist);
  }
  if (shape < 2.5) {
    let dist = abs(pos.y - 0.5);
    return smoothstep(radius * 0.5 + 0.01, radius * 0.5 - 0.01, dist);
  }
  let dist = max(abs(pos.x - 0.5), abs(pos.y - 0.5));
  return smoothstep(radius + 0.02, radius - 0.02, dist);
}

fn screen_channel(pixel: vec2<f32>, channel_value: f32, angle_deg: f32, canvas_h: f32, frequency: f32, dot_scale: f32, contrast: f32, shape: f32) -> f32 {
  let rot = rotation_matrix(angle_deg);
  let rotated = rot * pixel;
  let cell_size = max(2.0, canvas_h / max(1.0, frequency));
  let cell_coord = fract(rotated / cell_size);
  return halftone_cell(cell_coord, channel_value, dot_scale, contrast, shape);
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let canvas_size = params.canvasSizeFreqAngle.xy;
  let frequency = params.canvasSizeFreqAngle.z;
  let angle = params.canvasSizeFreqAngle.w;
  let shape = params.shapeColorScaleContrast.x;
  let color_mode = params.shapeColorScaleContrast.y;
  let dot_scale = params.shapeColorScaleContrast.z;
  let contrast = params.shapeColorScaleContrast.w;
  let bg = vec4<f32>(params.backgroundColor.rgb, params.backgroundColor.a);
  let invert = params.flags.x != 0u;

  let src = textureSample(srcTex, srcSampler, in.uv);
  let pixel = in.uv * canvas_size;

  var result: vec4<f32>;

  if (color_mode < 0.5) {
    var lum = dot(src.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    if (invert) { lum = 1.0 - lum; }
    let d = screen_channel(pixel, lum, angle, canvas_size.y, frequency, dot_scale, contrast, shape);
    let fg = select(vec3<f32>(1.0), vec3<f32>(0.0), invert);
    result = vec4<f32>(mix(bg.rgb, fg, d), mix(bg.a, 1.0, d) * src.a);
  } else if (color_mode < 1.5) {
    var c = 1.0 - src.r;
    var m = 1.0 - src.g;
    var y = 1.0 - src.b;
    let k = min(c, min(m, y));
    c = (c - k) / max(1.0 - k, 0.001);
    m = (m - k) / max(1.0 - k, 0.001);
    y = (y - k) / max(1.0 - k, 0.001);

    let c_dot = screen_channel(pixel, c, angle + 15.0, canvas_size.y, frequency, dot_scale, contrast, shape);
    let m_dot = screen_channel(pixel, m, angle + 75.0, canvas_size.y, frequency, dot_scale, contrast, shape);
    let y_dot = screen_channel(pixel, y, angle, canvas_size.y, frequency, dot_scale, contrast, shape);
    let k_dot = screen_channel(pixel, k, angle + 45.0, canvas_size.y, frequency, dot_scale, contrast, shape);

    var cmyk = vec3<f32>(1.0);
    cmyk -= c_dot * vec3<f32>(1.0, 0.0, 0.0);
    cmyk -= m_dot * vec3<f32>(0.0, 1.0, 0.0);
    cmyk -= y_dot * vec3<f32>(0.0, 0.0, 1.0);
    cmyk -= k_dot * vec3<f32>(1.0, 1.0, 1.0);
    cmyk = clamp(cmyk, vec3<f32>(0.0), vec3<f32>(1.0));

    if (invert) { cmyk = vec3<f32>(1.0) - cmyk; }
    result = vec4<f32>(mix(bg.rgb, cmyk, src.a), mix(bg.a, 1.0, src.a));
  } else {
    let r_in = select(src.r, 1.0 - src.r, invert);
    let g_in = select(src.g, 1.0 - src.g, invert);
    let b_in = select(src.b, 1.0 - src.b, invert);
    let r_dot = screen_channel(pixel, r_in, angle, canvas_size.y, frequency, dot_scale, contrast, shape);
    let g_dot = screen_channel(pixel, g_in, angle + 30.0, canvas_size.y, frequency, dot_scale, contrast, shape);
    let b_dot = screen_channel(pixel, b_in, angle + 60.0, canvas_size.y, frequency, dot_scale, contrast, shape);

    let fg = select(vec3<f32>(1.0), vec3<f32>(0.0), invert);
    let rgb_result = vec3<f32>(
      mix(bg.r, fg.r, r_dot),
      mix(bg.g, fg.g, g_dot),
      mix(bg.b, fg.b, b_dot),
    );
    result = vec4<f32>(rgb_result, mix(bg.a, 1.0, max(r_dot, max(g_dot, b_dot))) * src.a);
  }

  return result;
}
