/**
 * Minimal raw-WebGL2 reference renderer used by the Slice 2 parity harness.
 *
 * Compiles an existing `.frag` from `src/lib/renderer/shaders/`, paired with
 * `Fullscreen.vert`, draws a fullscreen quad against an `ImageData`-derived
 * source texture, and reads back the framebuffer as a tight-packed
 * Uint8ClampedArray. Stays intentionally small and dependency-free so it can
 * sit next to the WebGPU smoke pages without pulling in PipelineRenderer.
 */

export type UniformValue =
  | { kind: "1f"; value: number }
  | { kind: "1i"; value: number }
  | { kind: "1ui"; value: number }
  | { kind: "2f"; value: readonly [number, number] }
  | { kind: "3f"; value: readonly [number, number, number] }
  | { kind: "4f"; value: readonly [number, number, number, number] }
  | { kind: "mat3"; value: readonly number[] }
  | { kind: "1iBool"; value: boolean };

export interface UniformMap {
  [name: string]: UniformValue;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string, label: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error(`createShader(${label}) returned null`);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? "(no log)";
    gl.deleteShader(shader);
    throw new Error(`compile ${label} failed: ${info}`);
  }
  return shader;
}

export function buildProgram(gl: WebGL2RenderingContext, vs: string, fs: string, label: string): WebGLProgram {
  const v = compileShader(gl, gl.VERTEX_SHADER, vs, `${label}.vert`);
  const f = compileShader(gl, gl.FRAGMENT_SHADER, fs, `${label}.frag`);
  const program = gl.createProgram();
  if (!program) throw new Error("createProgram returned null");
  gl.attachShader(program, v);
  gl.attachShader(program, f);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? "(no log)";
    gl.deleteProgram(program);
    throw new Error(`link ${label} failed: ${info}`);
  }
  gl.deleteShader(v);
  gl.deleteShader(f);
  return program;
}

export function applyUniforms(gl: WebGL2RenderingContext, program: WebGLProgram, uniforms: UniformMap): void {
  for (const [name, entry] of Object.entries(uniforms)) {
    const loc = gl.getUniformLocation(program, name);
    if (loc === null) throw new Error(`uniform "${name}" not found in shader`);
    switch (entry.kind) {
      case "1f": gl.uniform1f(loc, entry.value); break;
      case "1i": gl.uniform1i(loc, entry.value); break;
      case "1ui": gl.uniform1ui(loc, entry.value); break;
      case "1iBool": gl.uniform1i(loc, entry.value ? 1 : 0); break;
      case "2f": gl.uniform2f(loc, entry.value[0], entry.value[1]); break;
      case "3f": gl.uniform3f(loc, entry.value[0], entry.value[1], entry.value[2]); break;
      case "4f": gl.uniform4f(loc, entry.value[0], entry.value[1], entry.value[2], entry.value[3]); break;
      case "mat3": gl.uniformMatrix3fv(loc, false, entry.value); break;
    }
  }
}

export interface ExtraTexture {
  /** GL texture unit index (1, 2, …). Unit 0 is reserved for uSampler. */
  unit: number;
  /** Uniform name to bind this texture to (e.g. "u_curveLut"). */
  uniformName: string;
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  filter: "linear" | "nearest";
}

export interface ReferenceRenderInput {
  /** RGBA8 source pixel buffer, length = width*height*4. */
  source: Uint8ClampedArray;
  width: number;
  height: number;
  /** Vertex shader GLSL source. */
  vertexSrc: string;
  /** Fragment shader GLSL source. */
  fragmentSrc: string;
  /** Uniforms to set after binding the program; sampler `uSampler` is set automatically. */
  uniforms: UniformMap;
  label: string;
  /** Additional textures bound at texture units ≥1. */
  extraTextures?: ExtraTexture[];
}

export interface ReferenceRenderResult {
  /** RGBA8 readback, length = width*height*4. */
  pixels: Uint8ClampedArray;
}

