import { memo, useState, useCallback } from "react";
import { Layers } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditorSection } from "@/features/editor/EditorSection";
import { SliderControl } from "@/features/editor/components/controls/SliderControl";
import { cn } from "@/lib/utils";
import type { EditorLayerBlendMode, EditorLayerDefinition, EditorLayerMaskMode } from "@/types";
import { LayerMaskTab } from "./LayerMaskTab";

type TabId = "properties" | "mask";

interface BlendModeOption {
  value: EditorLayerBlendMode;
  label: string;
}

const BLEND_MODE_OPTIONS: BlendModeOption[] = [
  { value: "normal", label: "Normal" },
  { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
  { value: "softLight", label: "Soft Light" },
];

interface LayerPropertiesPanelProps {
  layer: EditorLayerDefinition | null;
  isOpen: boolean;
  onToggle: () => void;
  onSetOpacity: (layerId: string, opacity: number) => void;
  onSetBlendMode: (layerId: string, blendMode: EditorLayerBlendMode) => void;
  onSetMaskMode: (layerId: string, mode: EditorLayerMaskMode) => void;
  onInvertMask: (layerId: string) => void;
  onClearMask: (layerId: string) => void;
  hasChanges?: boolean;
  changesVisible?: boolean;
  onToggleVisibility?: () => void;
  onResetChanges?: () => void;
}

export const LayerPropertiesPanel = memo(function LayerPropertiesPanel({
  layer,
  isOpen,
  onToggle,
  onSetOpacity,
  onSetBlendMode,
  onSetMaskMode,
  onInvertMask,
  onClearMask,
  hasChanges,
  changesVisible,
  onToggleVisibility,
  onResetChanges,
}: LayerPropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("properties");
  const [localOpacity, setLocalOpacity] = useState<number | null>(null);

  const handleOpacityChange = useCallback((value: number) => {
    setLocalOpacity(value);
  }, []);

  const handleOpacityCommit = useCallback((value: number) => {
    if (!layer) return;
    setLocalOpacity(null);
    onSetOpacity(layer.id, value);
  }, [layer, onSetOpacity]);

  const handleBlendModeChange = useCallback((value: string) => {
    if (!layer) return;
    onSetBlendMode(layer.id, value as EditorLayerBlendMode);
  }, [layer, onSetBlendMode]);

  const displayOpacity = localOpacity ?? layer?.opacity ?? 100;

  return (
    <EditorSection
      title="Layer Properties"
      isOpen={isOpen}
      onToggle={onToggle}
      icon={<Layers className="h-4 w-4" />}
      hasChanges={hasChanges}
      changesVisible={changesVisible}
      onToggleVisibility={onToggleVisibility}
      onResetChanges={onResetChanges}
    >
      {!layer ? (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs text-slate-500">
          Select a layer to edit properties.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-4 border-b border-white/10 text-xs">
            <button
              type="button"
              className={cn(
                "pb-2 transition",
                activeTab === "properties"
                  ? "border-b-2 border-white text-white"
                  : "text-slate-400 hover:text-slate-200"
              )}
              onClick={() => setActiveTab("properties")}
            >
              Properties
            </button>
            <button
              type="button"
              className={cn(
                "pb-2 transition",
                activeTab === "mask"
                  ? "border-b-2 border-white text-white"
                  : "text-slate-400 hover:text-slate-200"
              )}
              onClick={() => setActiveTab("mask")}
            >
              Mask
            </button>
          </div>

          {activeTab === "properties" ? (
            <div className="space-y-3">
              <SliderControl
                label="Opacity"
                value={displayOpacity}
                defaultValue={100}
                min={0}
                max={100}
                step={1}
                format={(value) => `${Math.round(value)}`}
                onChange={handleOpacityChange}
                onCommit={handleOpacityCommit}
              />

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">Blend Mode</label>
                <Select value={layer.blendMode} onValueChange={handleBlendModeChange}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BLEND_MODE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <LayerMaskTab
              layer={layer}
              onSetMaskMode={onSetMaskMode}
              onInvertMask={onInvertMask}
              onClearMask={onClearMask}
            />
          )}
        </div>
      )}
    </EditorSection>
  );
});
