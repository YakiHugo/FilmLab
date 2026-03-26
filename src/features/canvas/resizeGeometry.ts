import type {
  CanvasNodePropertyPatch,
  CanvasRenderableElement,
  CanvasShapeElement,
  CanvasShapePoint,
  CanvasTextElement,
  CanvasTextFontSizeTier,
  CanvasWorkbench,
} from "@/types";
import { worldPointToLocalPoint } from "./documentGraph";
import {
  fitCanvasTextElementToContent,
  getClosestCanvasTextFontSizeTier,
  scaleCanvasTextFontSize,
} from "./textStyle";

const MIN_CANVAS_RESIZE_DIMENSION = 1;
const MIN_CANVAS_RESIZE_SCALE = 0.001;
const MIN_CANVAS_TEXT_FONT_SIZE = 8;
export const MIN_CANVAS_IMAGE_SHORT_EDGE = 32;

export interface CanvasResizeTransformBox {
  height: number;
  rotation: number;
  width: number;
  x: number;
  y: number;
}

export interface CanvasResizeNodeSnapshot {
  scaleX: number;
  scaleY: number;
  x: number;
  y: number;
}

export interface CanvasResizePreview {
  fontSize?: number;
  fontSizeTier?: CanvasTextFontSizeTier;
  height: number;
  points?: CanvasShapePoint[];
  radius?: number;
  strokeWidth?: number;
  width: number;
  x: number;
  y: number;
}

export interface CanvasResizePlan {
  patch: CanvasNodePropertyPatch;
  preview: CanvasResizePreview;
}

type CanvasResizeDominantAxis = "x" | "y";

const clampDimension = (value: number) =>
  Math.max(MIN_CANVAS_RESIZE_DIMENSION, Math.round(Math.max(0, value) * 1000) / 1000);

const clampScale = (value: number) => Math.max(MIN_CANVAS_RESIZE_SCALE, Math.abs(value));

const clampStrokeWidth = (value: number) => Math.max(0, Math.round(Math.max(0, value) * 1000) / 1000);

const clampFontSize = (value: number) =>
  Math.round(Math.max(MIN_CANVAS_TEXT_FONT_SIZE, value) * 1000) / 1000;

const resolveAspectRatio = (value?: number | null) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

export const resolveMinimumCanvasImageDimensions = (aspectRatio?: number | null) => {
  const safeAspectRatio = resolveAspectRatio(aspectRatio);
  if (!safeAspectRatio) {
    return {
      width: MIN_CANVAS_IMAGE_SHORT_EDGE,
      height: MIN_CANVAS_IMAGE_SHORT_EDGE,
    };
  }

  if (safeAspectRatio >= 1) {
    return {
      width: clampDimension(MIN_CANVAS_IMAGE_SHORT_EDGE * safeAspectRatio),
      height: MIN_CANVAS_IMAGE_SHORT_EDGE,
    };
  }

  return {
    width: MIN_CANVAS_IMAGE_SHORT_EDGE,
    height: clampDimension(MIN_CANVAS_IMAGE_SHORT_EDGE / safeAspectRatio),
  };
};

const resolveVisualScale = (scaleX: number, scaleY: number) =>
  Math.sqrt(clampScale(scaleX) * clampScale(scaleY));

const resolveScaledDimensions = ({
  height,
  scaleX,
  scaleY,
  width,
}: {
  height: number;
  scaleX: number;
  scaleY: number;
  width: number;
}) => ({
  width: clampDimension(width * clampScale(scaleX)),
  height: clampDimension(height * clampScale(scaleY)),
});

const clampDimensionsToMinimum = ({
  dimensions,
  minimumDimensions,
}: {
  dimensions: { height: number; width: number };
  minimumDimensions: { height: number; width: number };
}) => ({
  width: Math.max(minimumDimensions.width, dimensions.width),
  height: Math.max(minimumDimensions.height, dimensions.height),
});

const resolveDominantResizeAxis = ({
  oldHeight,
  oldWidth,
  newHeight,
  newWidth,
}: {
  oldHeight: number;
  oldWidth: number;
  newHeight: number;
  newWidth: number;
}): CanvasResizeDominantAxis => {
  const widthDelta =
    Math.abs(newWidth / Math.max(oldWidth, MIN_CANVAS_RESIZE_DIMENSION) - 1);
  const heightDelta =
    Math.abs(newHeight / Math.max(oldHeight, MIN_CANVAS_RESIZE_DIMENSION) - 1);

  return widthDelta >= heightDelta ? "x" : "y";
};

