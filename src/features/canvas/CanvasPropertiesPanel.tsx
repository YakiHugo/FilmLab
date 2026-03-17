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
import type { CanvasElement } from "@/types";
import { useCanvasStore } from "@/stores/canvasStore";
import { useCanvasInteraction } from "./hooks/useCanvasInteraction";

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
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const upsertElement = useCanvasStore((state) => state.upsertElement);
  const assets = useAssetStore((state) => state.assets);
  const { selectedElementIds } = useCanvasInteraction();

  const selected = useMemo(() => {
    const active = documents.find((document) => document.id === activeDocumentId);
    if (!active || selectedElementIds.length === 0) {
      return null;
    }
    return active.elements.find((element) => element.id === selectedElementIds[0]) ?? null;
  }, [documents, activeDocumentId, selectedElementIds]);

  const update = (patch: Partial<CanvasElement>) => {
    if (!selected || !activeDocumentId) {
      return;
    }
    void upsertElement(activeDocumentId, {
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

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? null,
    [documents, activeDocumentId]
  );

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

      {!selected && (
        <div className="mt-4 rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] p-4">
          <p className="text-sm font-medium text-zinc-100">Nothing selected yet.</p>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Click any image, text, or shape on the board to edit its transform and style here.
          </p>
          {activeDocument ? (
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-300">
              <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Canvas</p>
                <p className="mt-2 font-medium text-zinc-100">
                  {activeDocument.width} x {activeDocument.height}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Layers</p>
                <p className="mt-2 font-medium text-zinc-100">{activeDocument.elements.length}</p>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {selected && (
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
                      : `${selected.shape} shape`}
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
              <NumberInput
                label="X"
                value={selected.x}
                onChange={(value) => update({ x: value })}
              />
              <NumberInput
                label="Y"
                value={selected.y}
                onChange={(value) => update({ y: value })}
              />
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

          {selected.type === "image" && (
            <div className="space-y-3 rounded-[24px] border border-white/10 bg-black/25 p-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Image</p>
                <p className="mt-1 truncate text-sm text-zinc-100">
                  {selectedAsset?.name ?? selected.assetId}
                </p>
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  Fine-tune placed images from the board-side edit panel to keep layout and tone in
                  one workflow.
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
          )}

          {selected.type === "text" && (
            <div className="space-y-3 rounded-[24px] border border-white/10 bg-black/25 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Text</p>
              <Input
                value={selected.content}
                onChange={(event) => update({ content: event.target.value })}
                className="h-10 rounded-2xl border-white/10 bg-black/35 px-3 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  value={selected.fontFamily}
                  onChange={(event) => update({ fontFamily: event.target.value })}
                  className="h-10 rounded-2xl border-white/10 bg-black/35 px-3 text-sm"
                />
                <Input
                  type="number"
                  min={8}
                  value={selected.fontSize}
                  onChange={(event) =>
                    update({ fontSize: Math.max(8, Number(event.target.value) || 8) })
                  }
                  className="h-10 rounded-2xl border-white/10 bg-black/35 px-3 text-sm"
                />
                <Input
                  value={selected.color}
                  onChange={(event) => update({ color: event.target.value })}
                  className="h-10 rounded-2xl border-white/10 bg-black/35 px-3 text-sm"
                />
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
          )}

          {selected.type === "shape" && (
            <div className="space-y-3 rounded-[24px] border border-white/10 bg-black/25 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Shape</p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  value={selected.fill}
                  onChange={(event) => update({ fill: event.target.value })}
                  className="h-10 rounded-2xl border-white/10 bg-black/35 px-3 text-sm"
                />
                <Input
                  value={selected.stroke ?? ""}
                  onChange={(event) => update({ stroke: event.target.value || undefined })}
                  className="h-10 rounded-2xl border-white/10 bg-black/35 px-3 text-sm"
                />
                <Input
                  type="number"
                  min={0}
                  value={selected.strokeWidth ?? 0}
                  onChange={(event) =>
                    update({ strokeWidth: Math.max(0, Number(event.target.value) || 0) })
                  }
                  className="h-10 rounded-2xl border-white/10 bg-black/35 px-3 text-sm"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
