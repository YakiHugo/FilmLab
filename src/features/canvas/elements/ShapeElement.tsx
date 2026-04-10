import type Konva from "konva";
import { memo } from "react";
import { Arrow, Ellipse, Group, Line, Rect } from "react-konva";
import type { CanvasRenderableShapeElement } from "@/types";
import { areEqual } from "../document/shared";
import {
  CANVAS_SHAPE_BODY_NODE_NAME,
  resolveCanvasArrowShapeAttrs,
  resolveCanvasEllipseShapeAttrs,
  resolveCanvasLineShapeAttrs,
  resolveCanvasRectShapeAttrs,
} from "../shapeRenderState";

type CanvasShapeRenderState = CanvasRenderableShapeElement;

interface ShapeElementProps {
  canDrag: boolean;
  element: CanvasShapeRenderState;
  dragBoundFunc: (position: { x: number; y: number }) => { x: number; y: number };
  onSelect: (elementId: string, additive: boolean) => void;
  onDragMove: (elementId: string, x: number, y: number) => void;
  onDragStart: (elementId: string, event: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (elementId: string, x: number, y: number) => void;
}

const areShapeElementsEqual = (
  left: CanvasShapeRenderState,
  right: CanvasShapeRenderState
) =>
  left.id === right.id &&
  left.shapeType === right.shapeType &&
  left.x === right.x &&
  left.y === right.y &&
  left.width === right.width &&
  left.height === right.height &&
  left.rotation === right.rotation &&
  left.opacity === right.opacity &&
  left.worldOpacity === right.worldOpacity &&
  left.visible === right.visible &&
  left.effectiveVisible === right.effectiveVisible &&
  left.locked === right.locked &&
  left.effectiveLocked === right.effectiveLocked &&
  left.fill === right.fill &&
  left.stroke === right.stroke &&
  left.strokeWidth === right.strokeWidth &&
  left.arrowHead === right.arrowHead &&
  areEqual(left.fillStyle, right.fillStyle) &&
  areEqual(left.radius, right.radius) &&
  areEqual(left.points, right.points);

const areShapeElementPropsEqual = (
  previous: ShapeElementProps,
  next: ShapeElementProps
) =>
  previous.canDrag === next.canDrag &&
  previous.dragBoundFunc === next.dragBoundFunc &&
  previous.onSelect === next.onSelect &&
  previous.onDragMove === next.onDragMove &&
  previous.onDragStart === next.onDragStart &&
  previous.onDragEnd === next.onDragEnd &&
  areShapeElementsEqual(previous.element, next.element);

export const ShapeElement = memo(function ShapeElement({
  canDrag,
  element,
  dragBoundFunc,
  onSelect,
  onDragMove,
  onDragStart,
  onDragEnd,
}: ShapeElementProps) {
  const effectiveLocked = element.effectiveLocked ?? element.locked;
  const effectiveVisible = element.effectiveVisible ?? element.visible;
  const renderOpacity = element.worldOpacity ?? element.opacity;

  return (
    <Group
      id={element.id}
      x={element.x}
      y={element.y}
      rotation={element.rotation}
      opacity={renderOpacity}
      visible={effectiveVisible}
      draggable={canDrag && !effectiveLocked}
      dragBoundFunc={dragBoundFunc}
      onClick={(event) => onSelect(element.id, Boolean(event.evt.shiftKey))}
      onTap={() => onSelect(element.id, false)}
      onDragStart={(event) => onDragStart(element.id, event)}
      onDragMove={(event) => onDragMove(element.id, event.target.x(), event.target.y())}
      onDragEnd={(event) => onDragEnd(element.id, event.target.x(), event.target.y())}
    >
      {element.shapeType === "rect" ? (
        <Rect
          name={CANVAS_SHAPE_BODY_NODE_NAME}
          {...resolveCanvasRectShapeAttrs(element)}
        />
      ) : null}

      {element.shapeType === "ellipse" ? (
        <Ellipse
          name={CANVAS_SHAPE_BODY_NODE_NAME}
          {...resolveCanvasEllipseShapeAttrs(element)}
        />
      ) : null}

      {element.shapeType === "line" ? (
        <Line
          name={CANVAS_SHAPE_BODY_NODE_NAME}
          {...resolveCanvasLineShapeAttrs(element)}
        />
      ) : null}

      {element.shapeType === "arrow" ? (
        <Arrow
          name={CANVAS_SHAPE_BODY_NODE_NAME}
          {...resolveCanvasArrowShapeAttrs(element)}
        />
      ) : null}
    </Group>
  );
}, areShapeElementPropsEqual);
