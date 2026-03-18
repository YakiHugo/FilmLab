import { renderDocumentToCanvas } from "@/features/editor/renderDocumentCanvas";
import { releaseRenderSlots } from "@/lib/imageProcessing";
import type {
  Asset,
  CanvasDocument,
  CanvasImageElement,
  CanvasSlice,
  CanvasTextElement,
} from "@/types";
import { createCanvasImageDocumentRenderContext } from "./boardImageRendering";
import { applyCanvasImagePostProcessing } from "./canvasImagePostProcessing";
import { CANVAS_TEXT_LINE_HEIGHT_MULTIPLIER } from "./textStyle";

interface RenderCanvasDocumentOptions {
  assets: Asset[];
  canvas: HTMLCanvasElement;
  document: CanvasDocument;
  height: number;
  pixelRatio: number;
  width: number;
}

const EXPORT_RENDER_SLOT_PREFIX = "board-export";

const ensureCanvasSize = (canvas: HTMLCanvasElement, width: number, height: number) => {
  const nextWidth = Math.max(1, Math.round(width));
  const nextHeight = Math.max(1, Math.round(height));
  if (canvas.width !== nextWidth) {
    canvas.width = nextWidth;
  }
  if (canvas.height !== nextHeight) {
    canvas.height = nextHeight;
  }
};

const withElementTransform = (
  context: CanvasRenderingContext2D,
  element: Pick<CanvasImageElement | CanvasTextElement, "opacity" | "rotation" | "x" | "y">,
  draw: () => void
) => {
  context.save();
  context.globalAlpha = element.opacity;
  context.translate(element.x, element.y);
  context.rotate((element.rotation * Math.PI) / 180);
  draw();
  context.restore();
};

const wrapTextToWidth = (context: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    const words = paragraph.split(/\s+/);
    let currentLine = words[0] ?? "";
    for (let index = 1; index < words.length; index += 1) {
      const nextLine = `${currentLine} ${words[index]}`;
      if (context.measureText(nextLine).width <= maxWidth) {
        currentLine = nextLine;
        continue;
      }
      lines.push(currentLine);
      currentLine = words[index] ?? "";
    }
    lines.push(currentLine);
  }

  return lines;
};

const drawTextElement = (context: CanvasRenderingContext2D, element: CanvasTextElement) => {
  withElementTransform(context, element, () => {
    context.fillStyle = element.color;
    context.font = `${element.fontSize}px ${element.fontFamily}`;
    context.textAlign = element.textAlign;
    context.textBaseline = "top";

    const lines = wrapTextToWidth(context, element.content, Math.max(1, element.width));
    const lineHeight = element.fontSize * CANVAS_TEXT_LINE_HEIGHT_MULTIPLIER;
    const anchorX =
      element.textAlign === "center"
        ? element.width / 2
        : element.textAlign === "right"
          ? element.width
          : 0;

    lines.forEach((line, index) => {
      context.fillText(line, anchorX, index * lineHeight, element.width);
    });
  });
};

const drawImageElement = async ({
  assetById,
  context,
  element,
  outputScale,
}: {
  assetById: Map<string, Asset>;
  context: CanvasRenderingContext2D;
  element: CanvasImageElement;
  outputScale: { x: number; y: number };
}) => {
  const asset = assetById.get(element.assetId);
  if (!asset) {
    return;
  }

  const imageCanvas = document.createElement("canvas");
  try {
    const renderContext = createCanvasImageDocumentRenderContext({
      asset,
      assetById,
      element,
    });

    await renderDocumentToCanvas({
      canvas: imageCanvas,
      document: renderContext.renderDocument,
      intent: "export-full",
      targetSize: {
        width: Math.max(1, Math.round(element.width * outputScale.x)),
        height: Math.max(1, Math.round(element.height * outputScale.y)),
      },
      timestampText: renderContext.timestampText,
      strictErrors: true,
      renderSlotPrefix: EXPORT_RENDER_SLOT_PREFIX,
    });
    applyCanvasImagePostProcessing(imageCanvas, renderContext.adjustments);

    withElementTransform(context, element, () => {
      context.drawImage(imageCanvas, 0, 0, element.width, element.height);
    });
  } finally {
    imageCanvas.width = 0;
    imageCanvas.height = 0;
  }
};

export const renderCanvasDocumentToCanvas = async ({
  assets,
  canvas,
  document,
  height,
  pixelRatio,
  width,
}: RenderCanvasDocumentOptions) => {
  ensureCanvasSize(canvas, width * pixelRatio, height * pixelRatio);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Failed to acquire canvas export context.");
  }

  const outputScale = {
    x: canvas.width / Math.max(1, document.width),
    y: canvas.height / Math.max(1, document.height),
  };
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const orderedElements = document.elements
    .filter((element) => element.visible)
    .slice()
    .sort((left, right) => left.zIndex - right.zIndex);

  context.save();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.scale(outputScale.x, outputScale.y);
  context.fillStyle = document.backgroundColor;
  context.fillRect(0, 0, document.width, document.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  try {
    for (const element of orderedElements) {
      if (element.type === "image") {
        await drawImageElement({
          assetById,
          context,
          element,
          outputScale,
        });
        continue;
      }

      if (element.type === "text") {
        drawTextElement(context, element);
      }
    }
  } finally {
    context.restore();
    await releaseRenderSlots("export", EXPORT_RENDER_SLOT_PREFIX);
  }
};

export const cropRenderedCanvasSlice = ({
  canvas,
  document: canvasDocument,
  pixelRatio,
  slice,
}: {
  canvas: HTMLCanvasElement;
  document: CanvasDocument;
  pixelRatio: number;
  slice: Pick<CanvasSlice, "height" | "width" | "x" | "y">;
}) => {
  const sliceCanvas = document.createElement("canvas");
  sliceCanvas.width = Math.max(1, Math.round(slice.width * pixelRatio));
  sliceCanvas.height = Math.max(1, Math.round(slice.height * pixelRatio));
  const context = sliceCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Failed to acquire slice export context.");
  }

  const scaleX = canvas.width / Math.max(1, canvasDocument.width);
  const scaleY = canvas.height / Math.max(1, canvasDocument.height);
  context.drawImage(
    canvas,
    slice.x * scaleX,
    slice.y * scaleY,
    slice.width * scaleX,
    slice.height * scaleY,
    0,
    0,
    sliceCanvas.width,
    sliceCanvas.height
  );
  return sliceCanvas;
};
