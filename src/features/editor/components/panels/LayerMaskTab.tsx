import { memo, type ReactNode } from "react";
import { Circle, Paintbrush, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EditorLayerDefinition, EditorLayerMaskMode } from "@/types";

interface LayerMaskTabProps {
  layer: EditorLayerDefinition;
  onSetMaskMode: (layerId: string, mode: EditorLayerMaskMode) => void;
  onInvertMask: (layerId: string) => void;
  onClearMask: (layerId: string) => void;
}

interface MaskTool {
  id: EditorLayerMaskMode;
  label: string;
  icon: ReactNode;
}

const MASK_TOOLS: MaskTool[] = [
  { id: "brush", label: "Brush", icon: <Paintbrush className="h-4 w-4" /> },
  { id: "linear", label: "Linear Gradient", icon: <Square className="h-4 w-4" /> },
  { id: "radial", label: "Radial Gradient", icon: <Circle className="h-4 w-4" /> },
];

export const LayerMaskTab = memo(function LayerMaskTab({
  layer,
  onSetMaskMode,
  onInvertMask,
  onClearMask,
}: LayerMaskTabProps) {
  const activeMaskMode = layer.mask?.mode ?? null;
  const hasMask = Boolean(layer.mask);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {MASK_TOOLS.map((tool) => {
          const isActive = activeMaskMode === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              )}
              onClick={() => onSetMaskMode(layer.id, tool.id)}
            >
              {tool.icon}
              <span>{tool.label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="flex-1 text-xs"
          onClick={() => onInvertMask(layer.id)}
          disabled={!hasMask}
        >
          {layer.mask?.inverted ? "Restore" : "Invert"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="flex-1 text-xs"
          onClick={() => onClearMask(layer.id)}
          disabled={!hasMask}
        >
          Clear
        </Button>
      </div>
    </div>
  );
});
