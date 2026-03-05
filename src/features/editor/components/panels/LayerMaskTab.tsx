import { memo, type ReactNode } from "react";
import { Circle, Paintbrush, Pipette, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

const AI_MASK_TOOLS: Array<{ id: string; label: string; badge?: string }> = [
  { id: "ai-mask", label: "AI Mask", badge: "AI" },
  { id: "ai-object", label: "AI Object Select", badge: "AI" },
  { id: "portrait-bg", label: "Portrait Background" },
  { id: "ai-bg-remove", label: "AI Background Remove", badge: "AI" },
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

      <div className="h-px bg-white/10" />

      <div className="space-y-1">
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition",
            activeMaskMode === "luminosity"
              ? "bg-white/10 text-white"
              : "text-slate-300 hover:bg-white/5 hover:text-white"
          )}
          onClick={() => onSetMaskMode(layer.id, "luminosity")}
        >
          <Pipette className="h-4 w-4" />
          <span>Color Range</span>
        </button>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition",
            activeMaskMode === "luminosity"
              ? "bg-white/10 text-white"
              : "text-slate-300 hover:bg-white/5 hover:text-white"
          )}
          onClick={() => onSetMaskMode(layer.id, "luminosity")}
        >
          <Pipette className="h-4 w-4" />
          <span>Luma Range</span>
        </button>
      </div>

      <div className="h-px bg-white/10" />

      <div className="space-y-1">
        {AI_MASK_TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white disabled:opacity-60"
            disabled
          >
            <span>{tool.label}</span>
            {tool.badge ? (
              <Badge
                size="control"
                className="bg-fuchsia-500/20 px-1.5 text-[10px] text-fuchsia-300"
              >
                {tool.badge}
              </Badge>
            ) : null}
          </button>
        ))}
      </div>

      <div className="h-px bg-white/10" />

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
