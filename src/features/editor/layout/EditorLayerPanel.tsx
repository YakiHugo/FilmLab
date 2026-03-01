import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Eye, EyeOff, Image as ImageIcon, Plus } from "lucide-react";
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
    selectedAssetId,
    selectedAsset,
    orderedLayerAssetIds,
    layerVisibilityByAssetId,
    layerOpacityByAssetId,
    layerBlendModeByAssetId,
    setSelectedAssetId,
    setLayerOrder,
    moveLayer,
    setLayerVisibility,
    setLayerOpacity,
    setLayerBlendMode,
  } = useEditorState();
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const orderedAssets = useMemo(
    () =>
      orderedLayerAssetIds
        .map((id) => assetById.get(id))
        .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset)),
    [assetById, orderedLayerAssetIds]
  );

  const currentBlendMode = useMemo(() => {
    if (!selectedAssetId) {
      return "normal";
    }
    return layerBlendModeByAssetId[selectedAssetId] ?? "normal";
  }, [layerBlendModeByAssetId, selectedAssetId]);

  const currentOpacity = selectedAssetId ? (layerOpacityByAssetId[selectedAssetId] ?? 100) : 100;

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
          <p className="text-[11px] text-zinc-400">{orderedAssets.length} item(s)</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          asChild
          className="h-8 rounded-lg border-white/15 bg-[#0f1114]/75 px-2.5"
        >
          <Link to="/library">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Link>
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {orderedAssets.map((asset, index) => {
          const isSelected = asset.id === selectedAssetId;
          const visible = layerVisibilityByAssetId[asset.id] ?? true;
          const isDragging = draggingLayerId === asset.id;
          const isDropTarget = Boolean(draggingLayerId && draggingLayerId !== asset.id);
          return (
            <button
              key={asset.id}
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
                setDraggingLayerId(asset.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", asset.id);
              }}
              onDragOver={(event) => {
                if (!draggingLayerId || draggingLayerId === asset.id) {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                if (!draggingLayerId || draggingLayerId === asset.id) {
                  return;
                }
                event.preventDefault();
                const nextOrder = [...orderedLayerAssetIds];
                const fromIndex = nextOrder.indexOf(draggingLayerId);
                const toIndex = nextOrder.indexOf(asset.id);
                if (fromIndex < 0 || toIndex < 0) {
                  setDraggingLayerId(null);
                  return;
                }
                const [moved] = nextOrder.splice(fromIndex, 1);
                nextOrder.splice(toIndex, 0, moved!);
                setLayerOrder(nextOrder);
                setDraggingLayerId(null);
              }}
              onDragEnd={() => {
                setDraggingLayerId(null);
              }}
              onClick={() => setSelectedAssetId(asset.id)}
            >
              {asset.thumbnailUrl || asset.objectUrl ? (
                <img
                  src={asset.thumbnailUrl ?? asset.objectUrl}
                  alt={asset.name}
                  className="h-9 w-9 rounded-md border border-white/10 object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-black/30">
                  <ImageIcon className="h-3.5 w-3.5 text-zinc-400" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-xs font-medium">{asset.name}</p>
                <p className="mt-0.5 text-[10px] text-zinc-500">Layer {orderedAssets.length - index}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="rounded-md border border-white/10 bg-black/20 p-1 text-zinc-300 transition hover:border-white/20 hover:bg-white/10"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setLayerVisibility(asset.id, !visible);
                  }}
                  aria-label={visible ? "Hide layer" : "Show layer"}
                >
                  {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    className="rounded-md border border-white/10 bg-black/20 p-0.5 text-zinc-300 transition hover:border-white/20 hover:bg-white/10 disabled:opacity-40"
                    disabled={index === 0}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      moveLayer(asset.id, "up");
                    }}
                    aria-label="Move layer up"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-white/10 bg-black/20 p-0.5 text-zinc-300 transition hover:border-white/20 hover:bg-white/10 disabled:opacity-40"
                    disabled={index >= orderedAssets.length - 1}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      moveLayer(asset.id, "down");
                    }}
                    aria-label="Move layer down"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="border-t border-white/10 p-3">
        <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">Layer Properties</p>

        <div className="space-y-3 rounded-xl border border-white/10 bg-[#0f1114]/70 p-3">
          <div>
            <p className="mb-1.5 text-xs text-zinc-300">Blend Mode</p>
            <Select
              value={currentBlendMode}
              disabled={!selectedAssetId}
              onValueChange={(next) => {
                if (!selectedAssetId) {
                  return;
                }
                setLayerBlendMode(selectedAssetId, next as EditorLayerBlendMode);
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
            disabled={!selectedAsset}
            value={currentOpacity}
            defaultValue={100}
            format={(value) => `${Math.round(value)}%`}
            onChange={(value) => {
              if (!selectedAsset) {
                return;
              }
              setLayerOpacity(selectedAsset.id, value);
            }}
            onCommit={(value) => {
              if (!selectedAsset) {
                return;
              }
              setLayerOpacity(selectedAsset.id, value);
            }}
            onReset={() => {
              if (!selectedAsset) {
                return;
              }
              setLayerOpacity(selectedAsset.id, 100);
            }}
          />
        </div>
      </div>
    </aside>
  );
}
