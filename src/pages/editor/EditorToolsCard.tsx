import { useMemo, useState } from "react";
import type { Asset, EditingAdjustments } from "@/types";
import { presets } from "@/data/presets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import {
  ASPECT_RATIOS,
  DEFAULT_TOOL_BY_GROUP,
  TOOL_DEFINITIONS,
  TOOL_GROUPS,
} from "./constants";
import type { NumericAdjustmentKey, ToolGroupId } from "./types";

interface EditorToolsCardProps {
  selectedAsset: Asset | null;
  adjustments: EditingAdjustments | null;
  onUpdateAdjustments: (partial: Partial<EditingAdjustments>) => void;
  onUpdateAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void;
  onSelectPreset: (presetId: string) => void;
  onSetIntensity: (value: number) => void;
  onResetTool: (toolId: NumericAdjustmentKey | null) => void;
}

export function EditorToolsCard({
  selectedAsset,
  adjustments,
  onUpdateAdjustments,
  onUpdateAdjustmentValue,
  onSelectPreset,
  onSetIntensity,
  onResetTool,
}: EditorToolsCardProps) {
  const [activeGroup, setActiveGroup] = useState<ToolGroupId>("adjust");
  const [toolSelection, setToolSelection] = useState<
    Record<ToolGroupId, NumericAdjustmentKey | null>
  >({
    filter: null,
    adjust: DEFAULT_TOOL_BY_GROUP.adjust,
    color: DEFAULT_TOOL_BY_GROUP.color,
    effects: DEFAULT_TOOL_BY_GROUP.effects,
    detail: DEFAULT_TOOL_BY_GROUP.detail,
    crop: DEFAULT_TOOL_BY_GROUP.crop,
  });
  const fallbackPresetId = presets[0]?.id ?? "";

  const activeTool = useMemo(() => {
    if (activeGroup === "filter") {
      return null;
    }
    const tools = TOOL_DEFINITIONS[activeGroup];
    const current = toolSelection[activeGroup];
    return tools.find((tool) => tool.id === current) ?? tools[0];
  }, [activeGroup, toolSelection]);

  const activeToolValue = useMemo(() => {
    if (!adjustments || !activeTool) {
      return 0;
    }
    return adjustments[activeTool.id];
  }, [activeTool, adjustments]);

  const handleSelectTool = (toolId: NumericAdjustmentKey) => {
    setToolSelection((prev) => ({
      ...prev,
      [activeGroup]: toolId,
    }));
  };

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>编辑工具</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        {selectedAsset && adjustments ? (
          <>
            <div className="flex w-full min-w-0 gap-2 overflow-x-auto pb-2 md:pb-1">
              {TOOL_GROUPS.map((group) => (
                <Button
                  key={group.id}
                  size="sm"
                  variant={activeGroup === group.id ? "default" : "secondary"}
                  className="shrink-0"
                  onClick={() => setActiveGroup(group.id)}
                >
                  {group.label}
                </Button>
              ))}
            </div>

            {activeGroup === "filter" ? (
              <div className="space-y-3">
                <div className="flex w-full min-w-0 gap-2 overflow-x-auto pb-2 md:pb-1">
                  {presets.map((preset) => (
                    <Button
                      key={preset.id}
                      size="sm"
                      variant={
                        (selectedAsset.presetId ?? fallbackPresetId) === preset.id
                          ? "default"
                          : "secondary"
                      }
                      className="shrink-0"
                      onClick={() => onSelectPreset(preset.id)}
                    >
                      {preset.name}
                    </Button>
                  ))}
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="text-slate-300">强度</span>
                    <span>{selectedAsset.intensity ?? 0}</span>
                  </div>
                  <Slider
                    value={[selectedAsset.intensity ?? 0]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={(value) => onSetIntensity(value[0] ?? 0)}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="flex w-full min-w-0 gap-2 overflow-x-auto pb-2 md:pb-1">
                  {TOOL_DEFINITIONS[activeGroup].map((tool) => (
                    <Button
                      key={tool.id}
                      size="sm"
                      variant={activeTool?.id === tool.id ? "default" : "secondary"}
                      className="shrink-0"
                      onClick={() => handleSelectTool(tool.id)}
                    >
                      {tool.label}
                    </Button>
                  ))}
                </div>

                {activeGroup === "crop" && (
                  <div className="flex w-full min-w-0 gap-2 overflow-x-auto pb-2 md:pb-1">
                    {ASPECT_RATIOS.map((ratio) => (
                      <Button
                        key={ratio.value}
                        size="sm"
                        variant={
                          adjustments.aspectRatio === ratio.value ? "default" : "secondary"
                        }
                        className="shrink-0"
                        onClick={() => onUpdateAdjustments({ aspectRatio: ratio.value })}
                      >
                        {ratio.label}
                      </Button>
                    ))}
                  </div>
                )}

                {activeTool && (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="text-slate-300">{activeTool.label}</span>
                      <span>
                        {activeTool.format
                          ? activeTool.format(activeToolValue)
                          : activeToolValue}
                      </span>
                    </div>
                    <Slider
                      value={[activeToolValue]}
                      min={activeTool.min}
                      max={activeTool.max}
                      step={activeTool.step ?? 1}
                      onValueChange={(value) =>
                        onUpdateAdjustmentValue(activeTool.id, value[0] ?? 0)
                      }
                    />
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onResetTool(activeTool?.id ?? null)}
                    disabled={!activeTool}
                  >
                    重置当前
                  </Button>
                </div>
              </>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-400">请选择一张照片以查看参数。</p>
        )}
      </CardContent>
    </Card>
  );
}
