import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Plus,
  Trash2,
} from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { importAssetFiles } from "@/lib/assetImport";
import { cn } from "@/lib/utils";
import type { EditorLayerBlendMode } from "@/types";
import { useEditorLayerActions, useEditorSelectionState } from "../useEditorSlices";
import { LAYER_CATEGORIES, type LayerAsset, type LayerCategory } from "./layerCategories";

interface EditorLayerPopoverProps {
  className?: string;
}

type ViewMode = "layers" | "add";

export function EditorLayerPopover({ className }: EditorLayerPopoverProps) {
  const { assets, layers, selectedAsset, selectedLayerId, setSelectedLayerId } =
    useEditorSelectionState();
  const { addTextureLayer, reorderLayer, removeLayer, setLayerVisibility } =
    useEditorLayerActions();
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("layers");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  const categoriesWithUserAssets = useMemo(() => {
    const userAssets: LayerAsset[] = assets
      .filter((asset) => asset.id !== selectedAsset?.id)
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        thumbnailUrl: asset.thumbnailUrl ?? asset.objectUrl ?? "",
        fullUrl: asset.objectUrl ?? "",
        blendMode: "normal" as EditorLayerBlendMode,
        opacity: 100,
      }));

    return LAYER_CATEGORIES.map((category) =>
      category.id === "user" ? { ...category, assets: userAssets } : category
    );
  }, [assets, selectedAsset?.id]);

  const handleAddLayerAsset = (asset: LayerAsset) => {
    if (!selectedAsset) {
      return;
    }
    setUploadError(null);
    addTextureLayer(asset.id);
    setViewMode("layers");
  };

  const handleUploadFiles = async (files: FileList) => {
    if (!selectedAsset) {
      return;
    }

    setUploadError(null);

    const result = await importAssetFiles(files);
    const textureAssetIds = result.resolvedAssetIds.filter((assetId) => assetId !== selectedAsset.id);

    if (textureAssetIds.length > 0) {
      textureAssetIds.forEach((assetId) => addTextureLayer(assetId));
      setViewMode("layers");
      return;
    }

    if (result.errors[0]) {
      setUploadError(result.errors[0]);
      return;
    }

    if (result.skipped.unsupported > 0) {
      setUploadError("Only JPEG, PNG, WebP, TIFF, and AVIF images can be uploaded as layers.");
      return;
    }

    if (result.skipped.oversized > 0) {
      setUploadError("Layer uploads are limited to 50 MB per image.");
      return;
    }

    if (result.skipped.duplicated > 0) {
      setUploadError("That image is already in the library. Use the existing asset from the list.");
      return;
    }

    setUploadError("No image was added as a layer.");
  };

  const isExpanded = viewMode === "add";

  return (
    <aside
      className={cn(
        "flex flex-col bg-[#121214] transition-all duration-200 ease-out",
        isExpanded ? "w-[240px]" : "w-[80px]",
        className
      )}
    >
      {viewMode === "layers" ? (
        <>
          <div className="flex items-center justify-center px-2 py-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Layers</p>
          </div>

          <div className="flex justify-center p-3">
            <button
              type="button"
              className="flex h-14 w-14 items-center justify-center rounded-lg border border-white/15 bg-[#0f1114]/75 text-zinc-300 transition hover:border-white/25 hover:bg-[#1a1d22] hover:text-white disabled:opacity-50"
              onClick={() => setViewMode("add")}
              disabled={!selectedAsset}
              aria-label="Add layer"
            >
              <Plus className="h-6 w-6" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {layers.map((layer) => {
              const isSelected = layer.id === selectedLayerId;
              const isDragging = draggingLayerId === layer.id;
              const previewSrc =
                layer.type === "texture" && layer.textureAssetId
                  ? assetById.get(layer.textureAssetId)?.thumbnailUrl ??
                    assetById.get(layer.textureAssetId)?.objectUrl
                  : selectedAsset?.thumbnailUrl ?? selectedAsset?.objectUrl;

              return (
                <button
                  key={layer.id}
                  type="button"
                  draggable
                  className={cn(
                    "group relative flex h-[56px] w-full items-center justify-center overflow-hidden rounded-lg transition",
                    isSelected
                      ? "ring-2 ring-amber-400/80"
                      : "ring-1 ring-white/10 hover:ring-white/25",
                    isDragging && "opacity-50"
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
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-black/40">
                      <ImageIcon className="h-4 w-4 text-zinc-500" />
                    </div>
                  )}

                  <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/60 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      className="rounded p-1 text-zinc-300 transition hover:bg-white/20 hover:text-white"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setLayerVisibility(layer.id, !layer.visible);
                      }}
                      aria-label={layer.visible ? "Hide" : "Show"}
                    >
                      {layer.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    </button>
                    {layer.type !== "base" && layers.length > 1 && (
                      <button
                        type="button"
                        className="rounded p-1 text-rose-300 transition hover:bg-rose-500/30 hover:text-rose-200"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          removeLayer(layer.id);
                        }}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  <div className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 py-0.5 text-[8px] uppercase tracking-wide text-zinc-400">
                    {layer.type === "base" ? "B" : layer.type === "adjustment" ? "A" : "T"}
                  </div>
                </button>
              );
            })}

            {layers.length === 0 && (
              <div className="flex h-[56px] items-center justify-center rounded-lg border border-dashed border-white/10 text-[10px] text-zinc-500">
                No layers
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center px-3 py-2">
            <button
              type="button"
              className="flex items-center gap-1 text-[12px] text-zinc-300 transition hover:text-white"
              onClick={() => setViewMode("layers")}
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Layers</span>
            </button>
          </div>

          <div className="p-3">
            <UploadButton
              label="Upload Layer"
              variant="secondary"
              size="sm"
              className="h-9 w-full justify-center rounded-lg border-0 bg-zinc-800 px-3 text-[12px] text-zinc-200 hover:bg-zinc-700 hover:text-white"
              labelClassName="text-[12px]"
              onFiles={(files) => {
                void handleUploadFiles(files);
              }}
            />
            {uploadError ? <p className="mt-2 text-[11px] text-rose-300">{uploadError}</p> : null}
          </div>

          <div className="flex-1 overflow-y-auto">
            {categoriesWithUserAssets.map((category) => (
              <CategorySection
                key={category.id}
                category={category}
                onSelectAsset={handleAddLayerAsset}
                disabled={!selectedAsset}
              />
            ))}
          </div>

          <div className="p-3">
            <button
              type="button"
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 text-[12px] text-zinc-200 transition disabled:cursor-not-allowed disabled:opacity-50"
              disabled
              title="More layer sources are not available yet."
            >
              <Download className="h-4 w-4" />
              <span>More Sources</span>
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

interface CategorySectionProps {
  category: LayerCategory;
  onSelectAsset: (asset: LayerAsset) => void;
  disabled?: boolean;
}

function CategorySection({ category, onSelectAsset, disabled }: CategorySectionProps) {
  const [expanded, setExpanded] = useState(category.id === "user");
  const hasAssets = category.assets.length > 0;
  const displayAssets = category.assets.slice(0, 6);

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left transition hover:bg-white/5"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[12px] font-medium text-zinc-200">{category.name}</span>
        <div className="flex items-center gap-2">
          {category.showViewAll && hasAssets && (
            <span className="text-[11px] text-blue-400">View all</span>
          )}
          {expanded ? (
            <ChevronUp className="h-3 w-3 text-zinc-400" />
          ) : (
            <ChevronDown className="h-3 w-3 text-zinc-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          {hasAssets ? (
            <div className="grid grid-cols-3 gap-2">
              {displayAssets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  disabled={disabled}
                  className="group relative aspect-square overflow-hidden rounded-md bg-black/30 transition hover:ring-2 hover:ring-white/30 disabled:opacity-50"
                  onClick={() => onSelectAsset(asset)}
                  title={asset.name}
                >
                  <img
                    src={asset.thumbnailUrl}
                    alt={asset.name}
                    className="h-full w-full object-cover transition group-hover:scale-105"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          ) : (
            <p className="py-3 text-center text-[11px] text-zinc-500">
              {category.id === "user" ? "No imported assets yet." : "More assets coming soon."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
