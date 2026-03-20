import { memo, useMemo } from "react";
import { Text } from "react-konva";
import type { CanvasRenderableElement, CanvasTextElement } from "@/types";
import {
  CANVAS_TEXT_LINE_HEIGHT_MULTIPLIER,
  fitCanvasTextElementToContent,
} from "../textStyle";

type CanvasTextRenderState = CanvasTextElement &
  Partial<
    Pick<Extract<CanvasRenderableElement, { type: "text" }>, "effectiveLocked" | "effectiveVisible" | "worldOpacity">
  >;

interface TextElementProps {
  element: CanvasTextRenderState;
  isEditing: boolean;
  dragBoundFunc: (position: { x: number; y: number }) => { x: number; y: number };
  onSelect: (elementId: string, additive: boolean) => void;
  onDragEnd: (elementId: string, x: number, y: number) => void;
  onDoubleClick: (elementId: string) => void;
}

export const TextElement = memo(function TextElement({
  element,
  isEditing,
  dragBoundFunc,
  onSelect,
  onDragEnd,
  onDoubleClick,
}: TextElementProps) {
  const layoutElement = useMemo(() => fitCanvasTextElementToContent(element), [element]);
  const effectiveLocked = layoutElement.effectiveLocked ?? layoutElement.locked;
  const effectiveVisible = layoutElement.effectiveVisible ?? layoutElement.visible;
  const renderOpacity = layoutElement.worldOpacity ?? layoutElement.opacity;

  return (
    <Text
      id={layoutElement.id}
      text={layoutElement.content}
      x={layoutElement.x}
      y={layoutElement.y}
      width={layoutElement.width}
      height={layoutElement.height}
      rotation={layoutElement.rotation}
      opacity={isEditing ? 0 : renderOpacity}
      visible={effectiveVisible}
      fontFamily={layoutElement.fontFamily}
      fontSize={layoutElement.fontSize}
      lineHeight={CANVAS_TEXT_LINE_HEIGHT_MULTIPLIER}
      fill={layoutElement.color}
      align={layoutElement.textAlign}
      wrap="none"
      draggable={!effectiveLocked}
      dragBoundFunc={dragBoundFunc}
      onClick={(event) => onSelect(layoutElement.id, Boolean(event.evt.shiftKey))}
      onTap={() => onSelect(layoutElement.id, false)}
      onDblClick={() => onDoubleClick(layoutElement.id)}
      onDblTap={() => onDoubleClick(layoutElement.id)}
      onDragEnd={(event) => onDragEnd(layoutElement.id, event.target.x(), event.target.y())}
    />
  );
});
