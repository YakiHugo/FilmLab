import { useEffect, useState } from "react";
import { Image as KonvaImage, Rect } from "react-konva";
import type { CanvasImageElement } from "@/types";

interface ImageElementProps {
  element: CanvasImageElement;
  src?: string;
  isSelected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
}

export function ImageElement({ element, src, isSelected, onSelect, onDragEnd }: ImageElementProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    const nextImage = new window.Image();
    nextImage.src = src;
    const handleLoad = () => setImage(nextImage);
    nextImage.addEventListener("load", handleLoad);
    return () => {
      nextImage.removeEventListener("load", handleLoad);
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
        fill={isSelected ? "#334155" : "#27272a"}
        stroke={isSelected ? "#38bdf8" : "#52525b"}
        strokeWidth={isSelected ? 2 : 1}
        draggable={!element.locked}
        onClick={onSelect}
        onTap={onSelect}
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
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(event) => onDragEnd(event.target.x(), event.target.y())}
      stroke={isSelected ? "#38bdf8" : undefined}
      strokeWidth={isSelected ? 2 : 0}
    />
  );
}
