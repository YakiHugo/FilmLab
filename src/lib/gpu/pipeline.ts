/**
 * Linear pass-chain executor.
 *
 * Encodes every enabled pass into a single `GPUCommandBuffer` before
 * submission. Render passes ping-pong through `TexturePool` leases; compute
 * passes interleave without advancing the prior-input chain (their effect is
 * carried via storage resources bound through their own bind groups).

 */

import type { TexturePool, PooledTexture } from "./resources";
import type { GPUPass } from "./passes/types";

export interface PipelineInputSource {
  /** Color texture to feed into the first pass. */
  texture: GPUTexture;
  view: GPUTextureView;
  width: number;
  height: number;
  format: GPUTextureFormat;
  /**
   * Pool lease that owns the texture, if any. The executor releases this
   * lease (after submit) when the input has been consumed by the chain.
   * Provide null for caller-owned textures (e.g., uploaded source images).
   */
  lease?: PooledTexture | null;
}

export interface PipelineCanvasOutput {
  context: GPUCanvasContext;
  width: number;
  height: number;
  /** Must match the texture format the canvas was configured with. */
  format: GPUTextureFormat;
  clearValue?: GPUColor;
}

export interface PipelineExecuteOptions {
  baseWidth: number;
  baseHeight: number;
  passes: readonly GPUPass[];
  input: PipelineInputSource;
  /**
   * When provided, the last enabled render pass writes directly to the
   * canvas's current texture and `result.output` is null.
   */
  canvasOutput?: PipelineCanvasOutput;
}

/**
 * Discriminated union forces callers to handle the three terminal states of
 * a pipeline run, instead of collapsing them into `output: PooledTexture | null`
 * where "no surface was produced" and "the canvas was written" both look like
 * `null`. The Slice 5.5 backend adapter relies on this distinction to map to
 * the higher-level `{ status, surface, fallbackReason? }` render contract.
 */
export type PipelineExecuteResult =
  | { kind: "skipped" }
  | { kind: "canvas" }
  | { kind: "texture"; output: PooledTexture };

export interface PipelineExecutorOptions {
  device: GPUDevice;
  texturePool: TexturePool;
  /**
   * Sampler exposed to passes via `GPURenderPassBindContext.defaultSampler`.
   * Linear-filter, clamp-to-edge is the typical choice; passes that need
   * different sampling create their own sampler internally.
   */
  defaultSampler: GPUSampler;
}

export class PipelineExecutor {
  private readonly device: GPUDevice;
  private readonly pool: TexturePool;
  private readonly defaultSampler: GPUSampler;

  constructor(options: PipelineExecutorOptions) {
    this.device = options.device;
    this.pool = options.texturePool;
    this.defaultSampler = options.defaultSampler;
  }

  execute(options: PipelineExecuteOptions): PipelineExecuteResult {
    const enabled = options.passes.filter((pass) => pass.enabled);
    if (enabled.length === 0) {
      options.input.lease?.release();
      return { kind: "skipped" };
    }
    if (options.canvasOutput && enabled[enabled.length - 1]!.kind !== "render") {
      // A compute-last chain has no fragment write; the canvas would silently
      // stay unmodified. Fail fast — this is a misconfigured chain.
      throw new Error(
        "PipelineExecutor: canvasOutput requires the last enabled pass to be a render pass."
      );
    }

    const encoder = this.device.createCommandEncoder({ label: "PipelineExecutor" });

    // priorLease/View track the input to the next render pass. Compute passes
    // do not advance them. After submit, every lease in `releaseAfterSubmit`
    // is returned to the pool — we cannot release earlier because the GPU
    // hasn't actually executed yet at encode time.
    let priorView: GPUTextureView = options.input.view;
    let priorLease: PooledTexture | null = options.input.lease ?? null;
    const releaseAfterSubmit: PooledTexture[] = [];
    let canvasWritten = false;

    for (let i = 0; i < enabled.length; i += 1) {
      const pass = enabled[i]!;

      if (pass.kind === "compute") {
        const cpe = encoder.beginComputePass({ label: pass.id });
        cpe.setPipeline(pass.pipeline);
        cpe.setBindGroup(0, pass.bindGroup);
        const [x, y, z] = pass.workgroupCount;
        cpe.dispatchWorkgroups(x, y, z);
        cpe.end();
        continue;
      }

      const isLast = i === enabled.length - 1;
      const resolution = pass.resolution ?? 1;
      const passWidth = Math.max(1, Math.round(options.baseWidth * resolution));
      const passHeight = Math.max(1, Math.round(options.baseHeight * resolution));

      let acquiredLease: PooledTexture | null = null;
      let outputView: GPUTextureView;
      let clearValue: GPUColor;

      if (isLast && options.canvasOutput) {
        const canvasTexture = options.canvasOutput.context.getCurrentTexture();
        outputView = canvasTexture.createView({ label: `${pass.id}:canvasView` });
        clearValue = options.canvasOutput.clearValue ?? { r: 0, g: 0, b: 0, a: 0 };
        canvasWritten = true;
      } else {
        acquiredLease = this.pool.acquire(passWidth, passHeight, pass.outputFormat);
        outputView = acquiredLease.view;
        clearValue = { r: 0, g: 0, b: 0, a: 0 };
      }

      const rpe = encoder.beginRenderPass({
        label: pass.id,
        colorAttachments: [
          {
            view: outputView,
            loadOp: "clear",
            storeOp: "store",
            clearValue,
          },
        ],
      });
      rpe.setPipeline(pass.pipeline);
      const groups = pass.bindGroups({
        device: this.device,
        priorInputView: priorView,
        defaultSampler: this.defaultSampler,
      });
      for (let g = 0; g < groups.length; g += 1) {
        rpe.setBindGroup(g, groups[g]!);
      }
      rpe.draw(pass.vertexCount ?? 4);
      rpe.end();

      // The lease that produced priorView is now consumable-after-submit.
      if (priorLease) {
        releaseAfterSubmit.push(priorLease);
      }

      if (acquiredLease) {
        priorLease = acquiredLease;
        priorView = acquiredLease.view;
      } else {
        // Canvas output: no further passes will run, priorView is stale.
        priorLease = null;
      }
    }

    this.device.queue.submit([encoder.finish()]);
    for (const lease of releaseAfterSubmit) {
      lease.release();
    }

    if (canvasWritten) {
      return { kind: "canvas" };
    }
    if (priorLease) {
      return { kind: "texture", output: priorLease };
    }
    // All-compute chain with no caller-provided input lease: no surface produced.
    return { kind: "skipped" };
  }
}
