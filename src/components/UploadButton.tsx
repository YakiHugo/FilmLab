import { useRef } from "react";
import { Upload } from "lucide-react";
import { useAssetStore } from "@/stores/assetStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface UploadButtonProps {
  label?: string;
  className?: string;
  labelClassName?: string;
  variant?: "default" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  compact?: boolean;
  disabled?: boolean;
  onFiles: (files: FileList) => void;
}

export function UploadButton({
  label = "Import Assets",
  className,
  labelClassName,
  variant = "default",
  size = "default",
  compact = false,
  disabled = false,
  onFiles,
}: UploadButtonProps) {
  const isImporting = useAssetStore((state) => state.isImporting);
  const isDisabled = disabled || isImporting;
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={isDisabled}
        className={cn("gap-2", isDisabled && "opacity-70", className)}
        aria-busy={isImporting}
        onClick={() => {
          inputRef.current?.click();
        }}
      >
        <Upload className="h-4 w-4" />
        <span className={cn(compact ? "sr-only sm:not-sr-only" : "", labelClassName)}>
          {isImporting ? "Importing..." : label}
        </span>
      </Button>
      <Input
        ref={inputRef}
        type="file"
        multiple
        disabled={isDisabled}
        accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,.avif,image/jpeg,image/png,image/webp,image/tiff,image/avif"
        className="hidden"
        onChange={(event) => {
          if (event.target.files && event.target.files.length > 0) {
            onFiles(event.target.files);
          }
          event.currentTarget.value = "";
        }}
      />
    </>
  );
}
