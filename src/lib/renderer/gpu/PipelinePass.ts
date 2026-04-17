import type { ProgramInfo } from "twgl.js";

export type PipelineOutputFormat = "RGBA8" | "RGBA16F";

export interface PipelinePass {
  id: string;
  programInfo: ProgramInfo;
  uniforms: Record<string, unknown>;
  extraTextures?: Record<string, WebGLTexture | null | undefined>;
  outputFormat?: PipelineOutputFormat;
  /**
   * Resolution scale relative to the current frame size.
   * Example: 0.5 renders this pass at half resolution.
   */
  resolution?: number;
  enabled: boolean;
  /**
   * When false, FilterPipeline does not inject the prior-pass texture as
   * `uSampler`. Generator passes (those that derive output from uniforms and
   * cell-grid textures rather than a previous frame) must set this to keep
   * the `uSampler` name available for their own purposes and to make the
   * "no prior-pass dependency" contract explicit. Defaults to true.
   */
  usesPriorTexture?: boolean;
}

