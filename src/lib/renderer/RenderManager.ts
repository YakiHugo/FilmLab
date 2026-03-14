import { PipelineRenderer } from "./PipelineRenderer";

export type RenderMode = "preview" | "export";

export interface FrameState {
  sourceKey: string | null;
  geometryKey: string | null;
  masterKey: string | null;
  hslKey: string | null;
  curveKey: string | null;
  detailKey: string | null;
  filmKey: string | null;
  opticsKey: string | null;
  pipelineKey: string | null;
  outputKey: string | null;
  tilePlanKey: string | null;
  uploadedGeometryKey: string | null;
  geometryCanvas: HTMLCanvasElement | null;
  localMaskCanvas: HTMLCanvasElement | null;
  localBlendCanvas: HTMLCanvasElement | null;
  lastRenderError: string | null;
}

const createFrameState = (): FrameState => ({
  sourceKey: null,
  geometryKey: null,
  masterKey: null,
  hslKey: null,
  curveKey: null,
  detailKey: null,
  filmKey: null,
  opticsKey: null,
  pipelineKey: null,
  outputKey: null,
  tilePlanKey: null,
  uploadedGeometryKey: null,
  geometryCanvas: null,
  localMaskCanvas: null,
  localBlendCanvas: null,
  lastRenderError: null,
});

/**
 * Owns PipelineRenderer instances for preview/export slots.
 * - Preview uses a single fixed slot.
 * - Export can use multiple slots for concurrent exports.
 */
export class RenderManager {
  private readonly renderers = new Map<string, PipelineRenderer>();
  private readonly frameStates = new Map<string, FrameState>();

  private resolveSlotId(mode: RenderMode, slotId?: string): string {
    const normalizedSlotId = slotId?.trim();
    if (normalizedSlotId) {
      return normalizedSlotId;
    }
    return mode === "preview" ? "preview-main" : "export-main";
  }

  private resolveKey(mode: RenderMode, slotId?: string): string {
    return `${mode}:${this.resolveSlotId(mode, slotId)}`;
  }

  private matchesSlotPrefix(mode: RenderMode, key: string, slotPrefix: string) {
    const modePrefix = `${mode}:`;
    if (!key.startsWith(modePrefix)) {
      return false;
    }
    const resolvedSlotId = key.slice(modePrefix.length);
    return resolvedSlotId === slotPrefix || resolvedSlotId.startsWith(`${slotPrefix}:`);
  }

  private resetFrameState(state: FrameState) {
    if (state.geometryCanvas) {
      state.geometryCanvas.width = 0;
      state.geometryCanvas.height = 0;
    }
    if (state.localMaskCanvas) {
      state.localMaskCanvas.width = 0;
      state.localMaskCanvas.height = 0;
    }
    if (state.localBlendCanvas) {
      state.localBlendCanvas.width = 0;
      state.localBlendCanvas.height = 0;
    }
    state.geometryCanvas = null;
    state.localMaskCanvas = null;
    state.localBlendCanvas = null;
    state.sourceKey = null;
    state.geometryKey = null;
    state.masterKey = null;
    state.hslKey = null;
    state.curveKey = null;
    state.detailKey = null;
    state.filmKey = null;
    state.opticsKey = null;
    state.pipelineKey = null;
    state.outputKey = null;
    state.tilePlanKey = null;
    state.uploadedGeometryKey = null;
    state.lastRenderError = null;
  }

  private getFrameStateRef(mode: RenderMode, slotId?: string): FrameState {
    const key = this.resolveKey(mode, slotId);
    const existing = this.frameStates.get(key);
    if (existing) {
      return existing;
    }
    const created = createFrameState();
    this.frameStates.set(key, created);
    return created;
  }

  private invalidateGpuState(mode: RenderMode, slotId?: string) {
    const state = this.getFrameStateRef(mode, slotId);
    state.pipelineKey = null;
    state.outputKey = null;
    state.tilePlanKey = null;
    state.uploadedGeometryKey = null;
    state.lastRenderError = null;
  }

  private releaseGeometryCanvas(mode: RenderMode, slotId?: string) {
    const state = this.getFrameStateRef(mode, slotId);
    if (state.geometryCanvas) {
      state.geometryCanvas.width = 0;
      state.geometryCanvas.height = 0;
      state.geometryCanvas = null;
    }
  }

