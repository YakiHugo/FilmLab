import type {
  CanvasPersistedElement,
  CanvasPersistedImageElement,
  CanvasPersistedShapeElement,
  CanvasShapeFillStyle,
  CanvasWorkbench,
} from "@/types";

export type CanvasImageEditTarget = Pick<
  CanvasPersistedImageElement,
  "assetId" | "id" | "renderState" | "type"
>;

export type CanvasShapeEditTarget = Pick<
  CanvasPersistedShapeElement,
  "fill" | "fillStyle" | "id" | "opacity" | "shapeType" | "stroke" | "strokeWidth" | "type"
>;

export type CanvasEditTarget = CanvasImageEditTarget | CanvasShapeEditTarget;

const isShapeFillStyleEqual = (
  left: CanvasShapeFillStyle | undefined,
  right: CanvasShapeFillStyle | undefined
) => {
  if (left === right) {
    return true;
  }
  if (!left || !right || left.kind !== right.kind) {
    return false;
  }

  if (left.kind === "solid" && right.kind === "solid") {
    return left.color === right.color;
  }

  return (
    left.kind === "linear-gradient" &&
    right.kind === "linear-gradient" &&
    left.angle === right.angle &&
    left.from === right.from &&
    left.to === right.to
  );
};

export const canvasEditTargetEqual = (
  left: CanvasEditTarget | null,
  right: CanvasEditTarget | null
) => {
  if (left === right) {
    return true;
  }
  if (!left || !right || left.type !== right.type || left.id !== right.id) {
    return false;
  }

  if (left.type === "image" && right.type === "image") {
    return left.assetId === right.assetId && left.renderState === right.renderState;
  }

  return (
    left.type === "shape" &&
    right.type === "shape" &&
    left.shapeType === right.shapeType &&
    left.fill === right.fill &&
    isShapeFillStyleEqual(left.fillStyle, right.fillStyle) &&
    left.stroke === right.stroke &&
    left.strokeWidth === right.strokeWidth &&
    left.opacity === right.opacity
  );
};

export const resolveCanvasEditTargetFromPrimarySelection = (
  activeWorkbench: Pick<CanvasWorkbench, "nodes"> | null,
  primarySelectedElementId: string | null
): CanvasEditTarget | null =>
  resolveCanvasEditTargetForElementId(activeWorkbench, primarySelectedElementId);

export const resolveCanvasEditTargetForElementId = (
  activeWorkbench: Pick<CanvasWorkbench, "nodes"> | null,
  elementId: string | null
): CanvasEditTarget | null => {
  if (!activeWorkbench || !elementId) {
    return null;
  }

  const element = activeWorkbench.nodes[elementId] as CanvasPersistedElement | undefined;
  if (!element) {
    return null;
  }

  if (element.type === "image") {
    return {
      assetId: element.assetId,
      id: element.id,
      renderState: element.renderState,
      type: "image",
    };
  }

  if (element.type === "shape") {
    return {
      fill: element.fill,
      fillStyle: element.fillStyle,
      id: element.id,
      opacity: element.opacity,
      shapeType: element.shapeType,
      stroke: element.stroke,
      strokeWidth: element.strokeWidth,
      type: "shape",
    };
  }

  return null;
};

export const resolveCanvasEditableElementKeyFromPrimarySelection = (
  activeWorkbench: Pick<CanvasWorkbench, "nodes"> | null,
  primarySelectedElementId: string | null
) => {
  const target = resolveCanvasEditTargetForElementId(activeWorkbench, primarySelectedElementId);
  return target ? `${target.type}:${target.id}` : null;
};

export const shouldOpenCanvasEditPanelForElement = ({
  activeWorkbench,
  additive = false,
  elementId,
}: {
  activeWorkbench: Pick<CanvasWorkbench, "nodes"> | null;
  additive?: boolean;
  elementId: string | null;
}) => !additive && resolveCanvasEditTargetForElementId(activeWorkbench, elementId) !== null;
