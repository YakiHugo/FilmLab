import { useEffect, useState } from "react";
import { Image as KonvaImage, Rect } from "react-konva";
import type { CanvasImageElement } from "@/types";

interface ImageElementProps {
  element: CanvasImageElement;
  src?: string;
  isSelected: boolean;
  onSelect: (additive: boolean) => void;
  onDragEnd: (x: number, y: number) => void;
}

export function ImageElement({ element, src, isSelected, onSelect, onDragEnd }: ImageElementProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }

    let revokedUrl: string | null = null;
    let cancelled = false;
    const nextImage = new window.Image();
    const controller = new AbortController();

    const handleLoad = () => {
      if (!cancelled) {
        setImage(nextImage);
      }
    };

    const load = async () => {
      try {
        if (src.startsWith("blob:") || src.startsWith("data:") || src.startsWith("http")) {
          const response = await fetch(src, { signal: controller.signal });
          if (!response.ok) {
            throw new Error("Failed to load image source.");
          }
          const blob = await response.blob();
          revokedUrl = URL.createObjectURL(blob);
          nextImage.src = revokedUrl;
        } else {
          nextImage.src = src;
        }
      } catch {
        if (!cancelled) {
          setImage(null);
        }
      }
    };

    nextImage.addEventListener("load", handleLoad);
    void load();

    return () => {
      cancelled = true;
      controller.abort();
      nextImage.removeEventListener("load", handleLoad);
      nextImage.src = "";
      if (revokedUrl) {
        URL.revokeObjectURL(revokedUrl);
      }
    };
  }, [src]);

  if (!image) {
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
        fill={isSelected ? "#334155" : "#27272a"}
        stroke={isSelected ? "#38bdf8" : "#52525b"}
        strokeWidth={isSelected ? 2 : 1}
        draggable={!element.locked}
        onClick={(event) => onSelect(Boolean(event.evt.shiftKey))}
        onTap={() => onSelect(false)}
        onDragEnd={(event) => onDragEnd(event.target.x(), event.target.y())}
      />
    );
  }

  return (
    <KonvaImage
      id={element.id}
      image={image}
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      rotation={element.rotation}
      opacity={element.opacity}
      visible={element.visible}
      draggable={!element.locked}
      onClick={(event) => onSelect(Boolean(event.evt.shiftKey))}
      onTap={() => onSelect(false)}
      onDragEnd={(event) => onDragEnd(event.target.x(), event.target.y())}
      stroke={isSelected ? "#38bdf8" : undefined}
      strokeWidth={isSelected ? 2 : 0}
    />
  );
}
