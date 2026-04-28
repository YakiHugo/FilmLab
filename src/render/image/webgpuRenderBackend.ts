import {
  renderDevelopBase as orchDevelopBase,
  renderFilmStage as orchFilmStage,
  renderFull as orchFull,
} from "@/lib/gpu/orchestrator";
import type {
  BackendRenderOptions,
  BackendRenderResult,
  RenderBackend,
} from "./renderBackend";

export class WebGPURenderBackend implements RenderBackend {
  async renderDevelopBase(options: BackendRenderOptions): Promise<BackendRenderResult> {
    return orchDevelopBase(options);
  }

  async renderFilmStage(options: BackendRenderOptions): Promise<BackendRenderResult> {
    return orchFilmStage(options);
  }

  async renderFull(options: BackendRenderOptions): Promise<BackendRenderResult> {
    return orchFull(options);
  }
}
