import { releaseRenderSlots } from "@/lib/imageProcessing";
import { renderSingleImageToCanvas } from "@/render/image";
import type {
  Asset,
  CanvasWorkbench,
  CanvasRenderableImageElement,
  CanvasRenderableShapeElement,
  CanvasRenderableTextElement,
  CanvasSlice,
} from "@/types";
import { createCanvasImageDocumentRenderContext } from "./boardImageRendering";
import { resolveCanvasShapeFillPaint } from "./shapeStyle";
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
  onProgress?: (progress: number) => void;
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
  element: Pick<
    CanvasRenderableImageElement | CanvasRenderableTextElement | CanvasRenderableShapeElement,
    "opacity" | "rotation" | "x" | "y" | "worldOpacity"
  >,
  draw: () => void
) => {
  context.save();
  context.globalAlpha = element.worldOpacity ?? element.opacity;
  context.translate(element.x, element.y);
  context.rotate((element.rotation * Math.PI) / 180);
  draw();
  context.restore();
};

const drawTextElement = (
  context: CanvasRenderingContext2D,
  element: CanvasRenderableTextElement
) => {
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

const getShapePoints = (element: CanvasRenderableShapeElement) =>
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
  length: number,
  width: number
) => {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const base = {
    x: to.x - Math.cos(angle) * length,
    y: to.y - Math.sin(angle) * length,
  };
  const halfWidth = width / 2;
  const left = {
    x: base.x - Math.sin(angle) * halfWidth,
    y: base.y + Math.cos(angle) * halfWidth,
  };
  const right = {
    x: base.x + Math.sin(angle) * halfWidth,
    y: base.y - Math.cos(angle) * halfWidth,
  };
  context.lineTo(to.x, to.y);
  context.lineTo(left.x, left.y);
  context.lineTo(right.x, right.y);
  context.lineTo(to.x, to.y);
  context.closePath();
};

const traceRoundedRectPath = (
  context: CanvasRenderingContext2D,
  {
    height,
    radius,
    width,
  }: {
    height: number;
    radius: number;
    width: number;
  }
) => {
  const boundedRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.moveTo(boundedRadius, 0);
  context.lineTo(width - boundedRadius, 0);
  context.arcTo(width, 0, width, boundedRadius, boundedRadius);
  context.lineTo(width, height - boundedRadius);
  context.arcTo(width, height, width - boundedRadius, height, boundedRadius);
  context.lineTo(boundedRadius, height);
  context.arcTo(0, height, 0, height - boundedRadius, boundedRadius);
  context.lineTo(0, boundedRadius);
  context.arcTo(0, 0, boundedRadius, 0, boundedRadius);
  context.closePath();
};

const drawShapeElement = (
  context: CanvasRenderingContext2D,
  element: CanvasRenderableShapeElement
) => {
  const resolveShapeFill = () => {
    const fillPaint = resolveCanvasShapeFillPaint(element);
    if (fillPaint.kind === "solid") {
      return fillPaint.color === "transparent" ? null : fillPaint.color;
    }

    const gradient = context.createLinearGradient(
      fillPaint.startPoint.x,
      fillPaint.startPoint.y,
      fillPaint.endPoint.x,
      fillPaint.endPoint.y
    );
    gradient.addColorStop(fillPaint.colorStops[0], fillPaint.colorStops[1]);
    gradient.addColorStop(fillPaint.colorStops[2], fillPaint.colorStops[3]);
    return gradient;
  };

  withElementTransform(context, element, () => {
    context.beginPath();

    if (element.shapeType === "rect") {
      const radius = Math.max(element.radius ?? 0, 0);
      const fill = resolveShapeFill();
      if (radius > 0) {
        traceRoundedRectPath(context, {
          height: element.height,
          radius,
          width: element.width,
        });
        if (fill) {
          context.fillStyle = fill;
          context.fill();
        }
        if (element.strokeWidth > 0) {
          context.lineWidth = element.strokeWidth;
          context.strokeStyle = element.stroke;
          context.stroke();
        }
      } else {
        if (fill) {
          context.fillStyle = fill;
          context.fillRect(0, 0, element.width, element.height);
        }
        if (element.strokeWidth > 0) {
          context.lineWidth = element.strokeWidth;
          context.strokeStyle = element.stroke;
          context.strokeRect(0, 0, element.width, element.height);
        }
      }
      return;
    }

    if (element.shapeType === "ellipse") {
      context.save();
      context.translate(element.width / 2, element.height / 2);
      context.scale(Math.max(element.width / 2, 1), Math.max(element.height / 2, 1));
      context.arc(0, 0, 1, 0, Math.PI * 2);
      context.restore();
      const fill = resolveShapeFill();
      if (fill) {
        context.fillStyle = fill;
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

    context.lineCap = "round";
    context.lineJoin = "round";
    context.moveTo(firstPoint.x, firstPoint.y);
    for (const point of restPoints) {
      context.lineTo(point.x, point.y);
    }
    context.lineWidth = element.strokeWidth;
    context.strokeStyle = element.stroke;
    context.stroke();

    if (element.shapeType === "arrow" && points.length >= 2) {
      const pointerLength = 10;
      const pointerWidth = 10;
      context.beginPath();
      if (element.arrowHead?.start) {
        context.moveTo(points[0]!.x, points[0]!.y);
        drawArrowHead(context, points[1]!, points[0]!, pointerLength, pointerWidth);
      }
      if (element.arrowHead?.end ?? true) {
        context.moveTo(points[points.length - 1]!.x, points[points.length - 1]!.y);
        drawArrowHead(
          context,
          points[points.length - 2]!,
          points[points.length - 1]!,
          pointerLength,
          pointerWidth
        );
      }
      context.fillStyle = element.stroke;
      context.fill();
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
  element: CanvasRenderableImageElement;
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
      element,
    });

    await renderSingleImageToCanvas({
      canvas: imageCanvas,
      document: renderContext.imageDocument,
      request: {
        intent: "export",
        quality: "full",
        targetSize: {
          width: Math.max(1, Math.round(element.width * outputScale.x)),
          height: Math.max(1, Math.round(element.height * outputScale.y)),
        },
        timestampText: renderContext.timestampText,
        renderSlotId: EXPORT_RENDER_SLOT_PREFIX,
      },
    });

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
  onProgress,
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
    for (let i = 0; i < orderedElements.length; i++) {
      const element = orderedElements[i]!;
      if (element.type === "image") {
        await drawImageElement({
          assetById,
          context,
          element,
          outputScale,
        });
      } else if (element.type === "text") {
        drawTextElement(context, element);
      } else if (element.type === "shape") {
        drawShapeElement(context, element);
      }
      onProgress?.((i + 1) / orderedElements.length);
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