  private releaseLocalScratchCanvases(mode: RenderMode, slotId?: string) {
    const state = this.getFrameStateRef(mode, slotId);
    if (state.localMaskCanvas) {
      state.localMaskCanvas.width = 0;
      state.localMaskCanvas.height = 0;
      state.localMaskCanvas = null;
    }
    if (state.localBlendCanvas) {
      state.localBlendCanvas.width = 0;
      state.localBlendCanvas.height = 0;
      state.localBlendCanvas = null;
    }
  }

  private createRenderer(mode: RenderMode, width: number, height: number): PipelineRenderer {
    const canvas = document.createElement("canvas");
    const renderer = new PipelineRenderer(canvas, width, height, {
      preserveDrawingBuffer: mode === "export",
      label: mode,
    });

    if (!renderer.isWebGL2) {
      renderer.dispose();
      throw new Error("WebGL2 is not available.");
    }

    return renderer;
  }

  /**
   * Return a healthy renderer for the requested mode/slot, recreating after context loss.
   */
  getRenderer(mode: RenderMode, width: number, height: number, slotId?: string): PipelineRenderer {
    const key = this.resolveKey(mode, slotId);
    let renderer = this.renderers.get(key) ?? null;

    if (renderer?.isContextLost) {
      renderer.dispose();
      renderer = null;
      this.renderers.delete(key);
      this.invalidateGpuState(mode, slotId);
    }

    if (!renderer) {
      renderer = this.createRenderer(mode, width, height);
      this.renderers.set(key, renderer);
      this.invalidateGpuState(mode, slotId);
    }

    return renderer;
  }

  getFrameState(mode: RenderMode, slotId?: string): FrameState {
    return this.getFrameStateRef(mode, slotId);
  }

  clearGeometryCache(mode: RenderMode, slotId?: string): void {
    if (slotId) {
      this.releaseGeometryCanvas(mode, slotId);
      this.releaseLocalScratchCanvases(mode, slotId);
      const state = this.getFrameStateRef(mode, slotId);
      state.sourceKey = null;
      state.geometryKey = null;
      return;
    }

    const modePrefix = `${mode}:`;
    for (const key of this.frameStates.keys()) {
      if (!key.startsWith(modePrefix)) {
        continue;
      }
      const resolvedSlotId = key.slice(modePrefix.length);
      this.releaseGeometryCanvas(mode, resolvedSlotId);
      this.releaseLocalScratchCanvases(mode, resolvedSlotId);
      const state = this.getFrameStateRef(mode, resolvedSlotId);
      state.sourceKey = null;
      state.geometryKey = null;
    }
  }

  /**
   * Read max texture size from the renderer's GL context.
   */
  getMaxTextureSize(mode: RenderMode, slotId?: string): number {
    return this.getRenderer(mode, 1, 1, slotId).maxTextureSize;
  }

  dispose(mode: RenderMode, slotId?: string): void {
    if (slotId) {
      const key = this.resolveKey(mode, slotId);
      const renderer = this.renderers.get(key);
      if (renderer) {
        renderer.dispose();
        this.renderers.delete(key);
      }
      const state = this.frameStates.get(key);
      if (state) {
        this.resetFrameState(state);
        this.frameStates.delete(key);
      }
      return;
    }

    const modePrefix = `${mode}:`;
    for (const [key, renderer] of Array.from(this.renderers.entries())) {
      if (!key.startsWith(modePrefix)) {
        continue;
      }
      renderer.dispose();
      this.renderers.delete(key);
    }
    for (const [key, state] of Array.from(this.frameStates.entries())) {
      if (!key.startsWith(modePrefix)) {
        continue;
      }
      this.resetFrameState(state);
      this.frameStates.delete(key);
    }
  }

  disposeBySlotPrefix(mode: RenderMode, slotPrefix: string): void {
    const normalizedSlotPrefix = slotPrefix.trim();
    if (!normalizedSlotPrefix) {
      this.dispose(mode);
      return;
    }

    for (const [key, renderer] of Array.from(this.renderers.entries())) {
      if (!this.matchesSlotPrefix(mode, key, normalizedSlotPrefix)) {
        continue;
      }
      renderer.dispose();
      this.renderers.delete(key);
    }

    for (const [key, state] of Array.from(this.frameStates.entries())) {
      if (!this.matchesSlotPrefix(mode, key, normalizedSlotPrefix)) {
        continue;
      }
      this.resetFrameState(state);
      this.frameStates.delete(key);
    }
  }

  disposeAll(): void {
    for (const renderer of this.renderers.values()) {
      renderer.dispose();
    }
    this.renderers.clear();

    for (const state of this.frameStates.values()) {
      this.resetFrameState(state);
    }
    this.frameStates.clear();
  }
}
