import { clamp } from "@/lib/math";
import type { EditingAdjustments } from "@/types";

const TIMESTAMP_FONTS = '"Space Grotesk", "Work Sans", sans-serif';

/**
 * Ensure the timestamp font is loaded before measuring/drawing text.
 * Falls back gracefully after a short timeout so rendering is never blocked.
 */
const ensureFontLoaded = async (): Promise<void> => {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.race([
      document.fonts.load(`16px ${TIMESTAMP_FONTS}`),
      new Promise<void>((resolve) => setTimeout(resolve, 500)),
    ]);
  } catch {
    // Font loading failed — proceed with fallback font
  }
};

/** Pre-warm the font on module load (non-blocking). */
void ensureFontLoaded();

export const applyTimestampOverlay = async (
  canvas: HTMLCanvasElement,
  adjustments: EditingAdjustments,
  timestampText?: string | null
) => {
  if (!adjustments.timestampEnabled || !timestampText) {
    return;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const alpha = clamp(adjustments.timestampOpacity / 100, 0, 1);
  if (alpha <= 0.001) {
    return;
  }

  // Wait for font before measuring text
  await ensureFontLoaded();

  const fontSize = clamp(adjustments.timestampSize, 12, 48);
  const margin = Math.max(12, Math.round(Math.min(canvas.width, canvas.height) * 0.04));
  const text = timestampText.trim();
  if (!text) {
    return;
  }

  context.save();
  context.globalAlpha = alpha;
  context.font = `${Math.round(fontSize)}px ${TIMESTAMP_FONTS}`;
  context.textBaseline = "bottom";
  context.textAlign = "left";
  const textMetrics = context.measureText(text);
  const textWidth = textMetrics.width;
  const textHeight = Math.max(fontSize, fontSize * 1.1);

  let x = margin;
  let y = canvas.height - margin;
  switch (adjustments.timestampPosition) {
    case "bottom-left":
      x = margin;
      y = canvas.height - margin;
      context.textAlign = "left";
      context.textBaseline = "bottom";
      break;
    case "bottom-right":
      x = canvas.width - margin;
      y = canvas.height - margin;
      context.textAlign = "right";
      context.textBaseline = "bottom";
      break;
    case "top-left":
      x = margin;
      y = margin;
      context.textAlign = "left";
      context.textBaseline = "top";
      break;
    case "top-right":
      x = canvas.width - margin;
      y = margin;
      context.textAlign = "right";
      context.textBaseline = "top";
      break;
    default:
      break;
  }

  const bgPaddingX = fontSize * 0.5;
  const bgPaddingY = fontSize * 0.35;
  const rectWidth = textWidth + bgPaddingX * 2;
  const rectHeight = textHeight + bgPaddingY * 2;

  let rectLeft = x - bgPaddingX;
  if (context.textAlign === "right") {
    rectLeft = x - rectWidth + bgPaddingX;
  }
  let rectTop = y - rectHeight + bgPaddingY;
  if (context.textBaseline === "top") {
    rectTop = y - bgPaddingY;
  }
  rectLeft = clamp(rectLeft, 0, Math.max(0, canvas.width - rectWidth));
  rectTop = clamp(rectTop, 0, Math.max(0, canvas.height - rectHeight));

  context.fillStyle = "rgba(0, 0, 0, 0.34)";
  context.fillRect(rectLeft, rectTop, rectWidth, rectHeight);
  context.fillStyle = "rgba(255, 250, 242, 0.95)";
  context.fillText(text, x, y);
  context.restore();
};
