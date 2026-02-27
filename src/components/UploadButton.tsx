import { Upload } from "lucide-react";
import { useAssetStore } from "@/stores/assetStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface UploadButtonProps {
  label?: string;
  className?: string;
  labelClassName?: string;
  variant?: "default" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  compact?: boolean;
  onFiles: (files: FileList) => void;
}

export function UploadButton({
  label = "Import Assets",
  className,
  labelClassName,
  variant = "default",
  size = "default",
  compact = false,
  onFiles,
}: UploadButtonProps) {
  const isImporting = useAssetStore((state) => state.isImporting);

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
          {isImporting ? "Importing..." : label}
        </span>
        <Input
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            if (event.target.files && event.target.files.length > 0) {
              onFiles(event.target.files);
            }
            event.currentTarget.value = "";
          }}
        />
      </Label>
    </Button>
  );
}
