import { useMemo } from "react";
import { filmProfiles } from "@/data/filmProfiles";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  <label className="space-y-1">
    <span className="text-[11px] text-zinc-500">{label}</span>
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      value={Math.round(value * 1000) / 1000}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
      className="h-8 rounded-lg border-white/10 bg-black/35 px-2 text-xs"
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

  return (
    <aside className="rounded-2xl border border-white/10 bg-black/35 p-3">
      <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-zinc-500">Properties</h3>
      {!selected && <p className="text-xs text-zinc-500">Select an element to inspect.</p>}

      {selected && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-300">Type: {selected.type}</p>

          <div className="grid grid-cols-2 gap-2">
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

          {selected.type === "image" && (
            <div className="space-y-2 rounded-xl border border-white/10 bg-black/30 p-2">
              <p className="text-[11px] text-zinc-500">Image</p>
              <p className="truncate text-xs text-zinc-200">{selectedAsset?.name ?? selected.assetId}</p>
              <Select
                value={selected.filmProfileId ?? "none"}
                onValueChange={(value) => update({ filmProfileId: value === "none" ? undefined : value })}
              >
                <SelectTrigger className="h-8 rounded-lg text-xs">
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
            <div className="space-y-2 rounded-xl border border-white/10 bg-black/30 p-2">
              <p className="text-[11px] text-zinc-500">Text</p>
              <Input
                value={selected.content}
                onChange={(event) => update({ content: event.target.value })}
                className="h-8 rounded-lg border-white/10 bg-black/35 px-2 text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={selected.fontFamily}
                  onChange={(event) => update({ fontFamily: event.target.value })}
                  className="h-8 rounded-lg border-white/10 bg-black/35 px-2 text-xs"
                />
                <Input
                  type="number"
                  min={8}
                  value={selected.fontSize}
                  onChange={(event) => update({ fontSize: Math.max(8, Number(event.target.value) || 8) })}
                  className="h-8 rounded-lg border-white/10 bg-black/35 px-2 text-xs"
                />
                <Input
                  value={selected.color}
                  onChange={(event) => update({ color: event.target.value })}
                  className="h-8 rounded-lg border-white/10 bg-black/35 px-2 text-xs"
                />
                <Select
                  value={selected.textAlign}
                  onValueChange={(value) => update({ textAlign: value as "left" | "center" | "right" })}
                >
                  <SelectTrigger className="h-8 rounded-lg text-xs">
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
            <div className="space-y-2 rounded-xl border border-white/10 bg-black/30 p-2">
              <p className="text-[11px] text-zinc-500">Shape</p>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={selected.fill}
                  onChange={(event) => update({ fill: event.target.value })}
                  className="h-8 rounded-lg border-white/10 bg-black/35 px-2 text-xs"
                />
                <Input
                  value={selected.stroke ?? ""}
                  onChange={(event) => update({ stroke: event.target.value || undefined })}
                  className="h-8 rounded-lg border-white/10 bg-black/35 px-2 text-xs"
                />
                <Input
                  type="number"
                  min={0}
                  value={selected.strokeWidth ?? 0}
                  onChange={(event) => update({ strokeWidth: Math.max(0, Number(event.target.value) || 0) })}
                  className="h-8 rounded-lg border-white/10 bg-black/35 px-2 text-xs"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