const resolveAspectRatioLockedDimensionsFromWidth = ({
  aspectRatio,
  minimumDimensions,
  width,
}: {
  aspectRatio: number;
  minimumDimensions: { height: number; width: number };
  width: number;
}) => {
  const minimumWidth = Math.max(
    minimumDimensions.width,
    minimumDimensions.height * aspectRatio
  );
  const nextWidth = Math.max(minimumWidth, clampDimension(width));

  return {
    width: nextWidth,
    height: clampDimension(nextWidth / aspectRatio),
  };
};

const resolveAspectRatioLockedDimensionsFromHeight = ({
  aspectRatio,
  height,
  minimumDimensions,
}: {
  aspectRatio: number;
  height: number;
  minimumDimensions: { height: number; width: number };
}) => {
  const minimumHeight = Math.max(
    minimumDimensions.height,
    minimumDimensions.width / aspectRatio
  );
  const nextHeight = Math.max(minimumHeight, clampDimension(height));

  return {
    width: clampDimension(nextHeight * aspectRatio),
    height: nextHeight,
  };
};

export const constrainCanvasResizeBoxToAspectRatio = ({
  activeAnchor,
  aspectRatio,
  minimumDimensions,
  newBox,
  oldBox,
}: {
  activeAnchor: string | null;
  aspectRatio: number;
  minimumDimensions: { height: number; width: number };
  newBox: CanvasResizeTransformBox;
  oldBox: CanvasResizeTransformBox;
}): CanvasResizeTransformBox => {
  const safeAspectRatio = resolveAspectRatio(aspectRatio);
  if (!safeAspectRatio) {
    return newBox;
  }

  const anchor = activeAnchor ?? "bottom-right";
  const oldRight = oldBox.x + oldBox.width;
  const oldBottom = oldBox.y + oldBox.height;
  const oldCenterX = oldBox.x + oldBox.width / 2;
  const oldCenterY = oldBox.y + oldBox.height / 2;

  const dimensions =
    anchor === "middle-left" || anchor === "middle-right"
      ? resolveAspectRatioLockedDimensionsFromWidth({
          aspectRatio: safeAspectRatio,
          minimumDimensions,
          width: newBox.width,
        })
      : anchor === "top-center" || anchor === "bottom-center"
        ? resolveAspectRatioLockedDimensionsFromHeight({
            aspectRatio: safeAspectRatio,
            height: newBox.height,
            minimumDimensions,
          })
        : resolveDominantResizeAxis({
              oldHeight: oldBox.height,
              oldWidth: oldBox.width,
              newHeight: newBox.height,
              newWidth: newBox.width,
            }) === "x"
          ? resolveAspectRatioLockedDimensionsFromWidth({
              aspectRatio: safeAspectRatio,
              minimumDimensions,
              width: newBox.width,
            })
          : resolveAspectRatioLockedDimensionsFromHeight({
              aspectRatio: safeAspectRatio,
              height: newBox.height,
              minimumDimensions,
            });

  if (anchor === "top-left") {
    return {
      x: oldRight - dimensions.width,
      y: oldBottom - dimensions.height,
      width: dimensions.width,
      height: dimensions.height,
      rotation: newBox.rotation,
    };
  }

  if (anchor === "top-right") {
    return {
      x: oldBox.x,
      y: oldBottom - dimensions.height,
      width: dimensions.width,
      height: dimensions.height,
      rotation: newBox.rotation,
    };
  }

  if (anchor === "middle-left") {
    return {
      x: oldRight - dimensions.width,
      y: oldCenterY - dimensions.height / 2,
      width: dimensions.width,
      height: dimensions.height,
      rotation: newBox.rotation,
    };
  }

  if (anchor === "middle-right") {
    return {
      x: oldBox.x,
      y: oldCenterY - dimensions.height / 2,
      width: dimensions.width,
      height: dimensions.height,
      rotation: newBox.rotation,
    };
  }

  if (anchor === "bottom-left") {
    return {
      x: oldRight - dimensions.width,
      y: oldBox.y,
      width: dimensions.width,
      height: dimensions.height,
      rotation: newBox.rotation,
    };
  }

  if (anchor === "top-center") {
    return {
      x: oldCenterX - dimensions.width / 2,
      y: oldBottom - dimensions.height,
      width: dimensions.width,
      height: dimensions.height,
      rotation: newBox.rotation,
    };
  }

  if (anchor === "bottom-center") {
    return {
      x: oldCenterX - dimensions.width / 2,
      y: oldBox.y,
      width: dimensions.width,
      height: dimensions.height,
      rotation: newBox.rotation,
    };
  }

  return {
    x: oldBox.x,
    y: oldBox.y,
    width: dimensions.width,
    height: dimensions.height,
    rotation: newBox.rotation,
  };
};

const resolveScaledShapePoints = (
  points: CanvasShapePoint[],
  scaleX: number,
  scaleY: number
) =>
  points.map((point) => ({
    x: Math.round(point.x * clampScale(scaleX) * 1000) / 1000,
    y: Math.round(point.y * clampScale(scaleY) * 1000) / 1000,
  }));

