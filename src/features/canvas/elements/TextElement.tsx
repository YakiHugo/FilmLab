import { memo } from "react";
import { Text } from "react-konva";
import type { CanvasTextElement } from "@/types";

interface TextElementProps {
  element: CanvasTextElement;
  isSelected: boolean;
  onSelect: (additive: boolean) => void;
  onDragEnd: (x: number, y: number) => void;
  onDoubleClick: () => void;
}

export const TextElement = memo(function TextElement({
  element,
  isSelected,
  onSelect,
  onDragEnd,
  onDoubleClick,
}: TextElementProps) {
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
      onClick={(event) => onSelect(Boolean(event.evt.shiftKey))}
      onTap={() => onSelect(false)}
      onDblClick={onDoubleClick}
      onDblTap={onDoubleClick}
      onDragEnd={(event) => onDragEnd(event.target.x(), event.target.y())}
      stroke={isSelected ? "#f59e0b" : undefined}
      strokeWidth={isSelected ? 1 : 0}
    />
  );
});
