import type Konva from "konva";
import { memo, useMemo } from "react";
import { Text } from "react-konva";
import type { CanvasRenderableTextElement } from "@/types";
import { areEqual } from "../document/shared";
import { isCanvasTextElementEditable } from "./textElementEditability";
import {
  CANVAS_TEXT_LINE_HEIGHT_MULTIPLIER,
  fitCanvasTextElementToContent,
} from "../textStyle";

type CanvasTextRenderState = CanvasRenderableTextElement;

interface TextElementProps {
  canDrag: boolean;
  element: CanvasTextRenderState;
  isEditing: boolean;
  dragBoundFunc: (position: { x: number; y: number }) => { x: number; y: number };
  onSelect: (elementId: string, additive: boolean) => void;
  onDragMove: (elementId: string, x: number, y: number) => void;
  onDragStart: (elementId: string, event: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (elementId: string, x: number, y: number) => void;
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
  left.worldX === right.worldX &&
  left.worldY === right.worldY &&
  left.worldWidth === right.worldWidth &&
  left.worldHeight === right.worldHeight &&
  left.worldRotation === right.worldRotation &&
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
}: TextElementProps) {
  const layoutElement = useMemo(() => fitCanvasTextElementToContent(element), [element]);
  const canEditText = isCanvasTextElementEditable(layoutElement);
  const effectiveLocked = layoutElement.effectiveLocked ?? layoutElement.locked;
  const effectiveVisible = layoutElement.effectiveVisible ?? layoutElement.visible;
  const renderOpacity = layoutElement.worldOpacity ?? layoutElement.opacity;
  const handleSelect = (additive: boolean) => {
    if (!canDrag || !canEditText) {
      return;
    }

    onSelect(layoutElement.id, additive);
  };

  return (
    <Text
      id={layoutElement.id}
      text={layoutElement.content}
      x={layoutElement.worldX}
      y={layoutElement.worldY}
      width={layoutElement.transform.width}
      height={layoutElement.transform.height}
      rotation={layoutElement.worldRotation}
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
      onClick={(event) => handleSelect(Boolean(event.evt.shiftKey))}
      onTap={() => handleSelect(false)}
      onDragStart={(event) => onDragStart(layoutElement.id, event)}
      onDragMove={(event) => onDragMove(layoutElement.id, event.target.x(), event.target.y())}
      onDragEnd={(event) => onDragEnd(layoutElement.id, event.target.x(), event.target.y())}
    />
  );
}, areTextElementPropsEqual);
