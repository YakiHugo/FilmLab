import type Konva from "konva";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Image as KonvaImage, Rect } from "react-konva";
import type { CanvasImageElement, CanvasRenderableElement } from "@/types";
import {
  useCanvasPreviewActions,
  useCanvasPreviewEntry,
  useCanvasRuntimeAsset,
} from "@/features/canvas/runtime/canvasRuntimeHooks";
import { useCanvasStore } from "@/stores/canvasStore";

type CanvasImageRenderState = CanvasImageElement &
  Partial<
    Pick<Extract<CanvasRenderableElement, { type: "image" }>, "effectiveLocked" | "effectiveVisible" | "worldOpacity">
  >;

interface ImageElementProps {
  element: CanvasImageRenderState;
  previewPriority: "interactive" | "background";
  dragBoundFunc: (position: { x: number; y: number }) => { x: number; y: number };
  onSelect: (elementId: string, additive: boolean) => void;
  onDragMove: (elementId: string, x: number, y: number) => void;
  onDragStart: (elementId: string) => void;
  onDragEnd: (elementId: string, x: number, y: number) => void;
  onTransform: (elementId: string, event: Konva.KonvaEventObject<Event>) => void;
  onTransformEnd: (elementId: string, event: Konva.KonvaEventObject<Event>) => void;
  onTransformStart: (elementId: string, event: Konva.KonvaEventObject<Event>) => void;
}

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const useLoadedImage = (src?: string) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }

    let cancelled = false;
    const nextImage = new window.Image();
    nextImage.decoding = "async";
    nextImage.src = src;

    const handleLoad = () => {
      if (!cancelled) {
        setImage(nextImage);
      }
    };
    const handleError = () => {
      if (!cancelled) {
        setImage(null);
      }
    };
    nextImage.addEventListener("load", handleLoad);
    nextImage.addEventListener("error", handleError);
    void nextImage
      .decode()
      .then(handleLoad)
      .catch(() => {
        // Some browsers reject decode() for object URLs before `load`.
      });

    return () => {
      cancelled = true;
      nextImage.removeEventListener("load", handleLoad);
      nextImage.removeEventListener("error", handleError);
      nextImage.src = "";
    };
  }, [src]);

  return image;
};

export const ImageElement = memo(function ImageElement({
  element,
  previewPriority,
  dragBoundFunc,
  onSelect,
  onDragMove,
  onDragStart,
  onDragEnd,
  onTransform,
  onTransformEnd,
  onTransformStart,
}: ImageElementProps) {
  const { asset, assetRenderFingerprint } = useCanvasRuntimeAsset(element.assetId);
  const zoom = useCanvasStore((state) => state.zoom);
  const previewEntry = useCanvasPreviewEntry(element.id);
  const { releaseBoardPreview, requestBoardPreview } = useCanvasPreviewActions();
  const fallbackSrc = asset?.thumbnailUrl || asset?.objectUrl;
  const fallbackImage = useLoadedImage(fallbackSrc);
  const effectiveLocked = element.effectiveLocked ?? element.locked;
  const effectiveVisible = element.effectiveVisible ?? element.visible;
  const renderOpacity = element.worldOpacity ?? element.opacity;
  const hadPreviewEntryRef = useRef(previewEntry !== undefined);
  const elementAdjustmentsFingerprint = useMemo(
    () => hashString(JSON.stringify(element.adjustments ?? null)),
    [element.adjustments]
  );
  const previewKey = useMemo(
    () =>
      [
        element.assetId,
        assetRenderFingerprint ?? "missing",
        element.filmProfileId ?? "none",
        `${Math.round(element.width)}x${Math.round(element.height)}`,
        elementAdjustmentsFingerprint,
        Number(zoom.toFixed(3)).toString(),
      ].join("|"),
    [
      element.assetId,
      assetRenderFingerprint,
      elementAdjustmentsFingerprint,
      element.filmProfileId,
      element.height,
      element.width,
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

  const renderSource = previewEntry?.previewSource ?? fallbackImage;

  if (!renderSource) {
    return (
      <Rect
        id={element.id}
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        rotation={element.rotation}
        opacity={renderOpacity}
        visible={effectiveVisible}
        fill="#27272a"
        stroke="#52525b"
        strokeWidth={1}
        draggable={!effectiveLocked}
        dragBoundFunc={dragBoundFunc}
        onClick={(event) => onSelect(element.id, Boolean(event.evt.shiftKey))}
        onTap={() => onSelect(element.id, false)}
        onDragStart={() => onDragStart(element.id)}
        onDragMove={(event) => onDragMove(element.id, event.target.x(), event.target.y())}
        onDragEnd={(event) => onDragEnd(element.id, event.target.x(), event.target.y())}
        onTransformStart={(event) => onTransformStart(element.id, event)}
        onTransform={(event) => onTransform(element.id, event)}
        onTransformEnd={(event) => onTransformEnd(element.id, event)}
      />
    );
  }

  return (
    <KonvaImage
      id={element.id}
      image={renderSource}
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      rotation={element.rotation}
      opacity={renderOpacity}
      visible={effectiveVisible}
      draggable={!effectiveLocked}
      dragBoundFunc={dragBoundFunc}
      onClick={(event) => onSelect(element.id, Boolean(event.evt.shiftKey))}
      onTap={() => onSelect(element.id, false)}
      onDragStart={() => onDragStart(element.id)}
      onDragMove={(event) => onDragMove(element.id, event.target.x(), event.target.y())}
      onDragEnd={(event) => onDragEnd(element.id, event.target.x(), event.target.y())}
      onTransformStart={(event) => onTransformStart(element.id, event)}
      onTransform={(event) => onTransform(element.id, event)}
      onTransformEnd={(event) => onTransformEnd(element.id, event)}
    />
  );
});
