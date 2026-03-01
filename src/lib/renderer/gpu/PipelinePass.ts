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
}

