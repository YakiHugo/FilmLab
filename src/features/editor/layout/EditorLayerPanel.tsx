import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { EditorLayerBlendMode } from "@/types";
import { EditorSliderRow } from "../EditorSliderRow";
import { useEditorState } from "../useEditorState";

const BLEND_MODE_OPTIONS: Array<{ value: EditorLayerBlendMode; label: string }> = [
  { value: "normal", label: "Normal" },
  { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
  { value: "softLight", label: "Soft Light" },
];

interface EditorLayerPanelProps {
  className?: string;
}

export function EditorLayerPanel({ className }: EditorLayerPanelProps) {
  const {
    assets,
    selectedAsset,
    selectedLayer,
    selectedLayerId,
    layers,
    setSelectedLayerId,
    addAdjustmentLayer,
    addDuplicateLayer,
    reorderLayer,
    moveLayer,
    removeLayer,
    mergeLayerDown,
    flattenLayers,
    setLayerVisibility,
    setLayerOpacity,
    setLayerBlendMode,
  } = useEditorState();
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  const selectedLayerIndex = useMemo(
    () => layers.findIndex((layer) => layer.id === selectedLayerId),
    [layers, selectedLayerId]
  );

  const resolveLayerPreview = (layerId?: string) => {
    if (!layerId) {
      return selectedAsset?.thumbnailUrl ?? selectedAsset?.objectUrl;
    }
    const texture = assetById.get(layerId);
    return texture?.thumbnailUrl ?? texture?.objectUrl;
  };

  const currentBlendMode = selectedLayer?.blendMode ?? "normal";
  const currentOpacity = selectedLayer?.opacity ?? 100;

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col border-t border-white/10 bg-[#121316] lg:border-r lg:border-t-0",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Layers</p>
          <p className="text-[11px] text-zinc-400">{layers.length} item(s)</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 rounded-lg border-white/15 bg-[#0f1114]/75 px-2.5"
            onClick={() => addAdjustmentLayer()}
            disabled={!selectedAsset}
          >
            <Plus className="h-3.5 w-3.5" />
            Adj
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 rounded-lg border-white/15 bg-[#0f1114]/75 px-2.5"
            onClick={() => addDuplicateLayer()}
            disabled={!selectedLayer}
          >
            <Copy className="h-3.5 w-3.5" />
            Dup
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {layers.map((layer, index) => {
          const isSelected = layer.id === selectedLayerId;
          const isDragging = draggingLayerId === layer.id;
          const isDropTarget = Boolean(draggingLayerId && draggingLayerId !== layer.id);
          const previewSrc =
            layer.type === "texture"
              ? resolveLayerPreview(layer.textureAssetId)
              : selectedAsset?.thumbnailUrl ?? selectedAsset?.objectUrl;

          return (
            <button
              key={layer.id}
              type="button"
              draggable
              className={cn(
                "flex w-full items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition",
                isSelected
                  ? "border-white/35 bg-white/10 text-white"
                  : "border-white/10 bg-[#0f1114]/60 text-zinc-300 hover:border-white/20 hover:bg-[#161a1f]",
                isDragging && "opacity-50",
                isDropTarget && "cursor-grabbing"
              )}
              onDragStart={(event) => {
                setDraggingLayerId(layer.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", layer.id);
              }}
              onDragOver={(event) => {
                if (!draggingLayerId || draggingLayerId === layer.id) {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                if (!draggingLayerId || draggingLayerId === layer.id) {
                  return;
                }
                event.preventDefault();
                const toIndex = layers.findIndex((item) => item.id === layer.id);
                if (toIndex >= 0) {
                  reorderLayer(draggingLayerId, toIndex);
                }
                setDraggingLayerId(null);
              }}
              onDragEnd={() => {
                setDraggingLayerId(null);
              }}
              onClick={() => setSelectedLayerId(layer.id)}
            >
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt={layer.name}
                  className="h-9 w-9 rounded-md border border-white/10 object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-black/30">
                  <ImageIcon className="h-3.5 w-3.5 text-zinc-400" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-xs font-medium">{layer.name}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                  {layer.type}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="rounded-md border border-white/10 bg-black/20 p-1 text-zinc-300 transition hover:border-white/20 hover:bg-white/10"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setLayerVisibility(layer.id, !layer.visible);
                  }}
                  aria-label={layer.visible ? "Hide layer" : "Show layer"}
                >
                  {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    className="rounded-md border border-white/10 bg-black/20 p-0.5 text-zinc-300 transition hover:border-white/20 hover:bg-white/10 disabled:opacity-40"
                    disabled={index === 0}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      moveLayer(layer.id, "up");
                    }}
                    aria-label="Move layer up"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-white/10 bg-black/20 p-0.5 text-zinc-300 transition hover:border-white/20 hover:bg-white/10 disabled:opacity-40"
                    disabled={index >= layers.length - 1}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      moveLayer(layer.id, "down");
                    }}
                    aria-label="Move layer down"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
                <button
                  type="button"
                  className="rounded-md border border-rose-300/30 bg-rose-300/10 p-1 text-rose-200 transition hover:bg-rose-300/20 disabled:opacity-40"
                  disabled={layer.type === "base" || layers.length <= 1}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    removeLayer(layer.id);
                  }}
                  aria-label="Delete layer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </button>
          );
        })}

        {layers.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-[#0f1114]/60 p-3 text-xs text-zinc-500">
            Select an asset from Library to start editing layers.
          </div>
        )}
      </div>

      <div className="border-t border-white/10 p-3">
        <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">Layer Properties</p>

        <div className="space-y-3 rounded-xl border border-white/10 bg-[#0f1114]/70 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 rounded-lg border-white/15 bg-[#0f1114]/75"
              onClick={() => {
                if (!selectedLayer) {
                  return;
                }
                mergeLayerDown(selectedLayer.id);
              }}
              disabled={!selectedLayer || selectedLayerIndex < 0 || selectedLayerIndex >= layers.length - 1}
            >
              <Layers className="h-3.5 w-3.5" />
              Merge Down
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 rounded-lg border-white/15 bg-[#0f1114]/75"
              onClick={() => flattenLayers()}
              disabled={layers.length <= 1}
            >
              Flatten
            </Button>
          </div>

          <div>
            <p className="mb-1.5 text-xs text-zinc-300">Blend Mode</p>
            <Select
              value={currentBlendMode}
              disabled={!selectedLayer}
              onValueChange={(next) => {
                if (!selectedLayer) {
                  return;
                }
                setLayerBlendMode(selectedLayer.id, next as EditorLayerBlendMode);
              }}
            >
              <SelectTrigger className="h-8 rounded-lg text-xs focus:ring-white/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BLEND_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <EditorSliderRow
            label="Opacity"
            min={0}
            max={100}
            step={1}
            disabled={!selectedLayer}
            value={currentOpacity}
            defaultValue={100}
            format={(value) => `${Math.round(value)}%`}
            onChange={(value) => {
              if (!selectedLayer) {
                return;
              }
              setLayerOpacity(selectedLayer.id, value);
            }}
            onCommit={(value) => {
              if (!selectedLayer) {
                return;
              }
              setLayerOpacity(selectedLayer.id, value);
            }}
            onReset={() => {
              if (!selectedLayer) {
                return;
              }
              setLayerOpacity(selectedLayer.id, 100);
            }}
          />
        </div>
      </div>
    </aside>
  );
}
