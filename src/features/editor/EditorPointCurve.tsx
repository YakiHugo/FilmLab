import { memo, useEffect, useMemo, useRef, useState } from "react";
import { clamp } from "@/lib/math";
import type { PointCurvePoint } from "@/types";

interface EditorPointCurveProps {
  points: PointCurvePoint[];
  onPreview: (points: PointCurvePoint[]) => void;
  onCommit: (points: PointCurvePoint[]) => void;
}

const CONTROL_XS = [32, 96, 160, 224];

const curveValueToY = (value: number) => {
  const normalized = clamp(value / 255, 0, 1);
  return 90 - normalized * 80;
};

const yToCurveValue = (y: number) => {
  const normalized = clamp((90 - y) / 80, 0, 1);
  return Math.round(normalized * 255);
};

const sortPoints = (points: PointCurvePoint[]) =>
  [...points].sort((a, b) => a.x - b.x);

const sampleCurveY = (points: PointCurvePoint[], x: number) => {
  const sorted = sortPoints(points);
  if (sorted.length === 0) {
    return x;
  }
  if (sorted.length === 1) {
    return sorted[0]?.y ?? x;
  }
  if (x <= (sorted[0]?.x ?? 0)) {
    return sorted[0]?.y ?? 0;
  }
  const last = sorted[sorted.length - 1];
  if (x >= (last?.x ?? 255)) {
    return last?.y ?? 255;
  }
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const p0 = sorted[i]!;
    const p1 = sorted[i + 1]!;
    if (x >= p0.x && x <= p1.x) {
      const dx = Math.max(1, p1.x - p0.x);
      const t = (x - p0.x) / dx;
      return p0.y + (p1.y - p0.y) * t;
    }
  }
  return x;
};

const buildCurvePointsFromControlValues = (values: number[], basePoints: PointCurvePoint[]) => {
  const shadowPoint: PointCurvePoint = {
    x: 0,
    y: Math.round(clamp(sampleCurveY(basePoints, 0), 0, 255)),
  };
  const highlightPoint: PointCurvePoint = {
    x: 255,
    y: Math.round(clamp(sampleCurveY(basePoints, 255), 0, 255)),
  };
  const controls = CONTROL_XS.map((x, index) => ({
    x,
    y: Math.round(clamp(values[index] ?? sampleCurveY(basePoints, x), 0, 255)),
  }));
  return [shadowPoint, ...controls, highlightPoint];
};

export const EditorPointCurve = memo(function EditorPointCurve({
  points,
  onPreview,
  onCommit,
}: EditorPointCurveProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRectRef = useRef<DOMRect | null>(null);
  const dragValuesRef = useRef<number[] | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const controlValues = useMemo(
    () => CONTROL_XS.map((x) => Math.round(clamp(sampleCurveY(points, x), 0, 255))),
    [points]
  );

  const handles = useMemo(
    () =>
      CONTROL_XS.map((x, index) => ({
        x,
        y: controlValues[index] ?? sampleCurveY(points, x),
        label: ["阴影", "暗部", "亮部", "高光"][index] ?? `P${index + 1}`,
      })),
    [controlValues, points]
  );

  const curvePath = useMemo(() => {
    const sorted = sortPoints(points);
    if (sorted.length === 0) {
      return "M 0 90 L 100 10";
    }
    return sorted
      .map((point, index) => {
        const x = clamp((point.x / 255) * 100, 0, 100);
        const y = curveValueToY(point.y);
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }, [points]);

  useEffect(() => {
    if (draggingIndex === null) {
      return undefined;
    }

    const onPointerMove = (event: PointerEvent) => {
      const rect = dragRectRef.current;
      const values = dragValuesRef.current;
      if (!rect || !values) {
        return;
      }
      const relativeY = ((event.clientY - rect.top) / rect.height) * 100;
      const clampedY = clamp(relativeY, 10, 90);
      const nextValue = yToCurveValue(clampedY);
      const nextValues = [...values];
      nextValues[draggingIndex] = nextValue;
      dragValuesRef.current = nextValues;
      onPreview(buildCurvePointsFromControlValues(nextValues, points));
    };

    const onPointerUp = () => {
      const values = dragValuesRef.current ?? controlValues;
      onCommit(buildCurvePointsFromControlValues(values, points));
      dragRectRef.current = null;
      dragValuesRef.current = null;
      setDraggingIndex(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [controlValues, draggingIndex, onCommit, onPreview, points]);

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-slate-200">点曲线</p>
        <p className="text-[11px] text-slate-500">拖动控制点调整 RGB 曲线</p>
      </div>
      <div ref={trackRef} className="relative h-40 rounded-xl border border-white/10 bg-black/40">
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <path d="M 0 50 L 100 50" stroke="rgba(148,163,184,0.25)" strokeWidth="1" />
          <path d={curvePath} fill="none" stroke="rgba(56,189,248,0.95)" strokeWidth="2.2" />
        </svg>
        {handles.map((handle, index) => (
          <button
            key={`${handle.label}-${handle.x}`}
            type="button"
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-200/50 bg-slate-950 p-1 shadow-[0_0_0_2px_rgba(15,23,42,0.8)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/40"
            style={{ left: `${(handle.x / 255) * 100}%`, top: `${curveValueToY(handle.y)}%` }}
            aria-label={`调整${handle.label}`}
            onPointerDown={(event) => {
              event.preventDefault();
              const rect = trackRef.current?.getBoundingClientRect();
              if (!rect) {
                return;
              }
              dragRectRef.current = rect;
              dragValuesRef.current = [...controlValues];
              setDraggingIndex(index);
            }}
          >
            <span className="block h-2.5 w-2.5 rounded-full bg-sky-300" />
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-slate-400">
        {handles.map((handle, index) => (
          <div key={`${handle.label}-${index}`} className="text-center">
            <div>{handle.label}</div>
            <div className="font-medium text-slate-200">{handle.y}</div>
          </div>
        ))}
      </div>
    </div>
  );
});

