import { renderDocumentToCanvas } from "@/features/editor/renderDocumentCanvas";
import { releaseRenderSlots } from "@/lib/imageProcessing";
import type {
  Asset,
  CanvasWorkbench,
  CanvasImageElement,
  CanvasRenderableElement,
  CanvasShapeElement,
  CanvasSlice,
  CanvasTextElement,
} from "@/types";
import { createCanvasImageDocumentRenderContext } from "./boardImageRendering";
import { applyCanvasImagePostProcessing } from "./canvasImagePostProcessing";
import {
  CANVAS_TEXT_LINE_HEIGHT_MULTIPLIER,
  fitCanvasTextElementToContent,
  splitCanvasTextLines,
} from "./textStyle";

interface RenderCanvasWorkbenchOptions {
  assets: Asset[];
  canvas: HTMLCanvasElement;
  document: CanvasWorkbench;
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
  element: Pick<CanvasImageElement | CanvasTextElement | CanvasShapeElement, "opacity" | "rotation" | "x" | "y"> &
    Partial<Pick<CanvasRenderableElement, "worldOpacity">>,
  draw: () => void
) => {
  context.save();
  context.globalAlpha = element.worldOpacity ?? element.opacity;
  context.translate(element.x, element.y);
  context.rotate((element.rotation * Math.PI) / 180);
  draw();
  context.restore();
};

const drawTextElement = (context: CanvasRenderingContext2D, element: CanvasTextElement) => {
  const layoutElement = fitCanvasTextElementToContent(element, {
    measureText: (line, font) => {
      context.font = `${font.fontSize}px ${font.fontFamily}`;
      return context.measureText(line).width;
    },
  });

  withElementTransform(context, element, () => {
    context.fillStyle = layoutElement.color;
    context.font = `${layoutElement.fontSize}px ${layoutElement.fontFamily}`;
    context.textAlign = layoutElement.textAlign;
    context.textBaseline = "top";

    const lines = splitCanvasTextLines(layoutElement.content);
    const lineHeight = layoutElement.fontSize * CANVAS_TEXT_LINE_HEIGHT_MULTIPLIER;
    const anchorX =
      layoutElement.textAlign === "center"
        ? layoutElement.width / 2
        : layoutElement.textAlign === "right"
          ? layoutElement.width
          : 0;

    lines.forEach((line, index) => {
      context.fillText(line, anchorX, index * lineHeight);
    });
  });
};

const getShapePoints = (element: CanvasShapeElement) =>
  element.points && element.points.length > 0
    ? element.points
    : [
        { x: 0, y: element.height / 2 },
        { x: element.width, y: element.height / 2 },
      ];

const drawArrowHead = (
  context: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  size: number
) => {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const left = {
    x: to.x - Math.cos(angle - Math.PI / 6) * size,
    y: to.y - Math.sin(angle - Math.PI / 6) * size,
  };
  const right = {
    x: to.x - Math.cos(angle + Math.PI / 6) * size,
    y: to.y - Math.sin(angle + Math.PI / 6) * size,
  };
  context.moveTo(left.x, left.y);
  context.lineTo(to.x, to.y);
  context.lineTo(right.x, right.y);
};

const drawShapeElement = (context: CanvasRenderingContext2D, element: CanvasShapeElement) => {
  withElementTransform(context, element, () => {
    context.beginPath();

    if (element.shapeType === "rect") {
      if (element.fill && element.fill !== "transparent") {
        context.fillStyle = element.fill;
        context.fillRect(0, 0, element.width, element.height);
      }
      if (element.strokeWidth > 0) {
        context.lineWidth = element.strokeWidth;
        context.strokeStyle = element.stroke;
        context.strokeRect(0, 0, element.width, element.height);
      }
      return;
    }

    if (element.shapeType === "ellipse") {
      context.save();
      context.translate(element.width / 2, element.height / 2);
      context.scale(Math.max(element.width / 2, 1), Math.max(element.height / 2, 1));
      context.arc(0, 0, 1, 0, Math.PI * 2);
      context.restore();
      if (element.fill && element.fill !== "transparent") {
        context.fillStyle = element.fill;
        context.fill();
      }
      if (element.strokeWidth > 0) {
        context.lineWidth = element.strokeWidth;
        context.strokeStyle = element.stroke;
        context.stroke();
      }
      return;
    }

    const points = getShapePoints(element);
    const [firstPoint, ...restPoints] = points;
    if (!firstPoint) {
      return;
    }

    context.moveTo(firstPoint.x, firstPoint.y);
    for (const point of restPoints) {
      context.lineTo(point.x, point.y);
    }
    context.lineWidth = element.strokeWidth;
    context.strokeStyle = element.stroke;
    context.stroke();

    if (element.shapeType === "arrow" && points.length >= 2) {
      const headSize = Math.max(10, element.strokeWidth * 4);
      context.beginPath();
      if (element.arrowHead?.start) {
        drawArrowHead(context, points[1]!, points[0]!, headSize);
      }
      if (element.arrowHead?.end ?? true) {
        drawArrowHead(context, points[points.length - 2]!, points[points.length - 1]!, headSize);
      }
      context.lineWidth = element.strokeWidth;
      context.strokeStyle = element.stroke;
      context.stroke();
    }
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

export const renderCanvasWorkbenchToCanvas = async ({
  assets,
  canvas,
  document,
  height,
  pixelRatio,
  width,
}: RenderCanvasWorkbenchOptions) => {
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
  const orderedElements = document.elements.filter((element) => element.effectiveVisible);

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
        continue;
      }

      if (element.type === "shape") {
        drawShapeElement(context, element);
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
  document: CanvasWorkbench;
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
