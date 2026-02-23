import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { EditingAdjustments } from "@/types";
import { EditorSliderRow } from "./EditorSliderRow";

type ColorGradingZoneKey = "shadows" | "midtones" | "highlights";
type ColorGradingZoneValue = EditingAdjustments["colorGrading"]["shadows"];
type ColorGradingScalarKey = "blend" | "balance";

interface EditorColorGradingPanelProps {
  colorGrading: EditingAdjustments["colorGrading"];
  onPreviewZone: (zone: ColorGradingZoneKey, value: ColorGradingZoneValue) => void;
  onCommitZone: (zone: ColorGradingZoneKey, value: ColorGradingZoneValue) => void;
  onPreviewValue: (key: ColorGradingScalarKey, value: number) => void;
  onCommitValue: (key: ColorGradingScalarKey, value: number) => void;
  onReset: () => void;
}

const ZONES: Array<{ id: ColorGradingZoneKey; label: string }> = [
  { id: "shadows", label: "阴影" },
  { id: "midtones", label: "中间调" },
  { id: "highlights", label: "高光" },
];

import { clamp } from "@/lib/math";

const normalizeHue = (value: number) => {
  let hue = value;
  while (hue > 180) {
    hue -= 360;
  }
  while (hue <= -180) {
    hue += 360;
  }
  return hue;
};

interface ColorWheelProps {
  zone: ColorGradingZoneKey;
  label: string;
  value: ColorGradingZoneValue;
  onPreview: (zone: ColorGradingZoneKey, value: ColorGradingZoneValue) => void;
  onCommit: (zone: ColorGradingZoneKey, value: ColorGradingZoneValue) => void;
}

