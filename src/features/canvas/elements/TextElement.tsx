import { Text } from "react-konva";
import type { CanvasTextElement } from "@/types";

interface TextElementProps {
  element: CanvasTextElement;
  isSelected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
}

export function TextElement({ element, isSelected, onSelect, onDragEnd }: TextElementProps) {
  return (
    <Text
      id={element.id}
      text={element.content}
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      rotation={element.rotation}
      opacity={element.opacity}
      visible={element.visible}
      fontFamily={element.fontFamily}
      fontSize={element.fontSize}
      fill={element.color}
      align={element.textAlign}
      draggable={!element.locked}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(event) => onDragEnd(event.target.x(), event.target.y())}
      stroke={isSelected ? "#38bdf8" : undefined}
      strokeWidth={isSelected ? 1 : 0}
    />
  );
}
