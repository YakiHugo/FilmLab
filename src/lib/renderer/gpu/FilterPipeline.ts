import * as twgl from "twgl.js";
import type { BufferInfo, ProgramInfo } from "twgl.js";
import type { PipelinePass, PipelineOutputFormat } from "./PipelinePass";
import type { PooledRenderTarget } from "./TexturePool";
import { TexturePool } from "./TexturePool";

export interface PipelineTextureSource {
  texture: WebGLTexture;
  width: number;
  height: number;
  format: PipelineOutputFormat;
  lease?: PooledRenderTarget | null;
}

export interface PipelineTextureResult {
  texture: WebGLTexture;
  width: number;
  height: number;
  format: PipelineOutputFormat;
  lease: PooledRenderTarget;
  release: () => void;
}

interface ExecuteOptions {
  baseWidth: number;
  baseHeight: number;
  passes: PipelinePass[];
  input: PipelineTextureSource;
  canvasOutput?: {
    width: number;
    height: number;
  };
}

export class FilterPipeline {
  private readonly quadBufferInfo: BufferInfo;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly texturePool: TexturePool,
    // When set, execute() will append a passthrough draw to any odd-length pass
    // chain so each call performs an even number of Fullscreen.vert invocations.
    // This keeps output Y storage convention equal to input convention regardless
    // of how many conditional passes participated in a given render.
    private readonly yParityPassthroughProgram?: ProgramInfo | null
  ) {
    this.quadBufferInfo = twgl.createBufferInfoFromArrays(this.gl, {
      a_position: {
        numComponents: 2,
        data: [-1, -1, 1, -1, -1, 1, 1, 1],
      },
      indices: [0, 1, 2, 2, 1, 3],
    });
  }

  runToTexture(options: Omit<ExecuteOptions, "canvasOutput">): PipelineTextureResult {
    const result = this.execute(options);
    if (!result.currentLease) {
      throw new Error("FilterPipeline.runToTexture requires at least one enabled pass.");
    }
    const lease = result.currentLease;
    return {
      texture: lease.texture,
      width: lease.width,
      height: lease.height,
      format: lease.format,
      lease,
      release: () => {
        this.texturePool.release(lease);
      },
    };
  }

  runToCanvas(options: ExecuteOptions): void {
    this.execute(options);
  }

  private execute(options: ExecuteOptions): {
    currentLease: PooledRenderTarget | null;
  } {
    const activePasses = options.passes.filter((pass) => pass.enabled);
    if (activePasses.length === 0) {
      if (options.input.lease) {
        this.texturePool.release(options.input.lease);
      }
      return {
        currentLease: null,
      };
    }

    // Fullscreen.vert emits vTextureCoord via `0.5 - a_position.y * 0.5`, which
    // flips Y storage convention on every draw. When the chain length is odd,
    // the caller's output would come back with inverted Y relative to its input,
    // and whether that is visible depends on how many conditional passes ran —
    // which makes orientation depend on params like clarity/detail toggles.
    // Normalising to an even draw count per execute call keeps the output's Y
    // convention identical to the input's, so orientation is param-independent.
    if (
      this.yParityPassthroughProgram &&
      activePasses.length % 2 === 1
    ) {
      const lastPass = activePasses[activePasses.length - 1]!;
      activePasses.push({
        id: "y-parity-passthrough",
        programInfo: this.yParityPassthroughProgram,
        uniforms: {},
        // Inherit the last pass's resolution so the output size is unchanged.
        resolution: lastPass.resolution,
        // outputFormat left undefined → execute() falls back to currentFormat
        // (i.e. the format the original last pass produced).
        enabled: true,
      });
    }

    let currentTexture = options.input.texture;
    let currentFormat = options.input.format;
    let currentLease = options.input.lease ?? null;

    this.gl.disable(this.gl.BLEND);

    for (let i = 0; i < activePasses.length; i += 1) {
      const pass = activePasses[i]!;
      const isLast = i === activePasses.length - 1;
      const resolution = pass.resolution ?? 1;
      const passWidth = Math.max(1, Math.round(options.baseWidth * resolution));
      const passHeight = Math.max(1, Math.round(options.baseHeight * resolution));
      const passFormat = this.texturePool.resolveFormat(pass.outputFormat ?? currentFormat);

      let outputLease: PooledRenderTarget | null = null;
      if (!(isLast && options.canvasOutput)) {
        outputLease = this.texturePool.acquire(passWidth, passHeight, passFormat);
        twgl.bindFramebufferInfo(this.gl, outputLease.framebufferInfo);
        this.gl.viewport(0, 0, passWidth, passHeight);
      } else {
        twgl.bindFramebufferInfo(this.gl, null);
        this.gl.viewport(0, 0, options.canvasOutput.width, options.canvasOutput.height);
      }

      this.gl.useProgram(pass.programInfo.program);
      twgl.setBuffersAndAttributes(this.gl, pass.programInfo, this.quadBufferInfo);

      const uniforms: Record<string, unknown> = {
        uSampler: currentTexture,
        ...pass.uniforms,
      };
      if (pass.extraTextures) {
        for (const [uniformName, texture] of Object.entries(pass.extraTextures)) {
          if (texture) {
            uniforms[uniformName] = texture;
          }
        }
      }

      twgl.setUniforms(pass.programInfo, uniforms);
      twgl.drawBufferInfo(this.gl, this.quadBufferInfo);

      if (currentLease) {
        this.texturePool.release(currentLease);
        currentLease = null;
      }

      if (outputLease) {
        currentTexture = outputLease.texture;
        currentFormat = outputLease.format;
        currentLease = outputLease;
      }
    }

    return {
      currentLease,
    };
  }
}
