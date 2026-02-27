import { UploadCloud } from "lucide-react";
import { useState } from "react";
import { UploadButton } from "@/components/UploadButton";
import { cn } from "@/lib/utils";

interface ImportDropZoneProps {
  isImporting: boolean;
  onImport: (files: FileList) => void;
}

export function ImportDropZone({ isImporting, onImport }: ImportDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed p-6 text-center transition",
        isDragging
          ? "border-sky-400 bg-sky-400/10 shadow-[inset_0_0_40px_rgba(56,189,248,0.1)]"
          : "border-white/15 bg-black/35"
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        onImport(event.dataTransfer.files);
      }}
    >
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-zinc-100">
        <UploadCloud className="h-5 w-5" />
      </div>
      <p className="text-sm text-zinc-200">Drop images to import into Library</p>
      <p className="mt-1 text-xs text-zinc-500">{isImporting ? "Importing..." : "JPG, PNG, WebP supported"}</p>
      <UploadButton
        label="Choose Files"
        size="sm"
        className="mt-3 rounded-xl border border-white/10 bg-black/45"
        onFiles={onImport}
      />
    </div>
  );
}
