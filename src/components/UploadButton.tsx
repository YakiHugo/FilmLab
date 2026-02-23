import { useCallback } from "react";
import { Upload } from "lucide-react";
import { useProjectStore, type AddAssetsResult } from "@/stores/projectStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

const isSupportedImageFile = (file: File) => {
  if (ACCEPTED_TYPES.has(file.type)) {
    return true;
  }
  // Fall back to extension check when MIME type is missing or generic
  return ACCEPTED_EXTENSIONS.test(file.name);
};

interface UploadButtonProps {
  label?: string;
  className?: string;
  labelClassName?: string;
  variant?: "default" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  compact?: boolean;
  onImportResult?: (result: AddAssetsResult) => void;
}

export function UploadButton({
  label = "导入素材",
  className,
  labelClassName,
  variant = "default",
  size = "default",
  compact = false,
  onImportResult,
}: UploadButtonProps) {
  const addAssets = useProjectStore((state) => state.addAssets);
  const isImporting = useProjectStore((state) => state.isImporting);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const filtered = Array.from(files).filter((file) => isSupportedImageFile(file));
      if (filtered.length === 0) return;
      void addAssets(filtered).then((result) => {
        onImportResult?.(result);
      });
    },
    [addAssets, onImportResult]
  );

  return (
    <Button
      variant={variant}
      size={size}
      className={cn("gap-2", isImporting && "pointer-events-none opacity-70", className)}
      asChild
    >
      <Label className="flex cursor-pointer items-center gap-2" aria-busy={isImporting}>
        <Upload className="h-4 w-4" />
        <span className={cn(compact ? "sr-only sm:not-sr-only" : "", labelClassName)}>
          {isImporting ? "导入中..." : label}
        </span>
        <Input
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
      </Label>
    </Button>
  );
}
