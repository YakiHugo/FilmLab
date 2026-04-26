// Y-invariant fullscreen passthrough.
//
// Vertex math derives the UV directly from clip-space position, so a
// passthrough preserves orientation in storage. Composing N passthroughs
// is identity, removing the WebGL2 even-pass-count parity hack.
//
// WebGPU conventions: clip-space y=+1 is the top of the viewport, and the
// framebuffer's texel (0,0) is top-left. After copyExternalImageToTexture,
// the source texture's texel (0,0) is also top-left.
//
//   uv.x = position.x * 0.5 + 0.5      // x ∈ [-1,1] → uv.x ∈ [0,1]
//   uv.y = (1.0 - position.y) * 0.5    // y=+1 → uv.y=0; y=-1 → uv.y=1

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

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  return textureSample(src, smp, in.uv);
}