const resolveBaseShapePoints = (element: CanvasShapeElement) =>
  element.points && element.points.length > 0
    ? element.points
    : [
        { x: 0, y: element.height / 2 },
        { x: element.width, y: element.height / 2 },
      ];

const resolveLocalPositionPatch = ({
  element,
  preview,
  workbench,
}: {
  element: CanvasRenderableElement;
  preview: Pick<CanvasResizePreview, "x" | "y">;
  workbench: CanvasWorkbench;
}) => {
  const localPosition = worldPointToLocalPoint(workbench, element.parentId, {
    x: preview.x,
    y: preview.y,
  });

  return {
    x: localPosition.x,
    y: localPosition.y,
  };
};

const resolveTextResizePlan = ({
  element,
  snapshot,
  workbench,
}: {
  element: Extract<CanvasRenderableElement, { type: "text" }>;
  snapshot: CanvasResizeNodeSnapshot;
  workbench: CanvasWorkbench;
}): CanvasResizePlan => {
  const layoutElement = fitCanvasTextElementToContent(element);
  const nextFontSize = clampFontSize(
    scaleCanvasTextFontSize(element.fontSize, resolveVisualScale(snapshot.scaleX, snapshot.scaleY))
  );
  const nextFontSizeTier = getClosestCanvasTextFontSizeTier(nextFontSize);
  const fittedText = fitCanvasTextElementToContent({
    ...(layoutElement as CanvasTextElement),
    fontSize: nextFontSize,
    fontSizeTier: nextFontSizeTier,
  });
  const preview: CanvasResizePreview = {
    x: snapshot.x,
    y: snapshot.y,
    width: clampDimension(fittedText.width),
    height: clampDimension(fittedText.height),
    fontSize: nextFontSize,
    fontSizeTier: nextFontSizeTier,
  };

  return {
    patch: {
      ...resolveLocalPositionPatch({ element, preview, workbench }),
      width: preview.width,
      height: preview.height,
      fontSize: nextFontSize,
      fontSizeTier: nextFontSizeTier,
    },
    preview,
  };
};

const resolveImageResizePlan = ({
  element,
  imageAspectRatio,
  preserveImageAspectRatio,
  snapshot,
  workbench,
}: {
  element: Extract<CanvasRenderableElement, { type: "image" }>;
  imageAspectRatio?: number | null;
  preserveImageAspectRatio?: boolean;
  snapshot: CanvasResizeNodeSnapshot;
  workbench: CanvasWorkbench;
}): CanvasResizePlan => {
  const scaledDimensions = resolveScaledDimensions({
    width: element.width,
    height: element.height,
    scaleX: snapshot.scaleX,
    scaleY: snapshot.scaleY,
  });
  const imageMinimumDimensions = preserveImageAspectRatio
    ? resolveMinimumCanvasImageDimensions(imageAspectRatio)
    : {
        width: MIN_CANVAS_IMAGE_SHORT_EDGE,
        height: MIN_CANVAS_IMAGE_SHORT_EDGE,
      };
  const safeAspectRatio = preserveImageAspectRatio
    ? resolveAspectRatio(imageAspectRatio)
    : null;
  const dimensions = safeAspectRatio
    ? resolveDominantResizeAxis({
          oldHeight: element.height,
          oldWidth: element.width,
          newHeight: scaledDimensions.height,
          newWidth: scaledDimensions.width,
        }) === "x"
      ? resolveAspectRatioLockedDimensionsFromWidth({
          aspectRatio: safeAspectRatio,
          minimumDimensions: imageMinimumDimensions,
          width: scaledDimensions.width,
        })
      : resolveAspectRatioLockedDimensionsFromHeight({
          aspectRatio: safeAspectRatio,
          height: scaledDimensions.height,
          minimumDimensions: imageMinimumDimensions,
        })
    : clampDimensionsToMinimum({
        dimensions: scaledDimensions,
        minimumDimensions: imageMinimumDimensions,
      });
  const preview: CanvasResizePreview = {
    ...dimensions,
    x: snapshot.x,
    y: snapshot.y,
  };

  return {
    patch: {
      ...resolveLocalPositionPatch({ element, preview, workbench }),
      width: preview.width,
      height: preview.height,
    },
    preview,
  };
};

