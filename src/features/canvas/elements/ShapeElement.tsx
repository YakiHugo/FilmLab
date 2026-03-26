import type Konva from "konva";
import { memo } from "react";
import { Arrow, Ellipse, Group, Line, Rect } from "react-konva";
import type { CanvasRenderableElement, CanvasShapeElement } from "@/types";
import {
  CANVAS_SHAPE_BODY_NODE_NAME,
  resolveCanvasArrowShapeAttrs,
  resolveCanvasEllipseShapeAttrs,
  resolveCanvasLineShapeAttrs,
  resolveCanvasRectShapeAttrs,
} from "../shapeRenderState";

type CanvasShapeRenderState = CanvasShapeElement &
  Partial<
    Pick<Extract<CanvasRenderableElement, { type: "shape" }>, "effectiveLocked" | "effectiveVisible" | "worldOpacity">
  >;

interface ShapeElementProps {
  element: CanvasShapeRenderState;
  dragBoundFunc: (position: { x: number; y: number }) => { x: number; y: number };
  onSelect: (elementId: string, additive: boolean) => void;
  onDragMove: (elementId: string, x: number, y: number) => void;
  onDragStart: (elementId: string) => void;
  onDragEnd: (elementId: string, x: number, y: number) => void;
  onTransform: (elementId: string, event: Konva.KonvaEventObject<Event>) => void;
  onTransformEnd: (elementId: string, event: Konva.KonvaEventObject<Event>) => void;
  onTransformStart: (elementId: string, event: Konva.KonvaEventObject<Event>) => void;
}

export const ShapeElement = memo(function ShapeElement({
  element,
  dragBoundFunc,
  onSelect,
  onDragMove,
  onDragStart,
  onDragEnd,
  onTransform,
  onTransformEnd,
  onTransformStart,
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
      draggable={!effectiveLocked}
      dragBoundFunc={dragBoundFunc}
      onClick={(event) => onSelect(element.id, Boolean(event.evt.shiftKey))}
      onTap={() => onSelect(element.id, false)}
      onDragStart={() => onDragStart(element.id)}
      onDragMove={(event) => onDragMove(element.id, event.target.x(), event.target.y())}
      onDragEnd={(event) => onDragEnd(element.id, event.target.x(), event.target.y())}
      onTransformStart={(event) => onTransformStart(element.id, event)}
      onTransform={(event) => onTransform(element.id, event)}
      onTransformEnd={(event) => onTransformEnd(element.id, event)}
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
});
