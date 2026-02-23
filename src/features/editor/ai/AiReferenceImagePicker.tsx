import { memo, useCallback, useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import type { ReferenceImage } from "./useAiEditSession";

interface AiReferenceImagePickerProps {
  images: ReferenceImage[];
  onAdd: (ref: ReferenceImage) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

export const AiReferenceImagePicker = memo(function AiReferenceImagePicker({
  images,
  onAdd,
  onRemove,
  disabled,
}: AiReferenceImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        if (images.length >= 3) break;

        try {
          const dataUrl = await fileToDataUrl(file, 640);
          const id = `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          onAdd({
            id,
            dataUrl,
            thumbnailUrl: dataUrl,
          });
        } catch {
          // skip invalid files
        }
      }

      // Reset input
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [images.length, onAdd]
  );

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="flex gap-2">
          {images.map((img) => (
            <div key={img.id} className="group relative">
              <img
                src={img.thumbnailUrl}
                alt="Reference"
                className="h-14 w-14 rounded-lg border border-white/10 object-cover"
              />
              <button
                type="button"
                onClick={() => onRemove(img.id)}
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500/90 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {images.length < 3 && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:border-white/25 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          添加参考图 ({images.length}/3)
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
});

async function fileToDataUrl(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context failed"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}
