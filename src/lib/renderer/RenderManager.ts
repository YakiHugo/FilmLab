import { PixiRenderer } from "./PixiRenderer";

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
  preFilmKey: string | null;
  pixiKey: string | null;
  outputKey: string | null;
  uploadedGeometryKey: string | null;
  geometryCanvas: HTMLCanvasElement | null;
  preFilmCanvas: HTMLCanvasElement | null;
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
  preFilmKey: null,
  pixiKey: null,
  outputKey: null,
  uploadedGeometryKey: null,
  geometryCanvas: null,
  preFilmCanvas: null,
  localMaskCanvas: null,
  localBlendCanvas: null,
  lastRenderError: null,
});

/**
 * Owns PixiRenderer instances for preview/export slots.
 * - Preview uses a single fixed slot.
 * - Export can use multiple slots for concurrent exports.
 */
export class RenderManager {
  private readonly renderers = new Map<string, PixiRenderer>();
  private readonly frameStates = new Map<string, FrameState>();

  private resolveSlotId(mode: RenderMode, slotId?: string): string {
    if (mode === "preview") {
      return "preview-main";
    }
    return slotId?.trim() ? slotId : "export-main";
  }

  private resolveKey(mode: RenderMode, slotId?: string): string {
    return `${mode}:${this.resolveSlotId(mode, slotId)}`;
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
    state.preFilmKey = null;
    state.pixiKey = null;
    state.outputKey = null;
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

  private releasePreFilmCanvas(mode: RenderMode, slotId?: string) {
    const state = this.getFrameStateRef(mode, slotId);
    if (state.preFilmCanvas) {
      state.preFilmCanvas.width = 0;
      state.preFilmCanvas.height = 0;
      state.preFilmCanvas = null;
    }
    state.preFilmKey = null;
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

  private createRenderer(mode: RenderMode, width: number, height: number): PixiRenderer {
    const canvas = document.createElement("canvas");
    const renderer = new PixiRenderer(canvas, width, height, {
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
  getRenderer(mode: RenderMode, width: number, height: number, slotId?: string): PixiRenderer {
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
      this.releasePreFilmCanvas(mode, slotId);
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
      this.releasePreFilmCanvas(mode, resolvedSlotId);
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
      this.releaseLocalScratchCanvases(mode, slotId);
      this.invalidateGpuState(mode, slotId);
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
    for (const key of Array.from(this.frameStates.keys())) {
      if (!key.startsWith(modePrefix)) {
        continue;
      }
      const resolvedSlotId = key.slice(modePrefix.length);
      this.releaseLocalScratchCanvases(mode, resolvedSlotId);
      this.invalidateGpuState(mode, resolvedSlotId);
    }
  }

  disposeAll(): void {
    for (const renderer of this.renderers.values()) {
      renderer.dispose();
    }
    this.renderers.clear();

    for (const state of this.frameStates.values()) {
      if (state.geometryCanvas) {
        state.geometryCanvas.width = 0;
        state.geometryCanvas.height = 0;
      }
      if (state.preFilmCanvas) {
        state.preFilmCanvas.width = 0;
        state.preFilmCanvas.height = 0;
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
      state.preFilmCanvas = null;
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
      state.preFilmKey = null;
      state.pixiKey = null;
      state.outputKey = null;
      state.uploadedGeometryKey = null;
      state.lastRenderError = null;
    }
  }
}
