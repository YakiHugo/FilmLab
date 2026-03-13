import { useMemo } from "react";
import type { CropGuideMode } from "@/features/editor/cropGuides";
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
  cropGuideMode: CropGuideMode;
  cropGuideRotation: number;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
}

interface UnitPoint {
  x: number;
  y: number;
}

interface GuideLine {
  start: UnitPoint;
  end: UnitPoint;
  emphasis?: "normal" | "strong" | "faint";
}

const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
const GOLDEN_MAJOR = 1 / GOLDEN_RATIO;
const GOLDEN_MINOR = 1 - GOLDEN_MAJOR;

const normalizeGuideRotation = (rotation: number) => {
  const normalized = Math.round(rotation) % 4;
  return (normalized + 4) % 4;
};

const rotateUnitPoint = (point: UnitPoint, rotation: number): UnitPoint => {
  switch (normalizeGuideRotation(rotation)) {
    case 1:
      return { x: 1 - point.y, y: point.x };
    case 2:
      return { x: 1 - point.x, y: 1 - point.y };
    case 3:
      return { x: point.y, y: 1 - point.x };
    default:
      return point;
  }
};

const scaleGuidePoint = (point: UnitPoint, width: number, height: number) => ({
  x: point.x * width,
  y: point.y * height,
});

const buildLine = (
  start: UnitPoint,
  end: UnitPoint,
  emphasis: GuideLine["emphasis"] = "normal"
): GuideLine => ({
  start,
  end,
  emphasis,
});