/**
 * Off-screen WebGL2 renderer. Each call creates a fresh GL context — fine
 * for a one-shot parity test, where setup cost is dominated by shader compile.
 */
export function renderWithWebGL2Reference(input: ReferenceRenderInput): ReferenceRenderResult {
  const canvas = document.createElement("canvas");
  canvas.width = input.width;
  canvas.height = input.height;
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
  });
  if (!gl) throw new Error("getContext('webgl2') returned null");

  const program = buildProgram(gl, input.vertexSrc, input.fragmentSrc, input.label);

  // Source texture: explicitly disable Y-flip so source row 0 is texel row 0,
  // matching the WebGPU upload path's flipY:false default. Both pipelines
  // therefore see the same texel layout.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  const sourceTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, sourceTex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    input.width,
    input.height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array(input.source.buffer, input.source.byteOffset, input.source.byteLength),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Output FBO + color texture. RGBA8 to match readPixels(UNSIGNED_BYTE).
  const outTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, outTex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, input.width, input.height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outTex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("FBO incomplete");
  }

  // Fullscreen triangle-strip quad: same vertex order as the WGSL passthrough.
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const aPosLoc = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(aPosLoc);
  gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceTex);
  const samplerLoc = gl.getUniformLocation(program, "uSampler");
  if (samplerLoc !== null) gl.uniform1i(samplerLoc, 0);

  applyUniforms(gl, program, input.uniforms);

  const extraTexObjs: WebGLTexture[] = [];
  for (const et of input.extraTextures ?? []) {
    gl.activeTexture(gl.TEXTURE0 + et.unit);
    const tex = gl.createTexture();
    if (!tex) throw new Error(`createTexture for ${et.uniformName} returned null`);
    extraTexObjs.push(tex);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, et.width, et.height, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array(et.data.buffer, et.data.byteOffset, et.data.byteLength));
    const filter = et.filter === "linear" ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const loc = gl.getUniformLocation(program, et.uniformName);
    if (loc !== null) gl.uniform1i(loc, et.unit);
  }
  gl.activeTexture(gl.TEXTURE0);

  gl.viewport(0, 0, input.width, input.height);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  const pixels = new Uint8Array(input.width * input.height * 4);
  gl.readPixels(0, 0, input.width, input.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  // WebGL2 readPixels returns rows bottom-to-top. The vertex shader's UV math
  // already places texel(0,0)=top at uv.y=0, but the framebuffer write at
  // gl_FragCoord.y=0 is the bottom row. Flip rows here so the returned buffer
  // is top-to-bottom and aligns with WebGPU's COPY layout.
  const flipped = new Uint8ClampedArray(pixels.length);
  const stride = input.width * 4;
  for (let y = 0; y < input.height; y += 1) {
    const srcOff = (input.height - 1 - y) * stride;
    flipped.set(pixels.subarray(srcOff, srcOff + stride), y * stride);
  }

  // Cleanup.
  gl.deleteProgram(program);
  gl.deleteTexture(sourceTex);
  gl.deleteTexture(outTex);
  gl.deleteFramebuffer(fbo);
  gl.deleteBuffer(vbo);
  gl.deleteVertexArray(vao);
  for (const tex of extraTexObjs) {
    gl.deleteTexture(tex);
  }

  return { pixels: flipped };
}

export interface DiffStats {
  maxPerChannel: number;
  count255: number;
  meanDiff: number;
}

export function diffRGBA(a: Uint8ClampedArray | Uint8Array, b: Uint8ClampedArray | Uint8Array): DiffStats {
  if (a.length !== b.length) throw new Error(`diff length mismatch: ${a.length} vs ${b.length}`);
  let max = 0;
  let count255 = 0;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = Math.abs(a[i]! - b[i]!);
    if (d > max) max = d;
    if (d > 0) count255 += 1;
    total += d;
  }
  return { maxPerChannel: max, count255, meanDiff: total / a.length };
}
