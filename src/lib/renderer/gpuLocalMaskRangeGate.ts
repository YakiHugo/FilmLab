import type { LocalAdjustmentMask } from "@/types";
import { RenderManager } from "./RenderManager";

let _localMaskRangeRenderManager: RenderManager | null = null;
const _localMaskRangeMutexPromises = new Map<string, Promise<void>>();

const getLocalMaskRangeRenderManager = () => {
  if (!_localMaskRangeRenderManager) {
    _localMaskRangeRenderManager = new RenderManager();
  }
  return _localMaskRangeRenderManager;
};

const acquireLocalMaskRangeMutex = (slotId: string): Promise<() => void> => {
  const previous = _localMaskRangeMutexPromises.get(slotId) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  _localMaskRangeMutexPromises.set(slotId, current);
  return previous.then(() => () => {
    release();
    if (_localMaskRangeMutexPromises.get(slotId) === current) {
      _localMaskRangeMutexPromises.delete(slotId);
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

export const applyLocalMaskRangeOnGpu = async ({
  maskCanvas,
  referenceSource,
  mask,
  slotId = "local-mask-range",
}: {
  maskCanvas: HTMLCanvasElement;
  referenceSource: CanvasImageSource;
  mask: LocalAdjustmentMask;
  slotId?: string;
}) => {
  if (maskCanvas.width <= 0 || maskCanvas.height <= 0) {
    return false;
  }

  const releaseMutex = await acquireLocalMaskRangeMutex(slotId);
  try {
    const renderManager = getLocalMaskRangeRenderManager();
    const renderer = renderManager.getRenderer(
      "preview",
      maskCanvas.width,
      maskCanvas.height,
      slotId
    );
    const applied = renderer.applyLocalMaskRangeGateSource(
      referenceSource as TexImageSource,
      maskCanvas.width,
      maskCanvas.height,
      maskCanvas,
      maskCanvas.width,
      maskCanvas.height,
      mask
    );
    if (!applied) {
      return false;
    }
    return drawRendererCanvasToTarget(renderer.canvas, maskCanvas);
  } catch {
    getLocalMaskRangeRenderManager().dispose("preview", slotId);
    return false;
  } finally {
    releaseMutex();
  }
};

const disposeLocalMaskRangeRenderManager = () => {
  _localMaskRangeRenderManager?.disposeAll();
  _localMaskRangeRenderManager = null;
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", disposeLocalMaskRangeRenderManager);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposeLocalMaskRangeRenderManager();
  });
}
