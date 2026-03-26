import type Konva from "konva";
import { memo, useMemo } from "react";
import { Text } from "react-konva";
import type { CanvasRenderableElement, CanvasTextElement } from "@/types";
import {
  CANVAS_TEXT_LINE_HEIGHT_MULTIPLIER,
  fitCanvasTextElementToContent,
} from "../textStyle";

type CanvasTextRenderState = CanvasTextElement &
  Partial<
    Pick<
      Extract<CanvasRenderableElement, { type: "text" }>,
      "effectiveLocked" | "effectiveVisible" | "worldOpacity"
    >
  >;

export const isCanvasTextElementEditable = (
  element:
    | (Partial<Pick<CanvasTextElement, "locked" | "visible">> &
        Partial<
          Pick<Extract<CanvasRenderableElement, { type: "text" }>, "effectiveLocked" | "effectiveVisible">
        >)
    | null
    | undefined
) => Boolean(element && !(element.effectiveLocked ?? element.locked) && (element.effectiveVisible ?? element.visible));

interface TextElementProps {
  element: CanvasTextRenderState;
  isEditing: boolean;
  dragBoundFunc: (position: { x: number; y: number }) => { x: number; y: number };
  onSelect: (elementId: string, additive: boolean) => void;
  onDragMove: (elementId: string, x: number, y: number) => void;
  onDragStart: (elementId: string) => void;
  onDragEnd: (elementId: string, x: number, y: number) => void;
  onDoubleClick: (elementId: string) => void;
  onTransform: (elementId: string, event: Konva.KonvaEventObject<Event>) => void;
  onTransformEnd: (elementId: string, event: Konva.KonvaEventObject<Event>) => void;
  onTransformStart: (elementId: string, event: Konva.KonvaEventObject<Event>) => void;
}

export const TextElement = memo(function TextElement({
  element,
  isEditing,
  dragBoundFunc,
  onSelect,
  onDragMove,
  onDragStart,
  onDragEnd,
  onDoubleClick,
  onTransform,
  onTransformEnd,
  onTransformStart,
}: TextElementProps) {
  const layoutElement = useMemo(() => fitCanvasTextElementToContent(element), [element]);
  const canEditText = isCanvasTextElementEditable(layoutElement);
  const effectiveLocked = layoutElement.effectiveLocked ?? layoutElement.locked;
  const effectiveVisible = layoutElement.effectiveVisible ?? layoutElement.visible;
  const renderOpacity = layoutElement.worldOpacity ?? layoutElement.opacity;
  const handleDoubleClick = canEditText ? () => onDoubleClick(layoutElement.id) : undefined;

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
      onDblClick={handleDoubleClick}
      onDblTap={handleDoubleClick}
      onDragStart={() => onDragStart(layoutElement.id)}
      onDragMove={(event) => onDragMove(layoutElement.id, event.target.x(), event.target.y())}
      onDragEnd={(event) => onDragEnd(layoutElement.id, event.target.x(), event.target.y())}
      onTransformStart={(event) => onTransformStart(layoutElement.id, event)}
      onTransform={(event) => onTransform(layoutElement.id, event)}
      onTransformEnd={(event) => onTransformEnd(layoutElement.id, event)}
    />
  );
});
