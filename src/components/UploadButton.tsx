import { useCallback } from "react";
import { Upload } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = ["image/jpeg", "image/png"];

interface UploadButtonProps {
  label?: string;
  className?: string;
  labelClassName?: string;
  variant?: "default" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  compact?: boolean;
}

export function UploadButton({
  label = "导入素材",
  className,
  labelClassName,
  variant = "default",
  size = "default",
  compact = false,
}: UploadButtonProps) {
  const addAssets = useProjectStore((state) => state.addAssets);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const filtered = Array.from(files).filter((file) =>
        ACCEPTED_TYPES.includes(file.type)
      );
      if (filtered.length === 0) return;
      void addAssets(filtered);
    },
    [addAssets]
  );

  return (
    <Button
      variant={variant}
      size={size}
      className={cn("gap-2", className)}
      asChild
    >
      <Label className="flex cursor-pointer items-center gap-2">
        <Upload className="h-4 w-4" />
        <span
          className={cn(
            compact ? "sr-only sm:not-sr-only" : "",
            labelClassName
          )}
        >
          {label}
        </span>
        <Input
          type="file"
          multiple
          accept="image/png,image/jpeg"
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