const ColorWheel = memo(function ColorWheel({
  zone,
  label,
  value,
  onPreview,
  onCommit,
}: ColorWheelProps) {
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const wheelRectRef = useRef<DOMRect | null>(null);
  const latestValueRef = useRef<ColorGradingZoneValue>(value);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  const handleFromPoint = (clientX: number, clientY: number) => {
    const rect = wheelRectRef.current;
    if (!rect) {
      return value;
    }
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const radius = rect.width * 0.42;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const saturation = clamp((distance / radius) * 100, 0, 100);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const hue = Math.round(normalizeHue(angle));
    return {
      ...latestValueRef.current,
      hue,
      saturation: Math.round(saturation),
    };
  };

  useEffect(() => {
    if (!dragging) {
      return undefined;
    }

    const onPointerMove = (event: PointerEvent) => {
      const next = handleFromPoint(event.clientX, event.clientY);
      if (
        next.hue === latestValueRef.current.hue &&
        next.saturation === latestValueRef.current.saturation
      ) {
        return;
      }
      latestValueRef.current = next;
      onPreview(zone, next);
    };

    const onPointerUp = () => {
      onCommit(zone, latestValueRef.current);
      wheelRectRef.current = null;
      setDragging(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [dragging, onCommit, onPreview, zone]);

  const handlePosition = useMemo(() => {
    const angle = ((value.hue < 0 ? value.hue + 360 : value.hue) * Math.PI) / 180;
    const radius = 42 * (value.saturation / 100);
    const x = 50 + Math.cos(angle) * radius;
    const y = 50 + Math.sin(angle) * radius;
    return { x, y };
  }, [value.hue, value.saturation]);

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-slate-950/60 p-3">
      <div className="flex items-center justify-between text-xs text-slate-300">
        <span>{label}</span>
        <span className="text-slate-500">
          H {Math.round(value.hue)} / S {Math.round(value.saturation)}
        </span>
      </div>
      <div
        ref={wheelRef}
        className="relative mx-auto h-[108px] w-[108px] rounded-full border border-white/20"
        style={{
          background:
            "radial-gradient(circle at center, #ffffff 0%, rgba(255,255,255,0.95) 14%, rgba(255,255,255,0) 52%), conic-gradient(#ff4d4d, #ffd24d, #66ff66, #4dd2ff, #6666ff, #d24dff, #ff4d4d)",
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          const rect = wheelRef.current?.getBoundingClientRect();
          if (!rect) {
            return;
          }
          wheelRectRef.current = rect;
          setDragging(true);
          const next = handleFromPoint(event.clientX, event.clientY);
          latestValueRef.current = next;
          onPreview(zone, next);
        }}
      >
        <div
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-950 shadow"
          style={{ left: `${handlePosition.x}%`, top: `${handlePosition.y}%` }}
        />
      </div>
    </div>
  );
});

interface ColorGradingZoneControlProps {
  id: ColorGradingZoneKey;
  label: string;
  value: ColorGradingZoneValue;
  onPreviewZone: (zone: ColorGradingZoneKey, value: ColorGradingZoneValue) => void;
  onCommitZone: (zone: ColorGradingZoneKey, value: ColorGradingZoneValue) => void;
}

const ColorGradingZoneControl = memo(function ColorGradingZoneControl({
  id,
  label,
  value,
  onPreviewZone,
  onCommitZone,
}: ColorGradingZoneControlProps) {
  const handlePreviewLuminance = useCallback(
    (luminance: number) => {
      onPreviewZone(id, {
        ...value,
        luminance,
      });
    },
    [id, onPreviewZone, value]
  );

  const handleCommitLuminance = useCallback(
    (luminance: number) => {
      onCommitZone(id, {
        ...value,
        luminance,
      });
    },
    [id, onCommitZone, value]
  );

  const handleResetLuminance = useCallback(() => {
    onCommitZone(id, {
      ...value,
      luminance: 0,
    });
  }, [id, onCommitZone, value]);

  return (
    <div className="space-y-2">
      <ColorWheel
        zone={id}
        label={label}
        value={value}
        onPreview={onPreviewZone}
        onCommit={onCommitZone}
      />
      <EditorSliderRow
        label={`${label}明度`}
        value={value.luminance}
        min={-100}
        max={100}
        defaultValue={0}
        format={(nextValue) => (nextValue > 0 ? `+${nextValue}` : `${nextValue}`)}
        onChange={handlePreviewLuminance}
        onCommit={handleCommitLuminance}
        onReset={handleResetLuminance}
      />
    </div>
  );
});

export const EditorColorGradingPanel = memo(function EditorColorGradingPanel({
  colorGrading,
  onPreviewZone,
  onCommitZone,
  onPreviewValue,
  onCommitValue,
  onReset,
}: EditorColorGradingPanelProps) {
  const previewFrameRef = useRef<number | null>(null);
  const pendingZonePreviewRef = useRef<{
    zone: ColorGradingZoneKey;
    value: ColorGradingZoneValue;
  } | null>(null);
  const pendingValuePreviewRef = useRef<{
    key: ColorGradingScalarKey;
    value: number;
  } | null>(null);

  const clearQueuedPreviews = useCallback(() => {
    if (previewFrameRef.current !== null) {
      cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
    pendingZonePreviewRef.current = null;
    pendingValuePreviewRef.current = null;
  }, []);

  const flushQueuedPreviews = useCallback(() => {
    previewFrameRef.current = null;
    const zonePreview = pendingZonePreviewRef.current;
    const valuePreview = pendingValuePreviewRef.current;
    pendingZonePreviewRef.current = null;
    pendingValuePreviewRef.current = null;

    if (zonePreview) {
      onPreviewZone(zonePreview.zone, zonePreview.value);
    }
    if (valuePreview) {
      onPreviewValue(valuePreview.key, valuePreview.value);
    }
  }, [onPreviewValue, onPreviewZone]);

  const schedulePreviewFlush = useCallback(() => {
    if (previewFrameRef.current !== null) {
      return;
    }
    previewFrameRef.current = requestAnimationFrame(() => {
      flushQueuedPreviews();
    });
  }, [flushQueuedPreviews]);

  const scheduleZonePreview = useCallback(
    (zone: ColorGradingZoneKey, value: ColorGradingZoneValue) => {
      pendingZonePreviewRef.current = { zone, value };
      schedulePreviewFlush();
    },
    [schedulePreviewFlush]
  );

  const scheduleValuePreview = useCallback(
    (key: ColorGradingScalarKey, value: number) => {
      pendingValuePreviewRef.current = { key, value };
      schedulePreviewFlush();
    },
    [schedulePreviewFlush]
  );

  const handleCommitZone = useCallback(
    (zone: ColorGradingZoneKey, value: ColorGradingZoneValue) => {
      clearQueuedPreviews();
      onCommitZone(zone, value);
    },
    [clearQueuedPreviews, onCommitZone]
  );

  const handleCommitValue = useCallback(
    (key: ColorGradingScalarKey, value: number) => {
      clearQueuedPreviews();
      onCommitValue(key, value);
    },
    [clearQueuedPreviews, onCommitValue]
  );

  useEffect(() => () => clearQueuedPreviews(), [clearQueuedPreviews]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" onClick={onReset}>
          重置颜色分级
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {ZONES.map((zone) => (
          <ColorGradingZoneControl
            key={zone.id}
            id={zone.id}
            label={zone.label}
            value={colorGrading[zone.id]}
            onPreviewZone={scheduleZonePreview}
            onCommitZone={handleCommitZone}
          />
        ))}
      </div>
      <EditorSliderRow
        label="混合"
        value={colorGrading.blend}
        min={0}
        max={100}
        defaultValue={50}
        onChange={(value) => scheduleValuePreview("blend", value)}
        onCommit={(value) => handleCommitValue("blend", value)}
        onReset={() => handleCommitValue("blend", 50)}
      />
      <EditorSliderRow
        label="平衡"
        value={colorGrading.balance}
        min={-100}
        max={100}
        defaultValue={0}
        format={(value) => (value > 0 ? `+${value}` : `${value}`)}
        onChange={(value) => scheduleValuePreview("balance", value)}
        onCommit={(value) => handleCommitValue("balance", value)}
        onReset={() => handleCommitValue("balance", 0)}
      />
    </div>
  );
});
