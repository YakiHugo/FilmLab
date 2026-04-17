import {
  createEmptyRenderBoundaryMetrics,
  createRenderSurfaceHandle,
  type RenderBoundaryMetrics,
  type RenderSurfaceHandle,
} from "@/lib/renderSurfaceHandle";
import { RenderManager, type RenderMode } from "./RenderManager";
import type { PipelineRenderer } from "./PipelineRenderer";

let _surfaceOperationRenderManager: RenderManager | null = null;
const _surfaceOperationMutexPromises = new Map<string, Promise<void>>();

const getSurfaceOperationRenderManager = () => {
  if (!_surfaceOperationRenderManager) {
    _surfaceOperationRenderManager = new RenderManager();
  }
  return _surfaceOperationRenderManager;
};

const resolveSlotId = (mode: RenderMode, slotId?: string) => {
  const normalizedSlotId = slotId?.trim();
  if (normalizedSlotId) {
    return normalizedSlotId;
  }
  return mode === "preview" ? "preview-main" : "export-main";
};

const resolveMutexKey = (mode: RenderMode, slotId?: string) =>
  `${mode}:${resolveSlotId(mode, slotId)}`;

const acquireSurfaceOperationMutex = (mode: RenderMode, slotId?: string): Promise<() => void> => {
  const key = resolveMutexKey(mode, slotId);
  const previous = _surfaceOperationMutexPromises.get(key) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  _surfaceOperationMutexPromises.set(key, current);
  return previous.then(() => () => {
    release();
    if (_surfaceOperationMutexPromises.get(key) === current) {
      _surfaceOperationMutexPromises.delete(key);
    }
  });
};

export const materializeSurfaceToCanvas = (
  surface: RenderSurfaceHandle,
  targetCanvas: HTMLCanvasElement
) => {
  try {
    surface.materializeToCanvas(targetCanvas);
    return true;
  } catch {
    return false;
  }
};

export const runRendererSurfaceOperation = async ({
  mode = "preview",
  width,
  height,
  slotId,
  render,
  metrics = createEmptyRenderBoundaryMetrics(),
}: {
  mode?: RenderMode;
  width: number;
  height: number;
  slotId?: string;
  render: (renderer: PipelineRenderer) => boolean;
  metrics?: RenderBoundaryMetrics;
}): Promise<RenderSurfaceHandle | null> => {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  if (safeWidth <= 0 || safeHeight <= 0) {
    return null;
  }

  const resolvedSlotId = resolveSlotId(mode, slotId);
  const releaseMutex = await acquireSurfaceOperationMutex(mode, resolvedSlotId);
  try {
    const renderManager = getSurfaceOperationRenderManager();
    const renderer = renderManager.getRenderer(mode, safeWidth, safeHeight, resolvedSlotId);
    const rendered = render(renderer);
    if (!rendered) {
      return null;
    }
    return createRenderSurfaceHandle({
      kind: "renderer-slot",
      mode,
      slotId: resolvedSlotId,
      sourceCanvas: renderer.canvas,
      metrics,
    });
  } catch {
    getSurfaceOperationRenderManager().dispose(mode, resolvedSlotId);
    return null;
  } finally {
    releaseMutex();
  }
};

export const runRendererPixelReadbackOperation = async ({
  mode = "preview",
  width,
  height,
  slotId,
  render,
}: {
  mode?: RenderMode;
  width: number;
  height: number;
  slotId?: string;
  render: (renderer: PipelineRenderer) => boolean;
}): Promise<Uint8Array | null> => {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  if (safeWidth <= 0 || safeHeight <= 0) {
    return null;
  }

  const resolvedSlotId = resolveSlotId(mode, slotId);
  const releaseMutex = await acquireSurfaceOperationMutex(mode, resolvedSlotId);
  try {
    const renderManager = getSurfaceOperationRenderManager();
    const renderer = renderManager.getRenderer(mode, safeWidth, safeHeight, resolvedSlotId);
    const rendered = render(renderer);
    if (!rendered) {
      return null;
    }
    return await renderer.extractPixelsAsync();
  } catch {
    getSurfaceOperationRenderManager().dispose(mode, resolvedSlotId);
    return null;
  } finally {
    releaseMutex();
  }
};

const disposeSurfaceOperationRenderManager = () => {
  _surfaceOperationRenderManager?.disposeAll();
  _surfaceOperationRenderManager = null;
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", disposeSurfaceOperationRenderManager);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposeSurfaceOperationRenderManager();
  });
}
