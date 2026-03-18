import { memo, useEffect, useMemo, useState } from "react";
import { Image as KonvaImage, Rect } from "react-konva";
import type { CanvasImageElement } from "@/types";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { useCanvasRuntimeStore } from "@/stores/canvasRuntimeStore";

interface ImageElementProps {
  element: CanvasImageElement;
  isSelected: boolean;
  dragBoundFunc: (position: { x: number; y: number }) => { x: number; y: number };
  onSelect: (additive: boolean) => void;
  onDragEnd: (x: number, y: number) => void;
}

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
  isSelected,
  dragBoundFunc,
  onSelect,
  onDragEnd,
}: ImageElementProps) {
  const asset = useAssetStore(
    (state) => state.assets.find((candidate) => candidate.id === element.assetId) ?? null
  );
  const zoom = useCanvasStore((state) => state.zoom);
  const previewEntry = useCanvasRuntimeStore((state) => state.previewEntries[element.id]);
  const requestBoardPreview = useCanvasRuntimeStore((state) => state.requestBoardPreview);
  const releaseBoardPreview = useCanvasRuntimeStore((state) => state.releaseBoardPreview);
  const fallbackSrc = asset?.thumbnailUrl || asset?.objectUrl;
  const fallbackImage = useLoadedImage(fallbackSrc);
  const previewKey = useMemo(
    () =>
      JSON.stringify({
        adjustments: element.adjustments ?? null,
        assetId: element.assetId,
        filmProfileId: element.filmProfileId ?? null,
        height: Math.round(element.height),
        width: Math.round(element.width),
        zoom: Number(zoom.toFixed(3)),
      }),
    [
      element.adjustments,
      element.assetId,
      element.filmProfileId,
      element.height,
      element.width,
      zoom,
    ]
  );

  useEffect(() => {
    if (!asset || !element.visible) {
      releaseBoardPreview(element.id);
      return;
    }

    void requestBoardPreview(element.id, isSelected ? "interactive" : "background");
    return () => {
      releaseBoardPreview(element.id);
    };
  }, [
    asset,
    asset?.contentHash,
    asset?.objectUrl,
    asset?.thumbnailUrl,
    element.id,
    element.visible,
    isSelected,
    zoom,
    previewKey,
    releaseBoardPreview,
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
        opacity={element.opacity}
        visible={element.visible}
        fill="#27272a"
        stroke="#52525b"
        strokeWidth={1}
        draggable={!element.locked}
        dragBoundFunc={dragBoundFunc}
        onClick={(event) => onSelect(Boolean(event.evt.shiftKey))}
        onTap={() => onSelect(false)}
        onDragEnd={(event) => onDragEnd(event.target.x(), event.target.y())}
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
      opacity={element.opacity}
      visible={element.visible}
      draggable={!element.locked}
      dragBoundFunc={dragBoundFunc}
      onClick={(event) => onSelect(Boolean(event.evt.shiftKey))}
      onTap={() => onSelect(false)}
      onDragEnd={(event) => onDragEnd(event.target.x(), event.target.y())}
    />
  );
});
