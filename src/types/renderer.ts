export type RendererMode = "preview" | "export";

export interface RendererCacheSnapshot {
  sourceKey: string | null;
  pipelineKey: string | null;
  outputKey: string | null;
}

export interface TexturePoolMetrics {
  allocatedTargets: number;
  freeTargets: number;
  freeBytes: number;
}

