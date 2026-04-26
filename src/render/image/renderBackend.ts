import type {
  RenderImageOptions,
  RenderImageStageSurfaceResult,
} from "@/lib/imageProcessing";

export type BackendRenderStatus = "rendered" | "partial-fallback" | "kept-stale";

export interface BackendRenderResult extends RenderImageStageSurfaceResult {
  backendStatus: BackendRenderStatus;
  /** Set when backendStatus is not "rendered". */
  fallbackReason?: string;
}

export type BackendRenderOptions = Omit<RenderImageOptions, "canvas">;

export interface RenderBackend {
  renderDevelopBase(options: BackendRenderOptions): Promise<BackendRenderResult>;
  renderFilmStage(options: BackendRenderOptions): Promise<BackendRenderResult>;
  renderFull(options: BackendRenderOptions): Promise<BackendRenderResult>;
}
