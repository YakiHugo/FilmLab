import type { LocalAdjustmentMask } from "@/types";
import { RenderManager } from "./RenderManager";

let _localMaskShapeRenderManager: RenderManager | null = null;
const _localMaskShapeMutexPromises = new Map<string, Promise<void>>();

const getLocalMaskShapeRenderManager = () => {
  if (!_localMaskShapeRenderManager) {
    _localMaskShapeRenderManager = new RenderManager();
  }
  return _localMaskShapeRenderManager;
};

const acquireLocalMaskShapeMutex = (slotId: string): Promise<() => void> => {
  const previous = _localMaskShapeMutexPromises.get(slotId) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  _localMaskShapeMutexPromises.set(slotId, current);
  return previous.then(() => () => {
    release();
    if (_localMaskShapeMutexPromises.get(slotId) === current) {
      _localMaskShapeMutexPromises.delete(slotId);
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

export const renderLocalMaskShapeOnGpu = async ({
  maskCanvas,
  mask,
  slotId = "local-mask-shape",
  fullWidth,
  fullHeight,
  offsetX,
  offsetY,
}: {
  maskCanvas: HTMLCanvasElement;
  mask: LocalAdjustmentMask;
  slotId?: string;
  fullWidth?: number;
  fullHeight?: number;
  offsetX?: number;
  offsetY?: number;
}) => {
  if (maskCanvas.width <= 0 || maskCanvas.height <= 0) {
    return false;
  }

  const releaseMutex = await acquireLocalMaskShapeMutex(slotId);
  try {
    const renderManager = getLocalMaskShapeRenderManager();
    const renderer = renderManager.getRenderer(
      "preview",
      maskCanvas.width,
      maskCanvas.height,
      slotId
    );
    const rendered = renderer.renderLocalMaskShape(mask, maskCanvas.width, maskCanvas.height, {
      fullWidth,
      fullHeight,
      offsetX,
      offsetY,
    });
    if (!rendered) {
      return false;
    }
    return drawRendererCanvasToTarget(renderer.canvas, maskCanvas);
  } catch {
    getLocalMaskShapeRenderManager().dispose("preview", slotId);
    return false;
  } finally {
    releaseMutex();
  }
};

const disposeLocalMaskShapeRenderManager = () => {
  _localMaskShapeRenderManager?.disposeAll();
  _localMaskShapeRenderManager = null;
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", disposeLocalMaskShapeRenderManager);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposeLocalMaskShapeRenderManager();
  });
}
