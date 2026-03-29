import { ImagePlus, Trash2 } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { ReferenceImageType } from "@/types/imageGeneration";

export interface GuideInputAssetView {
  assetId: string;
  previewUrl: string | null;
  fileName?: string;
  guideType: ReferenceImageType;
  weight?: number;
}

interface ReferenceImagePickerProps {
  guideAssets: GuideInputAssetView[];
  maxImages: number;
  nativeCapacity?: number | null;
  capacityHint?: string | null;
  supportedTypes: ReferenceImageType[];
  supportsWeight: boolean;
  disabled?: boolean;
  onAddFiles: (files: FileList) => void;
  onUpdateImage: (
    assetId: string,
    patch: { guideType?: ReferenceImageType; weight?: number }
  ) => void;
  onRemoveImage: (assetId: string) => void;
  onClearImages: () => void;
}

export function ReferenceImagePicker({
  guideAssets,
  maxImages,
  nativeCapacity = null,
  capacityHint = null,
  supportedTypes,
  supportsWeight,
  disabled = false,
  onAddFiles,
  onUpdateImage,
  onRemoveImage,
  onClearImages,
}: ReferenceImagePickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-black/35 p-2.5">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
          Reference Images
        </Label>
        {guideAssets.length > 0 && (
          <button
            type="button"
            onClick={onClearImages}
            className="text-[11px] text-zinc-500 transition hover:text-zinc-200"
          >
            Clear
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files && event.target.files.length > 0) {
            onAddFiles(event.target.files);
          }
          event.target.value = "";
        }}
      />

      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-8 w-full text-xs"
        disabled={disabled || guideAssets.length >= maxImages}
        onClick={() => fileInputRef.current?.click()}
      >
        <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
        {nativeCapacity !== null
          ? `Add Reference (${guideAssets.length}/${nativeCapacity})`
          : "Add Reference"}
      </Button>

      {capacityHint ? (
        <p className="text-[11px] text-zinc-500">{capacityHint}</p>
      ) : guideAssets.length === 0 ? (
        <p className="text-[11px] text-zinc-500">
          Upload style/content reference images to guide composition.
        </p>
      ) : null}

      <div className="space-y-2">
        {guideAssets.map((entry) => (
          <div
            key={entry.assetId}
            className="grid grid-cols-[56px_minmax(0,1fr)] gap-2 rounded-lg border border-white/10 bg-black/35 p-2"
          >
            {entry.previewUrl ? (
              <img
                src={entry.previewUrl}
                alt={entry.fileName ?? "Reference image"}
                className="h-14 w-14 rounded-md object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-white/10 bg-black/30 text-[10px] text-zinc-500">
                Missing
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-1">
                <p className="truncate text-[11px] text-zinc-300">
                  {entry.fileName ?? entry.assetId}
                </p>
                <button
                  type="button"
                  className="text-zinc-500 transition hover:text-rose-200"
                  onClick={() => onRemoveImage(entry.assetId)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <Select
                value={entry.guideType}
                onValueChange={(value) =>
                  onUpdateImage(entry.assetId, {
                    guideType: value as ReferenceImageType,
                  })
                }
              >
                <SelectTrigger className="h-7 rounded-md text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedTypes.includes("content") ? (
                    <SelectItem value="content">Content</SelectItem>
                  ) : null}
                  {supportedTypes.includes("style") ? (
                    <SelectItem value="style">Style</SelectItem>
                  ) : null}
                  {supportedTypes.includes("controlnet") ? (
                    <SelectItem value="controlnet">ControlNet</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>

              {supportsWeight ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-zinc-500">
                    <span>Weight</span>
                    <span>{(entry.weight ?? 1).toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[entry.weight ?? 1]}
                    min={0}
                    max={1}
                    step={0.05}
                    onValueChange={(value) =>
                      onUpdateImage(entry.assetId, { weight: value[0] ?? 1 })
                    }
                  />
                </div>
              ) : (
                <p className="text-[10px] text-zinc-500">Current model uses fixed reference weight.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
