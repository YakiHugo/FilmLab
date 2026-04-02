import { RenderManager } from "./RenderManager";

let _maskedBlendRenderManager: RenderManager | null = null;
const _maskedBlendMutexPromises = new Map<string, Promise<void>>();

const getMaskedBlendRenderManager = () => {
  if (!_maskedBlendRenderManager) {
    _maskedBlendRenderManager = new RenderManager();
  }
  return _maskedBlendRenderManager;
};

const acquireMaskedBlendMutex = (slotId: string): Promise<() => void> => {
  const previous = _maskedBlendMutexPromises.get(slotId) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  _maskedBlendMutexPromises.set(slotId, current);
  return previous.then(() => () => {
    release();
    if (_maskedBlendMutexPromises.get(slotId) === current) {
      _maskedBlendMutexPromises.delete(slotId);
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

export const blendMaskedCanvasesOnGpu = async ({
  baseCanvas,
  layerCanvas,
  maskCanvas,
  targetCanvas,
  slotId = "masked-canvas-blend",
}: {
  baseCanvas: HTMLCanvasElement;
  layerCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
  targetCanvas: HTMLCanvasElement;
  slotId?: string;
}) => {
  if (
    baseCanvas.width <= 0 ||
    baseCanvas.height <= 0 ||
    baseCanvas.width !== layerCanvas.width ||
    baseCanvas.height !== layerCanvas.height ||
    baseCanvas.width !== maskCanvas.width ||
    baseCanvas.height !== maskCanvas.height
  ) {
    return false;
  }

  const releaseMutex = await acquireMaskedBlendMutex(slotId);
  try {
    const renderManager = getMaskedBlendRenderManager();
    const renderer = renderManager.getRenderer(
      "preview",
      baseCanvas.width,
      baseCanvas.height,
      slotId
    );

    const baseLinear = renderer.captureLinearSource(
      baseCanvas,
      baseCanvas.width,
      baseCanvas.height,
      baseCanvas.width,
      baseCanvas.height,
      {
        decodeSrgb: false,
      }
    );

    try {
      const layerLinear = renderer.captureLinearSource(
        layerCanvas,
        layerCanvas.width,
        layerCanvas.height,
        layerCanvas.width,
        layerCanvas.height,
        {
          decodeSrgb: false,
        }
      );

      try {
        const blended = renderer.blendLinearWithMask(baseLinear, layerLinear, maskCanvas);
        try {
          renderer.presentTextureResult(blended, {
            inputLinear: false,
            enableDither: false,
          });
        } finally {
          blended.release();
        }
      } finally {
        layerLinear.release();
      }
    } finally {
      baseLinear.release();
    }

    return drawRendererCanvasToTarget(renderer.canvas, targetCanvas);
  } catch {
    getMaskedBlendRenderManager().dispose("preview", slotId);
    return false;
  } finally {
    releaseMutex();
  }
};

const disposeMaskedBlendRenderManager = () => {
  _maskedBlendRenderManager?.disposeAll();
  _maskedBlendRenderManager = null;
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", disposeMaskedBlendRenderManager);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposeMaskedBlendRenderManager();
  });
}