const resolveBoxShapeResizePlan = ({
  element,
  preview,
  scaleX,
  scaleY,
  workbench,
}: {
  element: Extract<CanvasRenderableElement, { type: "shape" }>;
  preview: CanvasResizePreview;
  scaleX: number;
  scaleY: number;
  workbench: CanvasWorkbench;
}): CanvasResizePlan => {
  const patch: CanvasNodePropertyPatch = {
    ...resolveLocalPositionPatch({ element, preview, workbench }),
    width: preview.width,
    height: preview.height,
    strokeWidth: clampStrokeWidth(element.strokeWidth * resolveVisualScale(scaleX, scaleY)),
  };

  if (typeof element.radius === "number") {
    patch.radius = clampStrokeWidth(element.radius * Math.min(clampScale(scaleX), clampScale(scaleY)));
  }

  return {
    patch,
    preview,
  };
};

const resolvePathShapeResizePlan = ({
  element,
  preview,
  scaleX,
  scaleY,
  workbench,
}: {
  element: Extract<CanvasRenderableElement, { type: "shape" }>;
  preview: CanvasResizePreview;
  scaleX: number;
  scaleY: number;
  workbench: CanvasWorkbench;
}): CanvasResizePlan => {
  const points = resolveScaledShapePoints(resolveBaseShapePoints(element), scaleX, scaleY);

  return {
    patch: {
      ...resolveLocalPositionPatch({ element, preview, workbench }),
      width: preview.width,
      height: preview.height,
      points,
      strokeWidth: clampStrokeWidth(element.strokeWidth * resolveVisualScale(scaleX, scaleY)),
    },
    preview: {
      ...preview,
      points,
      strokeWidth: clampStrokeWidth(element.strokeWidth * resolveVisualScale(scaleX, scaleY)),
    },
  };
};

const resolveShapeResizePlan = ({
  element,
  snapshot,
  workbench,
}: {
  element: Extract<CanvasRenderableElement, { type: "shape" }>;
  snapshot: CanvasResizeNodeSnapshot;
  workbench: CanvasWorkbench;
}): CanvasResizePlan => {
  const preview: CanvasResizePreview = {
    ...resolveScaledDimensions({
      width: element.width,
      height: element.height,
      scaleX: snapshot.scaleX,
      scaleY: snapshot.scaleY,
    }),
    x: snapshot.x,
    y: snapshot.y,
  };

  if (element.shapeType === "line" || element.shapeType === "arrow") {
    return resolvePathShapeResizePlan({
      element,
      preview,
      scaleX: snapshot.scaleX,
      scaleY: snapshot.scaleY,
      workbench,
    });
  }

  return resolveBoxShapeResizePlan({
    element,
    preview,
    scaleX: snapshot.scaleX,
    scaleY: snapshot.scaleY,
    workbench,
  });
};

export const applyCanvasResizePreviewToElement = <TElement extends CanvasRenderableElement>(
  element: TElement,
  preview: CanvasResizePreview
): TElement => {
  const baseElement = {
    ...element,
    x: preview.x,
    y: preview.y,
    width: preview.width,
    height: preview.height,
    transform: {
      ...element.transform,
      x: preview.x,
      y: preview.y,
      width: preview.width,
      height: preview.height,
    },
  };

  if (element.type === "text") {
    return {
      ...baseElement,
      fontSize: preview.fontSize ?? element.fontSize,
      fontSizeTier: preview.fontSizeTier ?? element.fontSizeTier,
    } as TElement;
  }

  if (element.type === "shape") {
    return {
      ...baseElement,
      points: preview.points ?? element.points,
      radius: preview.radius ?? element.radius,
      strokeWidth: preview.strokeWidth ?? element.strokeWidth,
    } as TElement;
  }

  return baseElement as TElement;
};

export const createCanvasResizePreviewFromElement = (
  element: CanvasRenderableElement
): CanvasResizePreview => {
  const basePreview: CanvasResizePreview = {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  };

  if (element.type === "text") {
    return {
      ...basePreview,
      fontSize: element.fontSize,
      fontSizeTier: element.fontSizeTier,
    };
  }

  if (element.type === "shape") {
    return {
      ...basePreview,
      points: element.points,
      radius: element.radius,
      strokeWidth: element.strokeWidth,
    };
  }

  return basePreview;
};

export const planCanvasElementResize = ({
  element,
  imageAspectRatio,
  preserveImageAspectRatio,
  snapshot,
  workbench,
}: {
  element: CanvasRenderableElement;
  imageAspectRatio?: number | null;
  preserveImageAspectRatio?: boolean;
  snapshot: CanvasResizeNodeSnapshot;
  workbench: CanvasWorkbench;
}): CanvasResizePlan => {
  if (element.type === "image") {
    return resolveImageResizePlan({
      element,
      imageAspectRatio,
      preserveImageAspectRatio,
      snapshot,
      workbench,
    });
  }

  if (element.type === "text") {
    return resolveTextResizePlan({ element, snapshot, workbench });
  }

  return resolveShapeResizePlan({ element, snapshot, workbench });
};
