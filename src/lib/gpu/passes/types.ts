/**
 * Pass types for the linear pipeline executor.
 *
 * The executor encodes a sequence of `GPUPass` entries to a single
 * `GPUCommandBuffer`. Render and compute passes interleave naturally — see
 * `pipeline.ts` for the execution semantics.
 *
 * Bind groups are produced lazily via a `bindGroups` factory because the
 * executor ping-pongs textures between passes: the input view changes from
 * frame to frame, and pre-baked bind groups would tie a pass to a specific
 * texture identity.
 */

export interface GPURenderPassBindContext {
  device: GPUDevice;
  /** Output of the previous pass (or the source texture for the first pass). */
  priorInputView: GPUTextureView;
  /** Sampler shared across passes that don't need a custom one. */
  defaultSampler: GPUSampler;
}

export interface GPURenderPassDescriptor {
  kind: "render";
  id: string;
  pipeline: GPURenderPipeline;
  /** Returns one or more bind groups, set in order starting from group 0. */
  bindGroups: (ctx: GPURenderPassBindContext) => readonly GPUBindGroup[];
  outputFormat: GPUTextureFormat;
  /** Resolution scale relative to the executor's base size. Default 1. */
  resolution?: number;
  enabled: boolean;
  /**
   * False for generator passes (e.g. ASCII composition) that derive output
   * from sources other than the prior pass texture. Generator passes still
   * receive `priorInputView` in their bind context but they should ignore
   * it; this flag exists so the executor can validate the contract during
   * test/dev builds (Slice 1+).
   */
  consumesPrior: boolean;
  /** Vertex count for `draw()`. Defaults to 4 (fullscreen triangle strip). */
  vertexCount?: number;
}

export interface GPUComputePassDescriptor {
  kind: "compute";
  id: string;
  pipeline: GPUComputePipeline;
  bindGroup: GPUBindGroup;
  workgroupCount: readonly [number, number, number];
  enabled: boolean;
}

export type GPUPass = GPURenderPassDescriptor | GPUComputePassDescriptor;
