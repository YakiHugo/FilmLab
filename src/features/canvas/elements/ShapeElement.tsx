import { Circle, Line, Rect } from "react-konva";
import type { CanvasShapeElement } from "@/types";

interface ShapeElementProps {
  element: CanvasShapeElement;
  isSelected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
}

export function ShapeElement({ element, isSelected, onSelect, onDragEnd }: ShapeElementProps) {
  if (element.shape === "circle") {
    return (
      <Circle
        id={element.id}
        x={element.x + element.width / 2}
        y={element.y + element.height / 2}
        radius={Math.min(element.width, element.height) / 2}
        fill={element.fill}
        stroke={isSelected ? "#38bdf8" : element.stroke}
        strokeWidth={isSelected ? 2 : element.strokeWidth}
        opacity={element.opacity}
        draggable={!element.locked}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(event) => onDragEnd(event.target.x(), event.target.y())}
      />
    );
  }

  if (element.shape === "line") {
    return (
      <Line
        id={element.id}
        points={[element.x, element.y, element.x + element.width, element.y + element.height]}
        stroke={isSelected ? "#38bdf8" : element.stroke || element.fill}
        strokeWidth={isSelected ? 3 : element.strokeWidth || 2}
        opacity={element.opacity}
        draggable={!element.locked}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(event) => onDragEnd(event.target.x(), event.target.y())}
      />
    );
  }

  return (
    <Rect
      id={element.id}
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      fill={element.fill}
      stroke={isSelected ? "#38bdf8" : element.stroke}
      strokeWidth={isSelected ? 2 : element.strokeWidth}
      opacity={element.opacity}
      draggable={!element.locked}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(event) => onDragEnd(event.target.x(), event.target.y())}
    />
  );
}
