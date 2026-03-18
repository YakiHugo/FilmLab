import { memo } from "react";
import { Text } from "react-konva";
import type { CanvasTextElement } from "@/types";
import { CANVAS_TEXT_LINE_HEIGHT_MULTIPLIER } from "../textStyle";

interface TextElementProps {
  element: CanvasTextElement;
  isEditing: boolean;
  dragBoundFunc: (position: { x: number; y: number }) => { x: number; y: number };
  onSelect: (additive: boolean) => void;
  onDragEnd: (x: number, y: number) => void;
  onDoubleClick: () => void;
}

export const TextElement = memo(function TextElement({
  element,
  isEditing,
  dragBoundFunc,
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
      opacity={isEditing ? 0 : element.opacity}
      visible={element.visible}
      fontFamily={element.fontFamily}
      fontSize={element.fontSize}
      lineHeight={CANVAS_TEXT_LINE_HEIGHT_MULTIPLIER}
      fill={element.color}
      align={element.textAlign}
      draggable={!element.locked}
      dragBoundFunc={dragBoundFunc}
      onClick={(event) => onSelect(Boolean(event.evt.shiftKey))}
      onTap={() => onSelect(false)}
      onDblClick={onDoubleClick}
      onDblTap={onDoubleClick}
      onDragEnd={(event) => onDragEnd(event.target.x(), event.target.y())}
    />
  );
});
