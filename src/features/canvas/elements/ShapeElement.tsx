import { Circle, Group, Line, Rect } from "react-konva";
import type { CanvasShapeElement } from "@/types";

interface ShapeElementProps {
  element: CanvasShapeElement;
  isSelected: boolean;
  onSelect: (additive: boolean) => void;
  onDragEnd: (x: number, y: number) => void;
}

export function ShapeElement({ element, isSelected, onSelect, onDragEnd }: ShapeElementProps) {
  return (
    <Group
      id={element.id}
      x={element.x}
      y={element.y}
      rotation={element.rotation}
      opacity={element.opacity}
      visible={element.visible}
      draggable={!element.locked}
      onClick={(event) => onSelect(Boolean(event.evt.shiftKey))}
      onTap={() => onSelect(false)}
      onDragEnd={(event) => onDragEnd(event.target.x(), event.target.y())}
    >
      {element.shape === "circle" && (
        <Circle
          x={element.width / 2}
          y={element.height / 2}
          radius={Math.min(element.width, element.height) / 2}
          fill={element.fill}
          stroke={isSelected ? "#38bdf8" : element.stroke}
          strokeWidth={isSelected ? 2 : element.strokeWidth}
        />
      )}

      {element.shape === "line" && (
        <Line
          points={[0, 0, element.width, element.height]}
          stroke={isSelected ? "#38bdf8" : element.stroke || element.fill}
          strokeWidth={isSelected ? 3 : element.strokeWidth || 2}
        />
      )}

      {element.shape === "rect" && (
        <Rect
          width={element.width}
          height={element.height}
          fill={element.fill}
          stroke={isSelected ? "#38bdf8" : element.stroke}
          strokeWidth={isSelected ? 2 : element.strokeWidth}
        />
      )}
    </Group>
  );
}
