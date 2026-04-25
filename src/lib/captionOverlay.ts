import { clamp } from "@/lib/math";
import type { CaptionOverlayAlignment, CaptionOverlayPosition } from "@/types";

export interface CaptionOverlayRenderParams {
  text: string;
  position: CaptionOverlayPosition;
  alignment: CaptionOverlayAlignment;
  fontSize: number;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  padding: number;
  opacity: number;
}

const CAPTION_FONTS = '"Space Grotesk", "Work Sans", sans-serif';

const ensureCanvasSize = (canvas: HTMLCanvasElement, width: number, height: number) => {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  if (canvas.width !== safeWidth) canvas.width = safeWidth;
  if (canvas.height !== safeHeight) canvas.height = safeHeight;
};

export const renderCaptionOverlayRaster = async ({
  width,
  height,
  params,
}: {
  width: number;
  height: number;
  params: CaptionOverlayRenderParams;
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

  const fontSize = clamp(params.fontSize, 12, 72);
  const padding = clamp(params.padding, 0, 100);
  const margin = Math.max(12, Math.round(Math.min(safeWidth, safeHeight) * 0.04));

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${Math.round(fontSize)}px ${CAPTION_FONTS}`;

  const textHeight = fontSize * 1.2;
  const bgHeight = textHeight + padding * 2;

  let bgTop: number;
  switch (params.position) {
    case "top":
      bgTop = 0;
      break;
    case "center":
      bgTop = (safeHeight - bgHeight) / 2;
      break;
    case "bottom":
    default:
      bgTop = safeHeight - bgHeight;
      break;
  }

  if (params.backgroundOpacity > 0) {
    const bgAlpha = clamp(params.backgroundOpacity / 100, 0, 1);
    ctx.globalAlpha = alpha * bgAlpha;
    ctx.fillStyle = params.backgroundColor;
    ctx.fillRect(0, bgTop, safeWidth, bgHeight);
    ctx.globalAlpha = alpha;
  }

  ctx.fillStyle = params.color;
  ctx.textBaseline = "middle";

  let textX: number;
  switch (params.alignment) {
    case "left":
      ctx.textAlign = "left";
      textX = margin;
      break;
    case "right":
      ctx.textAlign = "right";
      textX = safeWidth - margin;
      break;
    case "center":
    default:
      ctx.textAlign = "center";
      textX = safeWidth / 2;
      break;
  }

  ctx.fillText(text, textX, bgTop + bgHeight / 2);
  ctx.restore();
  return canvas;
};
