import { memo, useCallback } from "react";
import { Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { presets as basePresets } from "@/data/presets";
import { cn } from "@/lib/utils";
import type { EditingAdjustments, Asset } from "@/types";

interface RecommendedPreset {
  preset: (typeof basePresets)[number];
  recommendation: { reason: string };
}

const QUICK_ADJUST_TOOLS = [
  { key: "exposure" as const, label: "曝光", min: -50, max: 50 },
  { key: "contrast" as const, label: "对比", min: -50, max: 50 },
  { key: "saturation" as const, label: "饱和", min: -50, max: 50 },
];

interface PresetSelectionCardProps {
  selectedAssetIds: string[];
  selectedPresetId: string;
  intensity: number;
  activeRecommendedTopPresets: RecommendedPreset[];
  customPresets: Array<{ id: string; name: string; description: string }>;
  activeAdjustments: EditingAdjustments | null | undefined;
  advancedOpen: boolean;
  customPresetName: string;
  previewAdjustments: EditingAdjustments | null | undefined;
  selectedGroup: string;
  assets: Asset[];
  targetSelection: string[];
  onApplyPreset: (presetId: string) => void;
  onIntensityChange: (value: number) => void;
  onUpdateAdjustmentValue: (key: keyof EditingAdjustments, value: number) => void;
  onApplyPresetToSelection: (assetIds: string[], presetId: string, intensity: number) => void;
  onApplyPresetToGroup: (group: string, presetId: string, intensity: number) => void;
  onSetAdvancedOpen: (fn: (prev: boolean) => boolean) => void;
  onSetCustomPresetName: (value: string) => void;
  onSaveCustomPreset: () => void;
}

export const PresetSelectionCard = memo(function PresetSelectionCard({
  selectedAssetIds,
  selectedPresetId,
  intensity,
  activeRecommendedTopPresets,
  customPresets,
  activeAdjustments,
  advancedOpen,
  customPresetName,
  previewAdjustments,
  selectedGroup,
  assets,
  targetSelection,
  onApplyPreset,
  onIntensityChange,
  onUpdateAdjustmentValue,
  onApplyPresetToSelection,
  onApplyPresetToGroup,
  onSetAdvancedOpen,
  onSetCustomPresetName,
  onSaveCustomPreset,
}: PresetSelectionCardProps) {
  const handleIntensitySlider = useCallback(
    (value: number[]) => onIntensityChange(value[0] ?? 0),
    [onIntensityChange]
  );

  const handleApplyToSelection = useCallback(() => {
    onApplyPresetToSelection(targetSelection, selectedPresetId, intensity);
  }, [onApplyPresetToSelection, targetSelection, selectedPresetId, intensity]);

  const handleApplyToGroup = useCallback(() => {
    if (selectedGroup !== "all") {
      onApplyPresetToGroup(selectedGroup, selectedPresetId, intensity);
    }
  }, [onApplyPresetToGroup, selectedGroup, selectedPresetId, intensity]);

  return (
    <>
      <Card className="animate-fade-up" style={{ animationDelay: "80ms" }}>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>风格包</CardTitle>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Layers className="h-4 w-4" />
            已选 {selectedAssetIds.length} 张
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeRecommendedTopPresets.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.24em] text-sky-200/80">
                AI 推荐（当前图片）
              </p>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {activeRecommendedTopPresets.map(({ preset, recommendation }, index) => {
                  const isActive = preset.id === selectedPresetId;
                  return (
                    <button
                      key={`${preset.id}-${index}`}
                      type="button"
                      onClick={() => onApplyPreset(preset.id)}
                      aria-label={`AI 推荐 ${index + 1}：${preset.name}`}
                      aria-pressed={isActive}
                      className={cn(
                        "min-w-[220px] rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-left transition",
                        isActive && "border-sky-200/40 bg-sky-300/10"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-slate-100">{preset.name}</p>
                        <Badge className="border-sky-200/30 bg-sky-300/20 text-sky-100">
                          推荐 {index + 1}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-slate-400 line-clamp-2">
                        {recommendation.reason}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3 overflow-x-auto pb-2">
            {basePresets.map((preset, index) => {
              const isActive = preset.id === selectedPresetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onApplyPreset(preset.id)}
                  aria-label={`风格包：${preset.name}`}
                  aria-pressed={isActive}
                  className={cn(
                    "min-w-[180px] rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-left transition",
                    isActive && "border-sky-200/40 bg-sky-300/10"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-100">{preset.name}</p>
                    {index === 0 && (
                      <Badge className="border-sky-200/30 bg-sky-300/20 text-sky-200">推荐</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-400 line-clamp-2">{preset.description}</p>
                </button>
              );
            })}
          </div>

          {customPresets.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">自定义风格</p>
              <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
                {customPresets.map((preset) => {
                  const isActive = preset.id === selectedPresetId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onApplyPreset(preset.id)}
                      aria-label={`自定义风格：${preset.name}`}
                      aria-pressed={isActive}
                      className={cn(
                        "min-w-[180px] rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-left transition",
                        isActive && "border-emerald-200/40 bg-emerald-300/10"
                      )}
                    >
                      <p className="font-medium text-slate-100">{preset.name}</p>
                      <p className="mt-2 text-xs text-slate-400 line-clamp-2">
                        {preset.description}
                      </p>
                      <Badge className="mt-3 border-emerald-200/30 bg-emerald-300/10 text-emerald-200">
                        自定义
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="text-slate-300">风格强度</span>
              <span>{intensity}</span>
            </div>
            <Slider
              value={[intensity]}
              min={0}
              max={100}
              step={1}
              onValueChange={handleIntensitySlider}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleApplyToSelection} disabled={assets.length === 0}>
              应用到已选
            </Button>
            <Button
              variant="secondary"
              onClick={handleApplyToGroup}
              disabled={selectedGroup === "all"}
            >
              应用到当前分组
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="animate-fade-up" style={{ animationDelay: "120ms" }}>
          <CardHeader>
            <CardTitle>快速微调</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeAdjustments ? (
              QUICK_ADJUST_TOOLS.map((tool) => {
                const currentValue = activeAdjustments[tool.key];
                return (
                  <div
                    key={tool.key}
                    className="rounded-2xl border border-white/10 bg-slate-950/60 p-3"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="text-slate-300">{tool.label}</span>
                      <span>{currentValue}</span>
                    </div>
                    <Slider
                      value={[currentValue]}
                      min={tool.min}
                      max={tool.max}
                      step={1}
                      onValueChange={(value) => onUpdateAdjustmentValue(tool.key, value[0] ?? 0)}
                    />
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-400">请选择素材后再微调。</p>
            )}
          </CardContent>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: "160ms" }}>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>进阶预设</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => onSetAdvancedOpen((prev) => !prev)}>
              {advancedOpen ? "收起" : "展开"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {advancedOpen ? (
              <>
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="text-slate-300">色温</span>
                    <span>{activeAdjustments?.temperature ?? 0}</span>
                  </div>
                  <Slider
                    value={[activeAdjustments?.temperature ?? 0]}
                    min={-50}
                    max={50}
                    step={1}
                    onValueChange={(value) => onUpdateAdjustmentValue("temperature", value[0] ?? 0)}
                  />
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="text-slate-300">颗粒</span>
                    <span>{activeAdjustments?.grain ?? 0}</span>
                  </div>
                  <Slider
                    value={[activeAdjustments?.grain ?? 0]}
                    min={0}
                    max={40}
                    step={1}
                    onValueChange={(value) => onUpdateAdjustmentValue("grain", value[0] ?? 0)}
                  />
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="text-slate-300">暗角</span>
                    <span>{activeAdjustments?.vignette ?? 0}</span>
                  </div>
                  <Slider
                    value={[activeAdjustments?.vignette ?? 0]}
                    min={-40}
                    max={40}
                    step={1}
                    onValueChange={(value) => onUpdateAdjustmentValue("vignette", value[0] ?? 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">保存为自定义风格</Label>
                  <Input
                    value={customPresetName}
                    onChange={(event) => onSetCustomPresetName(event.target.value)}
                    placeholder="输入风格名称"
                  />
                  <Button
                    className="w-full"
                    onClick={onSaveCustomPreset}
                    disabled={!customPresetName.trim() || !previewAdjustments}
                  >
                    保存风格
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">进阶玩家可保存自定义风格包并重复使用。</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
});
