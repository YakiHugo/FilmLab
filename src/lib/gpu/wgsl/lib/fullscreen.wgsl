// Y-invariant fullscreen vertex stage. Concatenated with each render pass'
// fragment shader before compilation; struct + entry point land at module
// scope so any fragment can reference `VSOut` and bind to `vs_main`.
//
// UV convention for all fullscreen passes:
//   uv.x = position.x * 0.5 + 0.5
//   uv.y = (1.0 - position.y) * 0.5
// Composing N fullscreen passes is identity in storage — no even-pass parity
// hack needed.

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VSOut {
  var positions = array<vec2<f32>, 4>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0,  1.0),
  );
  let p = positions[idx];
  var out: VSOut;
  out.position = vec4<f32>(p, 0.0, 1.0);
  out.uv = vec2<f32>(p.x * 0.5 + 0.5, (1.0 - p.y) * 0.5);
  return out;
}
