import { memo, useMemo } from "react";
import { Arrow, Ellipse, Group, Line, Rect } from "react-konva";
import type { CanvasShapeElement } from "@/types";

interface ShapeElementProps {
  element: CanvasShapeElement;
  dragBoundFunc: (position: { x: number; y: number }) => { x: number; y: number };
  onSelect: (elementId: string, additive: boolean) => void;
  onDragEnd: (elementId: string, x: number, y: number) => void;
}

export const ShapeElement = memo(function ShapeElement({
  element,
  dragBoundFunc,
  onSelect,
  onDragEnd,
}: ShapeElementProps) {
  const points = useMemo(() => {
    if (element.points && element.points.length > 0) {
      return element.points.flatMap((point) => [point.x, point.y]);
    }
    return [0, element.height / 2, element.width, element.height / 2];
  }, [element.height, element.points, element.width]);

  return (
    <Group
      id={element.id}
      x={element.x}
      y={element.y}
      rotation={element.rotation}
      opacity={element.opacity}
      visible={element.visible}
      draggable={!element.locked}
      dragBoundFunc={dragBoundFunc}
      onClick={(event) => onSelect(element.id, Boolean(event.evt.shiftKey))}
      onTap={() => onSelect(element.id, false)}
      onDragEnd={(event) => onDragEnd(element.id, event.target.x(), event.target.y())}
    >
      {element.shapeType === "rect" ? (
        <Rect
          width={element.width}
          height={element.height}
          fill={element.fill}
          stroke={element.stroke}
          strokeWidth={element.strokeWidth}
          cornerRadius={element.radius ?? 0}
        />
      ) : null}

      {element.shapeType === "ellipse" ? (
        <Ellipse
          x={element.width / 2}
          y={element.height / 2}
          radiusX={element.width / 2}
          radiusY={element.height / 2}
          fill={element.fill}
          stroke={element.stroke}
          strokeWidth={element.strokeWidth}
        />
      ) : null}

      {element.shapeType === "line" ? (
        <Line
          points={points}
          stroke={element.stroke}
          strokeWidth={element.strokeWidth}
          lineCap="round"
          lineJoin="round"
        />
      ) : null}

      {element.shapeType === "arrow" ? (
        <Arrow
          points={points}
          stroke={element.stroke}
          fill={element.stroke}
          strokeWidth={element.strokeWidth}
          lineCap="round"
          lineJoin="round"
          pointerAtBeginning={Boolean(element.arrowHead?.start)}
          pointerAtEnding={element.arrowHead?.end ?? true}
        />
      ) : null}
    </Group>
  );
});
