import { memo, useEffect, useMemo, useRef, useState } from "react";
import { clamp } from "@/lib/math";

type CurveKey = "curveHighlights" | "curveLights" | "curveDarks" | "curveShadows";

interface EditorPointCurveProps {
  values: Record<CurveKey, number>;
  onPreview: (key: CurveKey, value: number) => void;
  onCommit: (key: CurveKey, value: number) => void;
}

const HANDLE_LAYOUT: Array<{ key: CurveKey; x: number; label: string }> = [
  { key: "curveShadows", x: 16, label: "阴影" },
  { key: "curveDarks", x: 36, label: "暗部" },
  { key: "curveLights", x: 64, label: "亮部" },
  { key: "curveHighlights", x: 84, label: "高光" },
];

const curveValueToY = (value: number) => {
  const normalized = clamp((value + 100) / 200, 0, 1);
  return 90 - normalized * 80;
};

const yToCurveValue = (y: number) => {
  const normalized = clamp((90 - y) / 80, 0, 1);
  return Math.round(normalized * 200 - 100);
};

export const EditorPointCurve = memo(function EditorPointCurve({
  values,
  onPreview,
  onCommit,
}: EditorPointCurveProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRectRef = useRef<DOMRect | null>(null);
  const dragValueRef = useRef<number>(0);
  const [draggingKey, setDraggingKey] = useState<CurveKey | null>(null);

  const handles = useMemo(
    () =>
      HANDLE_LAYOUT.map((item) => ({
        ...item,
        y: curveValueToY(values[item.key]),
      })),
    [values]
  );

  const curvePath = useMemo(() => {
    const sorted = [...handles].sort((a, b) => a.x - b.x);
    const points = [
      { x: 0, y: 50 },
      ...sorted.map((item) => ({ x: item.x, y: item.y })),
      { x: 100, y: 50 },
    ];
    return points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");
  }, [handles]);

  useEffect(() => {
    if (!draggingKey) {
      return undefined;
    }

    const onPointerMove = (event: PointerEvent) => {
      const rect = dragRectRef.current;
      if (!rect) {
        return;
      }
      const relativeY = ((event.clientY - rect.top) / rect.height) * 100;
      const clampedY = clamp(relativeY, 10, 90);
      const nextValue = yToCurveValue(clampedY);
      dragValueRef.current = nextValue;
      onPreview(draggingKey, nextValue);
    };

    const onPointerUp = () => {
      onCommit(draggingKey, dragValueRef.current);
      dragRectRef.current = null;
      setDraggingKey(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [draggingKey, onCommit, onPreview]);

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-slate-200">点曲线</p>
        <p className="text-[11px] text-slate-500">拖动节点改变分段曲线</p>
      </div>
      <div ref={trackRef} className="relative h-40 rounded-xl border border-white/10 bg-black/40">
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <path d="M 0 50 L 100 50" stroke="rgba(148,163,184,0.25)" strokeWidth="1" />
          <path d={curvePath} fill="none" stroke="rgba(56,189,248,0.95)" strokeWidth="2.2" />
        </svg>
        {handles.map((handle) => (
          <button
            key={handle.key}
            type="button"
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-200/50 bg-slate-950 p-1 shadow-[0_0_0_2px_rgba(15,23,42,0.8)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/40"
            style={{ left: `${handle.x}%`, top: `${handle.y}%` }}
            aria-label={`调整${handle.label}`}
            onPointerDown={(event) => {
              event.preventDefault();
              const rect = trackRef.current?.getBoundingClientRect();
              if (!rect) {
                return;
              }
              dragRectRef.current = rect;
              dragValueRef.current = values[handle.key];
              setDraggingKey(handle.key);
            }}
          >
            <span className="block h-2.5 w-2.5 rounded-full bg-sky-300" />
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-slate-400">
        {HANDLE_LAYOUT.map((item) => (
          <div key={item.key} className="text-center">
            <div>{item.label}</div>
            <div className="font-medium text-slate-200">
              {values[item.key] > 0 ? `+${values[item.key]}` : values[item.key]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
