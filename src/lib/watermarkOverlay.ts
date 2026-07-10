import { clamp } from "@/lib/math";

export interface WatermarkOverlayRenderParams {
  text: string;
  opacity: number;
  fontSize: number;
  angle: number;
  density: number;
  color: string;
}

const WATERMARK_FONTS = '"Space Grotesk", "Work Sans", sans-serif';
const MAX_RENDER_LAYOUT_PX = 8192;

const ensureCanvasSize = (canvas: HTMLCanvasElement, width: number, height: number) => {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  if (canvas.width !== safeWidth) canvas.width = safeWidth;
  if (canvas.height !== safeHeight) canvas.height = safeHeight;
};

export const renderWatermarkOverlayRaster = async ({
  width,
  height,
  params,
}: {
  width: number;
  height: number;
  params: WatermarkOverlayRenderParams;
}): Promise<HTMLCanvasElement | null> => {
  if (typeof document === "undefined") return null;

  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const text = (params.text ?? "").trim();
  if (!text) return null;

  const alpha = clamp(params.opacity / 100, 0, 1);
  if (alpha <= 0.001) return null;

  const canvas = document.createElement("canvas");
  ensureCanvasSize(canvas, safeWidth, safeHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.width = 0;
    canvas.height = 0;
    return null;
  }

  const fontSize = clamp(params.fontSize, 1, MAX_RENDER_LAYOUT_PX);
  const angleRad = (params.angle * Math.PI) / 180;
  const density = clamp(params.density, 0.5, 5);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${Math.round(fontSize)}px ${WATERMARK_FONTS}`;
  ctx.fillStyle = params.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const spacingX = (textWidth + fontSize * 2) / density;
  const spacingY = (fontSize * 3) / density;

  const diagonal = Math.sqrt(safeWidth * safeWidth + safeHeight * safeHeight);
  const cols = Math.ceil(diagonal / spacingX) + 2;
  const rows = Math.ceil(diagonal / spacingY) + 2;

  ctx.translate(safeWidth / 2, safeHeight / 2);
  ctx.rotate(angleRad);

  const startX = -(cols * spacingX) / 2;
  const startY = -(rows * spacingY) / 2;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      ctx.fillText(text, startX + col * spacingX, startY + row * spacingY);
    }
  }

  ctx.restore();
  return canvas;
};
