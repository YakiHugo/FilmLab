import type { RenderIntent } from "@/lib/renderIntent";
import type { RenderMode } from "@/lib/renderMode";
import type { RenderQualityProfile } from "@/lib/imageProcessingKeys";
import type { RenderImageSource } from "@/lib/imageSourceLoader";
import type {
  RenderBoundaryMetrics,
  RenderSurfaceHandle,
} from "@/lib/renderSurfaceHandle";
import type {
  ImageProcessState,
  ImageRenderDebugOptions,
} from "@/render/image/types";

export type RenderImageStageId = "full" | "develop-base" | "film-stage";

export type BackendRenderStatus = "rendered" | "partial-fallback" | "kept-stale";

export interface RenderImageStageDebugInfo {
  stageId: RenderImageStageId;
  status: BackendRenderStatus;
  activePasses: string[];
  boundaries: RenderBoundaryMetrics;
}

export interface RenderImageStageResult {
  stageId: RenderImageStageId;
  debug?: RenderImageStageDebugInfo;
}

export interface RenderImageStageSurfaceResult extends RenderImageStageResult {
  surface: RenderSurfaceHandle;
}

export interface RenderImageOptions {
  source: RenderImageSource;
  state: ImageProcessState;
  targetSize?: { width: number; height: number };
  seedKey?: string;
  signal?: AbortSignal;
  intent?: RenderIntent;
  mode?: RenderMode;
  qualityProfile?: RenderQualityProfile;
  strictErrors?: boolean;
  sourceCacheKey?: string;
  renderSlot?: string;
  debug?: ImageRenderDebugOptions;
}

export interface BackendRenderResult extends RenderImageStageSurfaceResult {
  backendStatus: BackendRenderStatus;
  fallbackReason?: string;
}

export type BackendRenderOptions = RenderImageOptions;

export interface RenderBackend {
  renderDevelopBase(options: BackendRenderOptions): Promise<BackendRenderResult>;
  renderFilmStage(options: BackendRenderOptions): Promise<BackendRenderResult>;
  renderFull(options: BackendRenderOptions): Promise<BackendRenderResult>;
}
