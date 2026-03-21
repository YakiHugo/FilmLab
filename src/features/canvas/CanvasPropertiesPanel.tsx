import { useMemo } from "react";
import { SlidersHorizontal } from "lucide-react";
import { filmProfiles } from "@/data/filmProfiles";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";
import type { CanvasElement } from "@/types";
import { useCanvasSelectionModel } from "./hooks/useCanvasSelectionModel";
import {
  applyCanvasTextFontSizeTier,
  CANVAS_TEXT_COLOR_OPTIONS,
  CANVAS_TEXT_FONT_OPTIONS,
  CANVAS_TEXT_SIZE_TIER_OPTIONS,
  getCanvasTextColorOption,
  getCanvasTextFontOption,
} from "./textStyle";

const NumberInput = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) => (
  <label className="space-y-1.5">
    <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{label}</span>
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      value={Math.round(value * 1000) / 1000}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
      className="h-10 rounded-2xl border-white/10 bg-black/35 px-3 text-sm"
    />
  </label>
);

export function CanvasPropertiesPanel() {
  const upsertElement = useCanvasStore((state) => state.upsertElement);
  const assets = useAssetStore((state) => state.assets);
  const { activeWorkbench, primarySelectedElement: selected } = useCanvasSelectionModel();

  const update = (patch: Partial<CanvasElement>) => {
    if (!selected) {
      return;
    }
    void upsertElement({
      ...selected,
      ...patch,
    } as CanvasElement);
  };

  const selectedAsset = useMemo(() => {
    if (!selected || selected.type !== "image") {
      return null;
    }
    return assets.find((asset) => asset.id === selected.assetId) ?? null;
  }, [assets, selected]);

  const textFontOptions = useMemo(() => {
    if (!selected || selected.type !== "text") {
      return CANVAS_TEXT_FONT_OPTIONS;
    }
    const current = getCanvasTextFontOption(selected.fontFamily);
    return CANVAS_TEXT_FONT_OPTIONS.some((option) => option.value === current.value)
      ? CANVAS_TEXT_FONT_OPTIONS
      : [...CANVAS_TEXT_FONT_OPTIONS, current];
  }, [selected]);

  const textColorOptions = useMemo(() => {
    if (!selected || selected.type !== "text") {
      return CANVAS_TEXT_COLOR_OPTIONS;
    }
    const current = getCanvasTextColorOption(selected.color);
    return CANVAS_TEXT_COLOR_OPTIONS.some((option) => option.value === current.value)
      ? CANVAS_TEXT_COLOR_OPTIONS
      : [...CANVAS_TEXT_COLOR_OPTIONS, current];
  }, [selected]);

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Inspector</p>
          <h3 className="mt-1 font-['Syne'] text-xl text-zinc-100">Tune the selected layer.</h3>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
          <SlidersHorizontal className="h-4 w-4 text-zinc-400" />
        </div>
      </div>

      {!selected ? (
        <div className="mt-4 rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] p-4">
          <p className="text-sm font-medium text-zinc-100">Nothing selected yet.</p>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Click any image, text, shape, or group layer on the 工作台 to edit it here.
          </p>
          {activeWorkbench ? (
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-300">
              <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Canvas</p>
                <p className="mt-2 font-medium text-zinc-100">
                  {activeWorkbench.width} x {activeWorkbench.height}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Layers</p>
                <p className="mt-2 font-medium text-zinc-100">{activeWorkbench.elements.length}</p>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                  Selected Layer
                </p>
                <p className="mt-1 text-sm font-medium text-zinc-100">
                  {selected.type === "image"
                    ? (selectedAsset?.name ?? "Image layer")
                    : selected.type === "text"
                      ? "Text layer"
                      : selected.type === "shape"
                        ? `${selected.shapeType} shape`
                        : (selected.name || "Group")}
                </p>
              </div>
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-zinc-400">
                {selected.type}
              </span>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Transform</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <NumberInput label="X" value={selected.x} onChange={(value) => update({ x: value })} />
              <NumberInput label="Y" value={selected.y} onChange={(value) => update({ y: value })} />
              <NumberInput
                label="Width"
                value={selected.width}
                min={1}
                onChange={(value) => update({ width: Math.max(1, value) })}
              />
              <NumberInput
                label="Height"
                value={selected.height}
                min={1}
                onChange={(value) => update({ height: Math.max(1, value) })}
              />
              <NumberInput
                label="Rotation"
                value={selected.rotation}
                step={0.5}
                onChange={(value) => update({ rotation: value })}
              />
              <NumberInput
                label="Opacity"
                value={selected.opacity}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => update({ opacity: Math.max(0, Math.min(1, value)) })}
              />
            </div>
          </div>

          {selected.type === "image" ? (
            <div className="space-y-3 rounded-[24px] border border-white/10 bg-black/25 p-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Image</p>
                <p className="mt-1 truncate text-sm text-zinc-100">
                  {selectedAsset?.name ?? selected.assetId}
                </p>
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  通过工作台侧的编辑面板微调已放置图片，让排版和调色保持在同一条工作流里。
                </p>
              </div>

              <Select
                value={selected.filmProfileId ?? "none"}
                onValueChange={(value) =>
                  update({ filmProfileId: value === "none" ? undefined : value })
                }
              >
                <SelectTrigger className="h-10 rounded-2xl border-white/10 bg-black/35 text-sm">
                  <SelectValue placeholder="Film profile" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No profile</SelectItem>
                  {filmProfiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {selected.type === "text" ? (
            <div className="space-y-3 rounded-[24px] border border-white/10 bg-black/25 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Text</p>
              <Input
                value={selected.content}
                onChange={(event) => update({ content: event.target.value })}
                className="h-10 rounded-2xl border-white/10 bg-black/35 px-3 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <Select
                  value={selected.fontFamily}
                  onValueChange={(value) => update({ fontFamily: value })}
                >
                  <SelectTrigger className="h-10 rounded-2xl border-white/10 bg-black/35 text-sm">
                    <SelectValue placeholder="Font" />
                  </SelectTrigger>
                  <SelectContent>
                    {textFontOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={selected.fontSizeTier}
                  onValueChange={(value) =>
                    update(
                      applyCanvasTextFontSizeTier(selected, value as typeof selected.fontSizeTier)
                    )
                  }
                >
                  <SelectTrigger className="h-10 rounded-2xl border-white/10 bg-black/35 text-sm">
                    <SelectValue placeholder="Size tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {CANVAS_TEXT_SIZE_TIER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selected.color} onValueChange={(value) => update({ color: value })}>
                  <SelectTrigger className="h-10 rounded-2xl border-white/10 bg-black/35 text-sm">
                    <SelectValue placeholder="Color" />
                  </SelectTrigger>
                  <SelectContent>
                    {textColorOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={selected.textAlign}
                  onValueChange={(value) =>
                    update({ textAlign: value as "left" | "center" | "right" })
                  }
                >
                  <SelectTrigger className="h-10 rounded-2xl border-white/10 bg-black/35 text-sm">
                    <SelectValue placeholder="Align" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {selected.type === "shape" ? (
            <div className="space-y-3 rounded-[24px] border border-white/10 bg-black/25 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Shape</p>
              <label className="space-y-1.5">
                <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Fill</span>
                <Input
                  type="text"
                  value={selected.fill}
                  onChange={(event) => update({ fill: event.target.value } as Partial<CanvasElement>)}
                  className="h-10 rounded-2xl border-white/10 bg-black/35 px-3 text-sm"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Stroke</span>
                <Input
                  type="text"
                  value={selected.stroke}
                  onChange={(event) =>
                    update({ stroke: event.target.value } as Partial<CanvasElement>)
                  }
                  className="h-10 rounded-2xl border-white/10 bg-black/35 px-3 text-sm"
                />
              </label>
              <NumberInput
                label="Stroke Width"
                value={selected.strokeWidth}
                min={0}
                step={0.5}
                onChange={(value) =>
                  update({ strokeWidth: Math.max(0, value) } as Partial<CanvasElement>)
                }
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
