import type Konva from "konva";
import { memo, useEffect, useMemo, useRef } from "react";
import { Image as KonvaImage, Rect } from "react-konva";
import type { CanvasRenderableImageElement } from "@/types";
import {
  useCanvasPreviewActions,
  useCanvasPreviewEntry,
  useCanvasRuntimeAsset,
} from "@/features/canvas/runtime/canvasRuntimeHooks";
import { useCanvasStore } from "@/stores/canvasStore";
import { resolveCanvasImagePreviewTargetSizeKey } from "../boardImageRendering";
import { areEqual } from "../document/shared";

type CanvasImageRenderState = CanvasRenderableImageElement;

interface ImageElementProps {
  canDrag: boolean;
  element: CanvasImageRenderState;
  previewPriority: "interactive" | "background";
  dragBoundFunc: (position: { x: number; y: number }) => { x: number; y: number };
  onSelect: (elementId: string, additive: boolean) => void;
  onDragMove: (elementId: string, x: number, y: number) => void;
  onDragStart: (elementId: string, event: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (elementId: string, x: number, y: number) => void;
}

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const areImageElementsEqual = (
  left: CanvasImageRenderState,
  right: CanvasImageRenderState
) => {
  return (
    left.id === right.id &&
    left.assetId === right.assetId &&
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
    areEqual(left.renderState, right.renderState)
  );
};

const areImageElementPropsEqual = (
  previous: ImageElementProps,
  next: ImageElementProps
) =>
  previous.canDrag === next.canDrag &&
  previous.previewPriority === next.previewPriority &&
  previous.dragBoundFunc === next.dragBoundFunc &&
  previous.onSelect === next.onSelect &&
  previous.onDragMove === next.onDragMove &&
  previous.onDragStart === next.onDragStart &&
  previous.onDragEnd === next.onDragEnd &&
  areImageElementsEqual(previous.element, next.element);

export const ImageElement = memo(function ImageElement({
  canDrag,
  element,
  previewPriority,
  dragBoundFunc,
  onSelect,
  onDragMove,
  onDragStart,
  onDragEnd,
}: ImageElementProps) {
  const { asset, assetRenderFingerprint } = useCanvasRuntimeAsset(element.assetId);
  const zoom = useCanvasStore((state) => state.zoom);
  const previewEntry = useCanvasPreviewEntry(element.id);
  const { releaseBoardPreview, requestBoardPreview } = useCanvasPreviewActions();
  const effectiveLocked = element.effectiveLocked ?? element.locked;
  const effectiveVisible = element.effectiveVisible ?? element.visible;
  const renderOpacity = element.worldOpacity ?? element.opacity;
  const hadPreviewEntryRef = useRef(previewEntry !== undefined);
  const elementRenderFingerprint = useMemo(() => {
    return hashString(JSON.stringify(element.renderState));
  }, [element.renderState]);
  const previewKey = useMemo(
    () =>
      [
        element.assetId,
        assetRenderFingerprint ?? "missing",
        resolveCanvasImagePreviewTargetSizeKey(element, previewPriority, zoom),
        elementRenderFingerprint,
        Number(zoom.toFixed(3)).toString(),
      ].join("|"),
    [
      assetRenderFingerprint,
      elementRenderFingerprint,
      element,
      previewPriority,
      zoom,
    ]
  );
  const hasRenderableAsset = asset !== null;

  useEffect(() => {
    if (!hasRenderableAsset || !effectiveVisible) {
      releaseBoardPreview(element.id);
      return;
    }

    void requestBoardPreview(element.id, previewPriority);
  }, [
    element.id,
    effectiveVisible,
    hasRenderableAsset,
    previewPriority,
    previewKey,
    releaseBoardPreview,
    requestBoardPreview,
  ]);

  useEffect(() => {
    if (!hasRenderableAsset || !effectiveVisible) {
      return;
    }

    return () => {
      releaseBoardPreview(element.id);
    };
  }, [element.id, effectiveVisible, hasRenderableAsset, releaseBoardPreview]);

  useEffect(() => {
    const hadPreviewEntry = hadPreviewEntryRef.current;
    const hasPreviewEntry = previewEntry !== undefined;
    hadPreviewEntryRef.current = hasPreviewEntry;

    if (
      !hadPreviewEntry ||
      hasPreviewEntry ||
      !hasRenderableAsset ||
      !effectiveVisible
    ) {
      return;
    }

    void requestBoardPreview(element.id, previewPriority);
  }, [
    element.id,
    effectiveVisible,
    hasRenderableAsset,
    previewEntry,
    previewPriority,
    requestBoardPreview,
  ]);

  const renderSource = previewEntry?.previewSource ?? null;

  if (!renderSource) {
    return (
      <Rect
        id={element.id}
        x={element.worldX}
        y={element.worldY}
        width={element.worldWidth}
        height={element.worldHeight}
        rotation={element.worldRotation}
        opacity={renderOpacity}
        visible={effectiveVisible}
        fill="#27272a"
        stroke="#52525b"
        strokeWidth={1}
        draggable={canDrag && !effectiveLocked}
        dragBoundFunc={dragBoundFunc}
        onClick={(event) => onSelect(element.id, Boolean(event.evt.shiftKey))}
        onTap={() => onSelect(element.id, false)}
        onDragStart={(event) => onDragStart(element.id, event)}
        onDragMove={(event) => onDragMove(element.id, event.target.x(), event.target.y())}
        onDragEnd={(event) => onDragEnd(element.id, event.target.x(), event.target.y())}
      />
    );
  }

  return (
    <KonvaImage
      id={element.id}
      image={renderSource}
      x={element.worldX}
      y={element.worldY}
      width={element.worldWidth}
      height={element.worldHeight}
      rotation={element.worldRotation}
      opacity={renderOpacity}
      visible={effectiveVisible}
      draggable={canDrag && !effectiveLocked}
      dragBoundFunc={dragBoundFunc}
      onClick={(event) => onSelect(element.id, Boolean(event.evt.shiftKey))}
      onTap={() => onSelect(element.id, false)}
      onDragStart={(event) => onDragStart(element.id, event)}
      onDragMove={(event) => onDragMove(element.id, event.target.x(), event.target.y())}
      onDragEnd={(event) => onDragEnd(element.id, event.target.x(), event.target.y())}
    />
  );
}, areImageElementPropsEqual);
