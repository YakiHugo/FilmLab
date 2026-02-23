import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  CROP_CORNER_EDGE_MAP,
  CROP_CORNER_HANDLES,
  CROP_EDGE_HANDLES,
  isCropCornerHandle,
  isCropEdgeHandle,
  type CropCornerHandle,
  type CropDragMode,
  type CropEdgeHandle,
  type CropRect,
} from "./cropGeometry";

interface CropOverlayProps {
  cropRect: CropRect;
  frameWidth: number;
  frameHeight: number;
  activeCropDragMode: CropDragMode | null;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
}

export function CropOverlay({
  cropRect,
  frameWidth,
  frameHeight,
  activeCropDragMode,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: CropOverlayProps) {
  const highlightedCropEdges = useMemo(() => {
    const highlighted = new Set<CropEdgeHandle>();
    if (!activeCropDragMode || activeCropDragMode === "move") {
      return highlighted;
    }
    if (isCropEdgeHandle(activeCropDragMode)) {
      highlighted.add(activeCropDragMode);
      return highlighted;
    }
    if (isCropCornerHandle(activeCropDragMode)) {
      const [edgeA, edgeB] = CROP_CORNER_EDGE_MAP[activeCropDragMode];
      highlighted.add(edgeA);
      highlighted.add(edgeB);
    }
    return highlighted;
  }, [activeCropDragMode]);

  const highlightedCropCorner = useMemo<CropCornerHandle | null>(() => {
    if (!activeCropDragMode || activeCropDragMode === "move") {
      return null;
    }
    return isCropCornerHandle(activeCropDragMode) ? activeCropDragMode : null;
  }, [activeCropDragMode]);

  return (
    <div
      className="absolute inset-0 z-20 touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Crop darkening: four rectangles around the crop rect */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 bg-slate-950/45"
        style={{ height: Math.max(0, cropRect.y) }}
      />
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 bg-slate-950/45"
        style={{ height: Math.max(0, frameHeight - cropRect.y - cropRect.height) }}
      />
      <div
        className="pointer-events-none absolute left-0 bg-slate-950/45"
        style={{
          top: cropRect.y,
          height: cropRect.height,
          width: Math.max(0, cropRect.x),
        }}
      />
      <div
        className="pointer-events-none absolute right-0 bg-slate-950/45"
        style={{
          top: cropRect.y,
          height: cropRect.height,
          width: Math.max(0, frameWidth - cropRect.x - cropRect.width),
        }}
      />
      <div
        data-crop-body
        className="absolute cursor-move border border-white/80 bg-transparent"
        style={{
          left: cropRect.x,
          top: cropRect.y,
          width: cropRect.width,
          height: cropRect.height,
        }}
      >
        <div className="pointer-events-none absolute left-1/3 top-0 h-full w-px bg-white/30" />
        <div className="pointer-events-none absolute left-2/3 top-0 h-full w-px bg-white/30" />
        <div className="pointer-events-none absolute left-0 top-1/3 h-px w-full bg-white/30" />
        <div className="pointer-events-none absolute left-0 top-2/3 h-px w-full bg-white/30" />
        {CROP_EDGE_HANDLES.map((handle) => (
          <span
            key={`${handle}-line`}
            className={cn(
              "pointer-events-none absolute z-[6] transition-colors duration-75",
              handle === "n" && "left-0 right-0 top-0 h-[2px]",
              handle === "s" && "bottom-0 left-0 right-0 h-[2px]",
              handle === "w" && "bottom-0 left-0 top-0 w-[2px]",
              handle === "e" && "bottom-0 right-0 top-0 w-[2px]",
              highlightedCropEdges.has(handle) ? "bg-sky-300" : "bg-white/65"
            )}
          />
        ))}
        {CROP_EDGE_HANDLES.map((handle) => (
          <span
            key={`${handle}-hit`}
            data-crop-handle={handle}
            className={cn(
              "absolute z-[5] bg-transparent",
              handle === "n" && "left-2 right-2 -top-2 h-4 cursor-ns-resize",
              handle === "s" && "left-2 right-2 -bottom-2 h-4 cursor-ns-resize",
              handle === "w" && "-left-2 bottom-2 top-2 w-4 cursor-ew-resize",
              handle === "e" && "-right-2 bottom-2 top-2 w-4 cursor-ew-resize"
            )}
          />
        ))}
        {CROP_CORNER_HANDLES.map((handle) => (
          <span
            key={handle}
            data-crop-handle={handle}
            className={cn(
              "absolute z-10 h-3 w-3 rounded-full border",
              highlightedCropCorner === handle
                ? "border-sky-300 bg-sky-200 shadow-[0_0_0_2px_rgba(125,211,252,0.35)]"
                : "border-white/90 bg-slate-100",
              handle === "nw" && "-left-1.5 -top-1.5 cursor-nwse-resize",
              handle === "ne" && "-right-1.5 -top-1.5 cursor-nesw-resize",
              handle === "sw" && "-bottom-1.5 -left-1.5 cursor-nesw-resize",
              handle === "se" && "-bottom-1.5 -right-1.5 cursor-nwse-resize"
            )}
          />
        ))}
        {CROP_EDGE_HANDLES.map((handle) => (
          <span
            key={handle}
            data-crop-handle={handle}
            className={cn(
              "absolute z-10 rounded-full",
              highlightedCropEdges.has(handle)
                ? "bg-sky-300 shadow-[0_0_0_1px_rgba(125,211,252,0.7)]"
                : "bg-white/95 shadow-[0_0_0_1px_rgba(255,255,255,0.45)]",
              handle === "n" && "left-1/2 -top-0.5 h-1 w-14 -translate-x-1/2 cursor-ns-resize",
              handle === "s" && "bottom-[-2px] left-1/2 h-1 w-14 -translate-x-1/2 cursor-ns-resize",
              handle === "w" && "top-1/2 -left-0.5 h-14 w-1 -translate-y-1/2 cursor-ew-resize",
              handle === "e" && "right-[-2px] top-1/2 h-14 w-1 -translate-y-1/2 cursor-ew-resize"
            )}
          />
        ))}
      </div>
    </div>
  );
}
