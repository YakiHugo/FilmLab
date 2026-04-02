import type { Filter2dPostProcessingParams } from "@/lib/filter2dShared";
import { RenderManager } from "./RenderManager";

let _filter2dRenderManager: RenderManager | null = null;
const _filter2dMutexPromises = new Map<string, Promise<void>>();

const getFilter2dRenderManager = () => {
  if (!_filter2dRenderManager) {
    _filter2dRenderManager = new RenderManager();
  }
  return _filter2dRenderManager;
};

const acquireFilter2dMutex = (slotId: string): Promise<() => void> => {
  const previous = _filter2dMutexPromises.get(slotId) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  _filter2dMutexPromises.set(slotId, current);
  return previous.then(() => () => {
    release();
    if (_filter2dMutexPromises.get(slotId) === current) {
      _filter2dMutexPromises.delete(slotId);
    }
  });
};

const drawRendererCanvasToTarget = (
  rendererCanvas: HTMLCanvasElement,
  targetCanvas: HTMLCanvasElement
) => {
  const targetContext = targetCanvas.getContext("2d", { willReadFrequently: true });
  if (!targetContext) {
    return false;
  }
  if (targetCanvas.width !== rendererCanvas.width) {
    targetCanvas.width = rendererCanvas.width;
  }
  if (targetCanvas.height !== rendererCanvas.height) {
    targetCanvas.height = rendererCanvas.height;
  }
  targetContext.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  targetContext.drawImage(rendererCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
  return true;
};

export const applyFilter2dOnGpu = async ({
  canvas,
  params,
  slotId = "filter2d-postprocess",
}: {
  canvas: HTMLCanvasElement;
  params: Filter2dPostProcessingParams;
  slotId?: string;
}) => {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return false;
  }

  const releaseMutex = await acquireFilter2dMutex(slotId);
  try {
    const renderManager = getFilter2dRenderManager();
    const renderer = renderManager.getRenderer("preview", canvas.width, canvas.height, slotId);
    const applied = renderer.applyFilter2dSource(canvas, canvas.width, canvas.height, params);
    if (!applied) {
      return false;
    }
    return drawRendererCanvasToTarget(renderer.canvas, canvas);
  } catch {
    getFilter2dRenderManager().dispose("preview", slotId);
    return false;
  } finally {
    releaseMutex();
  }
};

const disposeFilter2dRenderManager = () => {
  _filter2dRenderManager?.disposeAll();
  _filter2dRenderManager = null;
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", disposeFilter2dRenderManager);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposeFilter2dRenderManager();
  });
}