const buildGuideLines = (mode: CropGuideMode): GuideLine[] => {
  switch (mode) {
    case "diagonal":
      return [
        buildLine({ x: 0, y: 0 }, { x: 1, y: 1 }, "strong"),
        buildLine({ x: 1, y: 0 }, { x: 0, y: 1 }, "strong"),
      ];
    case "phiGrid":
      return [
        buildLine({ x: GOLDEN_MINOR, y: 0 }, { x: GOLDEN_MINOR, y: 1 }),
        buildLine({ x: GOLDEN_MAJOR, y: 0 }, { x: GOLDEN_MAJOR, y: 1 }),
        buildLine({ x: 0, y: GOLDEN_MINOR }, { x: 1, y: GOLDEN_MINOR }),
        buildLine({ x: 0, y: GOLDEN_MAJOR }, { x: 1, y: GOLDEN_MAJOR }),
      ];
    case "goldenTriangle":
      return [
        buildLine({ x: 0, y: 0 }, { x: 1, y: 1 }, "strong"),
        buildLine({ x: 1, y: 0 }, { x: 0.5, y: 0.5 }),
        buildLine({ x: 0, y: 1 }, { x: 0.5, y: 0.5 }),
      ];
    case "armature":
      return [
        buildLine({ x: 0, y: 0 }, { x: 1, y: 1 }, "strong"),
        buildLine({ x: 1, y: 0 }, { x: 0, y: 1 }, "strong"),
        buildLine({ x: 0.5, y: 0 }, { x: 0.5, y: 1 }, "faint"),
        buildLine({ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, "faint"),
        buildLine({ x: 0, y: 0 }, { x: 1, y: 0.5 }),
        buildLine({ x: 0, y: 0 }, { x: 0.5, y: 1 }),
        buildLine({ x: 1, y: 0 }, { x: 0, y: 0.5 }),
        buildLine({ x: 1, y: 0 }, { x: 0.5, y: 1 }),
        buildLine({ x: 1, y: 1 }, { x: 0.5, y: 0 }),
        buildLine({ x: 1, y: 1 }, { x: 0, y: 0.5 }),
        buildLine({ x: 0, y: 1 }, { x: 0.5, y: 0 }),
        buildLine({ x: 0, y: 1 }, { x: 1, y: 0.5 }),
      ];
    case "goldenSpiral":
      return [
        buildLine({ x: GOLDEN_MINOR, y: 0 }, { x: GOLDEN_MINOR, y: 1 }, "faint"),
        buildLine({ x: GOLDEN_MAJOR, y: 0 }, { x: GOLDEN_MAJOR, y: 1 }, "faint"),
        buildLine({ x: 0, y: GOLDEN_MINOR }, { x: 1, y: GOLDEN_MINOR }, "faint"),
        buildLine({ x: 0, y: GOLDEN_MAJOR }, { x: 1, y: GOLDEN_MAJOR }, "faint"),
      ];
    case "thirds":
    default:
      return [
        buildLine({ x: 1 / 3, y: 0 }, { x: 1 / 3, y: 1 }),
        buildLine({ x: 2 / 3, y: 0 }, { x: 2 / 3, y: 1 }),
        buildLine({ x: 0, y: 1 / 3 }, { x: 1, y: 1 / 3 }),
        buildLine({ x: 0, y: 2 / 3 }, { x: 1, y: 2 / 3 }),
      ];
  }
};

const buildGoldenSpiralUnitPoints = () => {
  const steps = 88;
  const thetaMax = Math.PI * 2.75;
  const points: UnitPoint[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const theta = thetaMax * (1 - t);
    const radius = GOLDEN_RATIO ** (theta / (Math.PI / 2));
    const x = radius * Math.cos(theta);
    const y = radius * Math.sin(theta);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    points.push({ x, y });
  }

  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  return points.map((point) => ({
    x: (point.x - minX) / spanX,
    y: 1 - (point.y - minY) / spanY,
  }));
};

const buildPathFromUnitPoints = (
  points: UnitPoint[],
  width: number,
  height: number,
  rotation: number
) =>
  points
    .map((point, index) => {
      const rotated = rotateUnitPoint(point, rotation);
      const scaled = scaleGuidePoint(rotated, width, height);
      return `${index === 0 ? "M" : "L"}${scaled.x.toFixed(2)},${scaled.y.toFixed(2)}`;
    })
    .join(" ");

const resolveGuideStrokeClass = (emphasis: GuideLine["emphasis"]) => {
  if (emphasis === "strong") {
    return "stroke-white/60";
  }
  if (emphasis === "faint") {
    return "stroke-white/20";
  }
  return "stroke-white/35";
};

export function CropOverlay({
  cropRect,
  frameWidth,
  frameHeight,
  activeCropDragMode,
  cropGuideMode,
  cropGuideRotation,
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

  const guideLines = useMemo(() => buildGuideLines(cropGuideMode), [cropGuideMode]);
  const goldenSpiralPath = useMemo(() => {
    if (cropGuideMode !== "goldenSpiral") {
      return "";
    }
    return buildPathFromUnitPoints(
      buildGoldenSpiralUnitPoints(),
      cropRect.width,
      cropRect.height,
      cropGuideRotation
    );
  }, [cropGuideMode, cropGuideRotation, cropRect.height, cropRect.width]);

  return (
    <div
      className="absolute inset-0 z-20 touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
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
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${cropRect.width} ${cropRect.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {guideLines.map((line, index) => {
            const start = scaleGuidePoint(
              rotateUnitPoint(line.start, cropGuideRotation),
              cropRect.width,
              cropRect.height
            );
            const end = scaleGuidePoint(
              rotateUnitPoint(line.end, cropGuideRotation),
              cropRect.width,
              cropRect.height
            );
            return (
              <line
                key={`${cropGuideMode}-${index}-${start.x.toFixed(2)}-${start.y.toFixed(2)}`}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                vectorEffect="non-scaling-stroke"
                strokeWidth={1}
                className={resolveGuideStrokeClass(line.emphasis)}
              />
            );
          })}
          {goldenSpiralPath ? (
            <path
              d={goldenSpiralPath}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeWidth={1.25}
              className="stroke-white/55"
            />
          ) : null}
        </svg>

        {CROP_EDGE_HANDLES.map((handle) => (
          <span
            key={`${handle}-line`}
            className={cn(
              "pointer-events-none absolute z-[6] transition-colors duration-75",
              handle === "n" && "left-0 right-0 top-0 h-[2px]",
              handle === "s" && "bottom-0 left-0 right-0 h-[2px]",
              handle === "w" && "bottom-0 left-0 top-0 w-[2px]",
              handle === "e" && "bottom-0 right-0 top-0 w-[2px]",
              highlightedCropEdges.has(handle) ? "bg-white" : "bg-white/65"
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
                ? "border-white bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.35)]"
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
                ? "bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.75)]"
                : "bg-white/95 shadow-[0_0_0_1px_rgba(255,255,255,0.45)]",
              handle === "n" && "left-1/2 -top-0.5 h-1 w-14 -translate-x-1/2 cursor-ns-resize",
              handle === "s" &&
                "bottom-[-2px] left-1/2 h-1 w-14 -translate-x-1/2 cursor-ns-resize",
              handle === "w" && "top-1/2 -left-0.5 h-14 w-1 -translate-y-1/2 cursor-ew-resize",
              handle === "e" && "right-[-2px] top-1/2 h-14 w-1 -translate-y-1/2 cursor-ew-resize"
            )}
          />
        ))}
      </div>
    </div>
  );
}
