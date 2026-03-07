import { ImagePlus, Trash2 } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { ReferenceImage } from "@/types/imageGeneration";

interface ReferenceImagePickerProps {
  referenceImages: ReferenceImage[];
  disabled?: boolean;
  onAddFiles: (files: FileList) => void;
  onUpdateImage: (id: string, patch: Partial<ReferenceImage>) => void;
  onRemoveImage: (id: string) => void;
  onClearImages: () => void;
}

export function ReferenceImagePicker({
  referenceImages,
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
        {referenceImages.length > 0 && (
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
        disabled={disabled || referenceImages.length >= 4}
        onClick={() => fileInputRef.current?.click()}
      >
        <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
        Add Reference ({referenceImages.length}/4)
      </Button>

      {referenceImages.length === 0 && (
        <p className="text-[11px] text-zinc-500">
          Upload style/content reference images to guide composition.
        </p>
      )}

      <div className="space-y-2">
        {referenceImages.map((entry) => (
          <div
            key={entry.id}
            className="grid grid-cols-[56px_minmax(0,1fr)] gap-2 rounded-lg border border-white/10 bg-black/35 p-2"
          >
            <img
              src={entry.url}
              alt={entry.fileName ?? "Reference image"}
              className="h-14 w-14 rounded-md object-cover"
            />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-1">
                <p className="truncate text-[11px] text-zinc-300">
                  {entry.fileName ?? "reference"}
                </p>
                <button
                  type="button"
                  className="text-zinc-500 transition hover:text-rose-200"
                  onClick={() => onRemoveImage(entry.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <Select
                value={entry.type}
                onValueChange={(value) =>
                  onUpdateImage(entry.id, {
                    type: value as ReferenceImage["type"],
                  })
                }
              >
                <SelectTrigger className="h-7 rounded-md text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="content">Content</SelectItem>
                  <SelectItem value="style">Style</SelectItem>
                  <SelectItem value="controlnet">ControlNet</SelectItem>
                </SelectContent>
              </Select>

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
                    onUpdateImage(entry.id, { weight: value[0] ?? 1 })
                  }
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
