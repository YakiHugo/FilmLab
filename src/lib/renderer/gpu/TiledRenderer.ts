export interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
}

export interface TilePlanOptions {
  width: number;
  height: number;
  tileSize?: number;
  overlap?: number;
}

export const createTilePlan = ({
  width,
  height,
  tileSize = 2048,
  overlap = 64,
}: TilePlanOptions): TileRect[] => {
  const safeTileSize = Math.max(128, Math.round(tileSize));
  const safeOverlap = Math.max(0, Math.round(overlap));
  const result: TileRect[] = [];

  for (let y = 0; y < height; y += safeTileSize) {
    for (let x = 0; x < width; x += safeTileSize) {
      const contentWidth = Math.min(safeTileSize, width - x);
      const contentHeight = Math.min(safeTileSize, height - y);
      const padLeft = x > 0 ? safeOverlap : 0;
      const padTop = y > 0 ? safeOverlap : 0;
      const padRight = x + contentWidth < width ? safeOverlap : 0;
      const padBottom = y + contentHeight < height ? safeOverlap : 0;

      result.push({
        x: Math.max(0, x - padLeft),
        y: Math.max(0, y - padTop),
        width: Math.min(width, contentWidth + padLeft + padRight),
        height: Math.min(height, contentHeight + padTop + padBottom),
        contentX: x,
        contentY: y,
        contentWidth,
        contentHeight,
      });
    }
  }
  return result;
};

/**
 * Asynchronous GPU readback helper using fenceSync polling.
 */
export const readPixelsAsync = async (
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  options?: {
    timeoutMs?: number;
    pollIntervalMs?: number;
  }
): Promise<Uint8Array> => {
  const timeoutMs = Math.max(1, Math.round(options?.timeoutMs ?? 3000));
  const pollIntervalMs = Math.max(0, Math.round(options?.pollIntervalMs ?? 3));
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  if (!sync) {
    throw new Error("Failed to create GPU sync for async readback.");
  }

  try {
    const startedAt = Date.now();
    // Poll GPU completion without blocking the event loop.
    while (true) {
      if (typeof gl.isContextLost === "function" && gl.isContextLost()) {
        throw new Error("WebGL context lost during async readback.");
      }
      const status = gl.clientWaitSync(sync, 0, 0);
      if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
        break;
      }
      if (status === gl.WAIT_FAILED) {
        throw new Error("GPU fence wait failed during async readback.");
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(
          `Timed out waiting for GPU readback fence (${Math.max(1, width)}x${Math.max(
            1,
            height
          )}, timeout=${timeoutMs}ms).`
        );
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, pollIntervalMs);
      });
    }
    const pixels = new Uint8Array(Math.max(1, width) * Math.max(1, height) * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  } finally {
    gl.deleteSync(sync);
  }
};
