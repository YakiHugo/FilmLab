import type Konva from "konva";
import { memo, useMemo } from "react";
import { Text } from "react-konva";
import type { CanvasRenderableElement, CanvasTextElement } from "@/types";
import { areEqual } from "../document/shared";
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
  canDrag: boolean;
  element: CanvasTextRenderState;
  isEditing: boolean;
  dragBoundFunc: (position: { x: number; y: number }) => { x: number; y: number };
  onSelect: (elementId: string, additive: boolean) => void;
  onDragMove: (elementId: string, x: number, y: number) => void;
  onDragStart: (elementId: string, event: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (elementId: string, x: number, y: number) => void;
  onDoubleClick: (elementId: string) => void;
  onTransform: (elementId: string, event: Konva.KonvaEventObject<Event>) => void;
  onTransformEnd: (elementId: string, event: Konva.KonvaEventObject<Event>) => void;
  onTransformStart: (elementId: string, event: Konva.KonvaEventObject<Event>) => void;
}

const areTextElementsEqual = (
  left: CanvasTextRenderState,
  right: CanvasTextRenderState
) =>
  left.id === right.id &&
  left.content === right.content &&
  left.fontFamily === right.fontFamily &&
  left.fontSize === right.fontSize &&
  left.fontSizeTier === right.fontSizeTier &&
  left.textAlign === right.textAlign &&
  left.color === right.color &&
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
  areEqual(left.transform, right.transform);

const areTextElementPropsEqual = (
  previous: TextElementProps,
  next: TextElementProps
) =>
  previous.canDrag === next.canDrag &&
  previous.isEditing === next.isEditing &&
  previous.dragBoundFunc === next.dragBoundFunc &&
  previous.onSelect === next.onSelect &&
  previous.onDragMove === next.onDragMove &&
  previous.onDragStart === next.onDragStart &&
  previous.onDragEnd === next.onDragEnd &&
  previous.onDoubleClick === next.onDoubleClick &&
  previous.onTransform === next.onTransform &&
  previous.onTransformEnd === next.onTransformEnd &&
  previous.onTransformStart === next.onTransformStart &&
  areTextElementsEqual(previous.element, next.element);

export const TextElement = memo(function TextElement({
  canDrag,
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
  const handleDoubleClick =
    canDrag && canEditText ? () => onDoubleClick(layoutElement.id) : undefined;

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
      draggable={canDrag && !effectiveLocked}
      dragBoundFunc={dragBoundFunc}
      onClick={(event) => onSelect(layoutElement.id, Boolean(event.evt.shiftKey))}
      onTap={() => onSelect(layoutElement.id, false)}
      onDblClick={handleDoubleClick}
      onDblTap={handleDoubleClick}
      onDragStart={(event) => onDragStart(layoutElement.id, event)}
      onDragMove={(event) => onDragMove(layoutElement.id, event.target.x(), event.target.y())}
      onDragEnd={(event) => onDragEnd(layoutElement.id, event.target.x(), event.target.y())}
      onTransformStart={(event) => onTransformStart(layoutElement.id, event)}
      onTransform={(event) => onTransform(layoutElement.id, event)}
      onTransformEnd={(event) => onTransformEnd(layoutElement.id, event)}
    />
  );
}, areTextElementPropsEqual);
