import { memo, useRef, type ChangeEventHandler } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { featureFlags } from "@/lib/features";
import { cn } from "@/lib/utils";
import type {
  EditingAdjustments,
  FilmModuleId,
  FilmSeedMode,
} from "@/types";
import { ASPECT_RATIOS } from "./constants";
import { EditorSection } from "./EditorSection";
import { EditorSliderRow } from "./EditorSliderRow";
import {
  AI_FEATURES,
  BASIC_COLOR_SLIDERS,
  BASIC_LIGHT_SLIDERS,
  CROP_SLIDERS,
  CURVE_CHANNELS,
  CURVE_SLIDERS,
  DETAIL_SLIDERS,
  EFFECTS_SLIDERS,
  HSL_COLORS,
  type SliderDefinition,
} from "./editorPanelConfig";
import type { NumericAdjustmentKey } from "./types";
import { useEditorState } from "./useEditorState";

interface FilmParamDefinition {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

const FILM_MODULE_LABELS: Record<FilmModuleId, string> = {
  colorScience: "色彩科学",
  tone: "影调",
  scan: "冲扫",
  grain: "颗粒",
  defects: "瑕疵",
};

const FILM_SEED_MODE_LABELS: Record<FilmSeedMode, string> = {
  perAsset: "跟随素材",
  perRender: "每次渲染",
  perExport: "每次导出",
  locked: "锁定",
};

const FILM_PARAM_DEFINITIONS: Record<FilmModuleId, FilmParamDefinition[]> = {
  colorScience: [
    { key: "lutStrength", label: "LUT 强度", min: 0, max: 1, step: 0.01 },
    { key: "temperatureShift", label: "色温偏移", min: -100, max: 100, step: 1 },
    { key: "tintShift", label: "色调偏移", min: -100, max: 100, step: 1 },
  ],
  tone: [
    { key: "exposure", label: "曝光", min: -100, max: 100, step: 1 },
    { key: "contrast", label: "对比度", min: -100, max: 100, step: 1 },
    { key: "highlights", label: "高光", min: -100, max: 100, step: 1 },
    { key: "shadows", label: "阴影", min: -100, max: 100, step: 1 },
    { key: "whites", label: "白场", min: -100, max: 100, step: 1 },
    { key: "blacks", label: "黑场", min: -100, max: 100, step: 1 },
    { key: "curveLights", label: "中高曲线", min: -100, max: 100, step: 1 },
    { key: "curveDarks", label: "中低曲线", min: -100, max: 100, step: 1 },
    { key: "curveHighlights", label: "高光曲线", min: -100, max: 100, step: 1 },
    { key: "curveShadows", label: "阴影曲线", min: -100, max: 100, step: 1 },
  ],
  scan: [
    { key: "halationThreshold", label: "光晕阈值", min: 0.5, max: 1, step: 0.01 },
    { key: "halationAmount", label: "光晕强度", min: 0, max: 1, step: 0.01 },
    { key: "bloomThreshold", label: "泛光阈值", min: 0.4, max: 1, step: 0.01 },
    { key: "bloomAmount", label: "泛光强度", min: 0, max: 1, step: 0.01 },
    { key: "vignetteAmount", label: "暗角", min: -1, max: 1, step: 0.01 },
    { key: "scanWarmth", label: "冲扫暖色", min: -100, max: 100, step: 1 },
  ],
  grain: [
    { key: "amount", label: "强度", min: 0, max: 1, step: 0.01 },
    { key: "size", label: "大小", min: 0, max: 1, step: 0.01 },
    { key: "roughness", label: "粗糙度", min: 0, max: 1, step: 0.01 },
    { key: "color", label: "彩色噪点", min: 0, max: 1, step: 0.01 },
    { key: "shadowBoost", label: "暗部增强", min: 0, max: 1, step: 0.01 },
  ],
  defects: [
    { key: "leakProbability", label: "漏光概率", min: 0, max: 1, step: 0.01 },
    { key: "leakStrength", label: "漏光强度", min: 0, max: 1, step: 0.01 },
    { key: "dustAmount", label: "灰尘", min: 0, max: 1, step: 0.01 },
    { key: "scratchAmount", label: "划痕", min: 0, max: 1, step: 0.01 },
  ],
};

const renderSliderRows = (
  adjustments: EditingAdjustments,
  sliders: SliderDefinition[],
  onUpdateAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void
) =>
  sliders.map((slider) => (
    <EditorSliderRow
      key={slider.key}
      label={slider.label}
      value={adjustments[slider.key] as number}
      min={slider.min}
      max={slider.max}
      step={slider.step}
      format={slider.format}
      onChange={(value) => onUpdateAdjustmentValue(slider.key, value)}
    />
  ));

const formatFilmValue = (value: number, step: number) => {
  if (step < 1) {
    return value.toFixed(2);
  }
  return `${Math.round(value)}`;
};

export const EditorAdjustmentPanel = memo(function EditorAdjustmentPanel() {
  const {
    adjustments,
    previewFilmProfile: filmProfile,
    lutAssets,
    seedSalt,
    activeHslColor,
    curveChannel,
    openSections,
    setActiveHslColor,
    setCurveChannel,
    toggleSection,
    updateAdjustments,
    updateAdjustmentValue,
    updateHslValue,
    toggleFlip,
    handleSetFilmModuleAmount,
    handleToggleFilmModule,
    handleSetFilmModuleParam,
    handleSetFilmModuleRgbMix,
    handleSetFilmModuleSeedMode,
    handleSetFilmModuleSeed,
    handleRefreshFilmSeed,
    handleSetFilmModuleLutAsset,
    handleImportLutAsset,
    handleResetFilmOverrides,
  } = useEditorState();
  const lutImportRef = useRef<HTMLInputElement | null>(null);
  const handleImportLutFile: ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.currentTarget.files?.[0] ?? null;
    void handleImportLutAsset(file);
    event.currentTarget.value = "";
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>编辑说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-slate-300">
          <p>预览会实时更新。</p>
          <p>胶片模块与基础调节参数解耦。</p>
          <p>建议先调模块强度，再微调细节滑杆。</p>
        </CardContent>
      </Card>

      {!adjustments ? (
        <Card>
          <CardContent className="p-4 text-sm text-slate-400">
            请先选择一张素材开始编辑。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <EditorSection
            title="胶片模块"
            hint="色彩科学 / 影调 / 冲扫 / 颗粒 / 瑕疵"
            isOpen={openSections.film}
            onToggle={() => toggleSection("film")}
          >
            {!filmProfile ? (
              <p className="text-xs text-slate-500">当前无可用胶片档案。</p>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" variant="secondary" onClick={handleResetFilmOverrides}>
                    重置模块覆盖
                  </Button>
                </div>
                {featureFlags.enableSeedUi && (
                  <p className="text-[11px] text-slate-500">当前素材 seed salt：{seedSalt}</p>
                )}
                {filmProfile.modules.map((module) => (
                  <div
                    key={module.id}
                    className="rounded-2xl border border-white/10 bg-slate-950/60 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium text-slate-100">
                          {FILM_MODULE_LABELS[module.id]}
                        </p>
                        <Badge className="border-white/10 bg-white/5 text-[10px] text-slate-300">
                          {module.enabled ? "开启" : "关闭"}
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant={module.enabled ? "default" : "secondary"}
                        onClick={() => handleToggleFilmModule(module.id)}
                      >
                        {module.enabled ? "关闭" : "启用"}
                      </Button>
                    </div>

                    <EditorSliderRow
                      label="模块强度"
                      value={module.amount}
                      min={0}
                      max={100}
                      step={1}
                      onChange={(value) => handleSetFilmModuleAmount(module.id, value)}
                    />
                    {featureFlags.enableSeedUi && (
                      <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-2">
                        <p className="text-[11px] text-slate-400">随机种子</p>
                        <Select
                          value={module.seedMode ?? "perAsset"}
                          onValueChange={(value) =>
                            handleSetFilmModuleSeedMode(module.id, value as FilmSeedMode)
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="选择 seed 策略" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(FILM_SEED_MODE_LABELS).map(([mode, label]) => (
                              <SelectItem key={mode} value={mode}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleRefreshFilmSeed(module.id)}
                          >
                            刷新 seed
                          </Button>
                          {module.seedMode === "locked" && (
                            <input
                              type="number"
                              value={module.seed ?? 0}
                              onChange={(event) =>
                                handleSetFilmModuleSeed(
                                  module.id,
                                  Number(event.target.value) || 0
                                )
                              }
                              className="h-8 w-full rounded-md border border-white/20 bg-slate-950 px-2 text-xs text-slate-100"
                            />
                          )}
                        </div>
                      </div>
                    )}

                    {FILM_PARAM_DEFINITIONS[module.id].map((param) => {
                      const rawValue = (module.params as unknown as Record<string, unknown>)[
                        param.key
                      ];
                      if (typeof rawValue !== "number") {
                        return null;
                      }
                      return (
                        <EditorSliderRow
                          key={`${module.id}-${param.key}`}
                          label={param.label}
                          value={rawValue}
                          min={param.min}
                          max={param.max}
                          step={param.step}
                          format={(value) => formatFilmValue(value, param.step)}
                          onChange={(value) =>
                            handleSetFilmModuleParam(module.id, param.key, value)
                          }
                        />
                      );
                    })}
                    {module.id === "colorScience" &&
                      Array.isArray(module.params.rgbMix) &&
                      module.params.rgbMix.length === 3 && (
                        <>
                          {featureFlags.enableCubeLut && (
                            <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-2">
                              <p className="text-[11px] text-slate-400">3D LUT</p>
                              <Select
                                value={module.params.lutAssetId ?? "__none__"}
                                onValueChange={(value) =>
                                  handleSetFilmModuleLutAsset(
                                    module.id,
                                    value === "__none__" ? undefined : value
                                  )
                                }
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue placeholder="选择 LUT 资产" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">不使用 LUT（回退旧算法）</SelectItem>
                                  {lutAssets.map((asset) => (
                                    <SelectItem key={asset.id} value={asset.id}>
                                      {asset.name} ({asset.size}³)
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => lutImportRef.current?.click()}
                                >
                                  导入 .cube
                                </Button>
                                <input
                                  ref={lutImportRef}
                                  type="file"
                                  accept=".cube,text/plain"
                                  className="hidden"
                                  onChange={handleImportLutFile}
                                />
                              </div>
                            </div>
                          )}
                          <EditorSliderRow
                            label="R 通道混合"
                            value={module.params.rgbMix[0]}
                            min={0.5}
                            max={1.5}
                            step={0.01}
                            format={(value) => value.toFixed(2)}
                            onChange={(value) =>
                              handleSetFilmModuleRgbMix(module.id, 0, value)
                            }
                          />
                          <EditorSliderRow
                            label="G 通道混合"
                            value={module.params.rgbMix[1]}
                            min={0.5}
                            max={1.5}
                            step={0.01}
                            format={(value) => value.toFixed(2)}
                            onChange={(value) =>
                              handleSetFilmModuleRgbMix(module.id, 1, value)
                            }
                          />
                          <EditorSliderRow
                            label="B 通道混合"
                            value={module.params.rgbMix[2]}
                            min={0.5}
                            max={1.5}
                            step={0.01}
                            format={(value) => value.toFixed(2)}
                            onChange={(value) =>
                              handleSetFilmModuleRgbMix(module.id, 2, value)
                            }
                          />
                        </>
                      )}
                  </div>
                ))}
              </div>
            )}
          </EditorSection>

          <EditorSection
            title="基础调节"
            hint="光线与色彩"
            isOpen={openSections.basic}
            onToggle={() => toggleSection("basic")}
          >
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">光线</p>
              {renderSliderRows(adjustments, BASIC_LIGHT_SLIDERS, updateAdjustmentValue)}
              <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-500">色彩</p>
              {renderSliderRows(adjustments, BASIC_COLOR_SLIDERS, updateAdjustmentValue)}
            </div>
          </EditorSection>

          <EditorSection
            title="HSL"
            hint="色相 / 饱和 / 明度"
            isOpen={openSections.hsl}
            onToggle={() => toggleSection("hsl")}
          >
            <div className="flex flex-wrap gap-2">
              {HSL_COLORS.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => setActiveHslColor(color.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs",
                    activeHslColor === color.id ? "bg-white/10 text-white" : "text-slate-300"
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", color.swatch)} />
                  {color.label}
                </button>
              ))}
            </div>
            <EditorSliderRow
              label="色相"
              value={adjustments.hsl[activeHslColor].hue}
              min={-100}
              max={100}
              format={(value) => (value > 0 ? `+${value}` : `${value}`)}
              onChange={(value) => updateHslValue(activeHslColor, "hue", value)}
            />
            <EditorSliderRow
              label="饱和"
              value={adjustments.hsl[activeHslColor].saturation}
              min={-100}
              max={100}
              format={(value) => (value > 0 ? `+${value}` : `${value}`)}
              onChange={(value) => updateHslValue(activeHslColor, "saturation", value)}
            />
            <EditorSliderRow
              label="明度"
              value={adjustments.hsl[activeHslColor].luminance}
              min={-100}
              max={100}
              format={(value) => (value > 0 ? `+${value}` : `${value}`)}
              onChange={(value) => updateHslValue(activeHslColor, "luminance", value)}
            />
          </EditorSection>

          <EditorSection
            title="曲线"
            hint="RGB 总曲线"
            isOpen={openSections.curve}
            onToggle={() => toggleSection("curve")}
          >
            <div className="flex flex-wrap gap-2">
              {CURVE_CHANNELS.map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant={curveChannel === item.id ? "default" : "secondary"}
                  onClick={() => setCurveChannel(item.id)}
                  disabled={!item.enabled}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            {renderSliderRows(adjustments, CURVE_SLIDERS, updateAdjustmentValue)}
          </EditorSection>

          <EditorSection
            title="效果"
            hint="清晰度 / 纹理 / 去雾"
            isOpen={openSections.effects}
            onToggle={() => toggleSection("effects")}
          >
            {renderSliderRows(adjustments, EFFECTS_SLIDERS, updateAdjustmentValue)}
          </EditorSection>

          <EditorSection
            title="细节"
            hint="锐化 / 降噪"
            isOpen={openSections.detail}
            onToggle={() => toggleSection("detail")}
          >
            {renderSliderRows(adjustments, DETAIL_SLIDERS, updateAdjustmentValue)}
          </EditorSection>

          <EditorSection
            title="裁切"
            hint="比例 / 旋转 / 翻转"
            isOpen={openSections.crop}
            onToggle={() => toggleSection("crop")}
          >
            <div className="flex flex-wrap gap-2">
              {ASPECT_RATIOS.map((ratio) => (
                <Button
                  key={ratio.value}
                  size="sm"
                  variant={adjustments.aspectRatio === ratio.value ? "default" : "secondary"}
                  onClick={() => updateAdjustments({ aspectRatio: ratio.value })}
                >
                  {ratio.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={adjustments.flipHorizontal ? "default" : "secondary"}
                onClick={() => toggleFlip("flipHorizontal")}
              >
                水平翻转
              </Button>
              <Button
                size="sm"
                variant={adjustments.flipVertical ? "default" : "secondary"}
                onClick={() => toggleFlip("flipVertical")}
              >
                垂直翻转
              </Button>
            </div>
            {renderSliderRows(adjustments, CROP_SLIDERS, updateAdjustmentValue)}
          </EditorSection>

          <EditorSection
            title="局部"
            hint="渐变 / 径向 / 画笔"
            isOpen={openSections.local}
            onToggle={() => toggleSection("local")}
          >
            <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-xs text-slate-300">
              局部蒙版将在后续版本上线。
            </div>
          </EditorSection>

          <EditorSection
            title="AI"
            hint="智能增强"
            isOpen={openSections.ai}
            onToggle={() => toggleSection("ai")}
          >
            <div className="flex flex-wrap gap-2">
              {AI_FEATURES.map((label) => (
                <Badge key={label} className="border-white/10 bg-white/5 text-slate-200">
                  {label}
                </Badge>
              ))}
            </div>
          </EditorSection>

          <EditorSection
            title="导出"
            hint="尺寸 / 质量 / 色彩"
            isOpen={openSections.export}
            onToggle={() => toggleSection("export")}
          >
            <div className="space-y-2 text-xs text-slate-300">
              <p>输出尺寸：原图或指定长边。</p>
              <p>输出质量：可调 JPEG 质量。</p>
              <p>格式：PNG / JPEG / WebP（规划中）。</p>
              <p>色彩空间：默认 sRGB。</p>
            </div>
            <Button size="sm" variant="secondary" asChild>
              <Link to="/" search={{ step: "export" }}>
                前往导出设置
              </Link>
            </Button>
          </EditorSection>
        </div>
      )}
    </>
  );
});

