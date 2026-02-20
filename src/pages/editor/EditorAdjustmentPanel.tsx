import { memo } from "react";
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
import { createDefaultAdjustments } from "@/lib/adjustments";
import { cn } from "@/lib/utils";
import type {
  EditingAdjustments,
  FilmModuleId,
  FilmNumericParamKey,
} from "@/types";
import { ASPECT_RATIOS } from "./constants";
import { EditorColorGradingPanel } from "./EditorColorGradingPanel";
import { EditorPointCurve } from "./EditorPointCurve";
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
  WHITE_BALANCE_PRESETS,
  type SliderDefinition,
} from "./editorPanelConfig";
import type { NumericAdjustmentKey } from "./types";
import { useEditorState } from "./useEditorState";

interface FilmParamDefinition<TId extends FilmModuleId> {
  key: FilmNumericParamKey<TId>;
  label: string;
  min: number;
  max: number;
  step: number;
}

type FilmParamDefinitions = {
  [TId in FilmModuleId]: FilmParamDefinition<TId>[];
};

const DEFAULT_ADJUSTMENTS = createDefaultAdjustments();

const FILM_MODULE_LABELS: Record<FilmModuleId, string> = {
  colorScience: "色彩科学",
  tone: "影调",
  scan: "冲扫",
  grain: "颗粒",
  defects: "瑕疵",
};

const FILM_PARAM_DEFINITIONS: FilmParamDefinitions = {
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
  onPreviewAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void,
  onCommitAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void
) =>
  sliders.map((slider) => (
    <EditorSliderRow
      key={slider.key}
      label={slider.label}
      value={adjustments[slider.key] as number}
      defaultValue={DEFAULT_ADJUSTMENTS[slider.key] as number}
      min={slider.min}
      max={slider.max}
      step={slider.step}
      format={slider.format}
      onChange={(value) => onPreviewAdjustmentValue(slider.key, value)}
      onCommit={(value) => onCommitAdjustmentValue(slider.key, value)}
      onReset={() =>
        onCommitAdjustmentValue(slider.key, DEFAULT_ADJUSTMENTS[slider.key] as number)
      }
    />
  ));

const formatFilmValue = (value: number, step: number) => {
  if (step < 1) {
    return value.toFixed(2);
  }
  return `${Math.round(value)}`;
};

const WHITE_BALANCE_CUSTOM_KEY = "__custom__";

const resolveWhiteBalancePresetId = (temperature: number, tint: number) => {
  const preset = WHITE_BALANCE_PRESETS.find(
    (item) => item.temperature === temperature && item.tint === tint
  );
  return preset?.id ?? WHITE_BALANCE_CUSTOM_KEY;
};

export const EditorAdjustmentPanel = memo(function EditorAdjustmentPanel() {
  const {
    adjustments,
    previewFilmProfile: filmProfile,
    activeHslColor,
    pointColorPicking,
    lastPointColorSample,
    curveChannel,
    openSections,
    setActiveHslColor,
    setCurveChannel,
    toggleSection,
    updateAdjustments,
    previewAdjustmentValue,
    updateAdjustmentValue,
    previewHslValue,
    updateHslValue,
    previewColorGradingZone,
    updateColorGradingZone,
    previewColorGradingValue,
    updateColorGradingValue,
    resetColorGrading,
    startPointColorPick,
    cancelPointColorPick,
    toggleFlip,
    handleSetFilmModuleAmount,
    handleToggleFilmModule,
    handleSetFilmModuleParam,
    handleSetFilmModuleRgbMix,
    handleResetFilmOverrides,
  } = useEditorState();
  const whiteBalancePresetId = adjustments
    ? resolveWhiteBalancePresetId(adjustments.temperature, adjustments.tint)
    : WHITE_BALANCE_CUSTOM_KEY;

  const handleWhiteBalancePresetChange = (presetId: string) => {
    if (presetId === WHITE_BALANCE_CUSTOM_KEY) {
      return;
    }
    const preset = WHITE_BALANCE_PRESETS.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }
    updateAdjustments({
      temperature: preset.temperature,
      tint: preset.tint,
    });
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
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (
                        window.confirm(
                          "确认重置所有胶片模块覆盖参数吗？此操作会恢复到预设默认值。"
                        )
                      ) {
                        handleResetFilmOverrides();
                      }
                    }}
                  >
                    重置模块覆盖
                  </Button>
                </div>
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
                        <Badge
                          size="control"
                          className="border-white/10 bg-white/5 text-xs text-slate-300"
                        >
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
                      disabled={!module.enabled}
                      onChange={(value) =>
                        handleSetFilmModuleAmount(module.id, value, "live")
                      }
                      onCommit={(value) =>
                        handleSetFilmModuleAmount(module.id, value, "commit")
                      }
                    />

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
                          disabled={!module.enabled}
                          format={(value) => formatFilmValue(value, param.step)}
                          onChange={(value) =>
                            handleSetFilmModuleParam(module.id, param.key, value, "live")
                          }
                          onCommit={(value) =>
                            handleSetFilmModuleParam(module.id, param.key, value, "commit")
                          }
                        />
                      );
                    })}
                    {module.id === "colorScience" &&
                      Array.isArray(module.params.rgbMix) &&
                      module.params.rgbMix.length === 3 && (
                        <>
                          <EditorSliderRow
                            label="R 通道混合"
                            value={module.params.rgbMix[0]}
                            min={0.5}
                            max={1.5}
                            step={0.01}
                            disabled={!module.enabled}
                            format={(value) => value.toFixed(2)}
                            onChange={(value) =>
                              handleSetFilmModuleRgbMix(module.id, 0, value, "live")
                            }
                            onCommit={(value) =>
                              handleSetFilmModuleRgbMix(module.id, 0, value, "commit")
                            }
                          />
                          <EditorSliderRow
                            label="G 通道混合"
                            value={module.params.rgbMix[1]}
                            min={0.5}
                            max={1.5}
                            step={0.01}
                            disabled={!module.enabled}
                            format={(value) => value.toFixed(2)}
                            onChange={(value) =>
                              handleSetFilmModuleRgbMix(module.id, 1, value, "live")
                            }
                            onCommit={(value) =>
                              handleSetFilmModuleRgbMix(module.id, 1, value, "commit")
                            }
                          />
                          <EditorSliderRow
                            label="B 通道混合"
                            value={module.params.rgbMix[2]}
                            min={0.5}
                            max={1.5}
                            step={0.01}
                            disabled={!module.enabled}
                            format={(value) => value.toFixed(2)}
                            onChange={(value) =>
                              handleSetFilmModuleRgbMix(module.id, 2, value, "live")
                            }
                            onCommit={(value) =>
                              handleSetFilmModuleRgbMix(module.id, 2, value, "commit")
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
              {renderSliderRows(
                adjustments,
                BASIC_LIGHT_SLIDERS,
                previewAdjustmentValue,
                updateAdjustmentValue
              )}
              <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-500">色彩</p>
              <div className="space-y-2">
                <p className="text-xs text-slate-300">白平衡预设</p>
                <Select
                  value={whiteBalancePresetId}
                  onValueChange={handleWhiteBalancePresetChange}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="选择白平衡" />
                  </SelectTrigger>
                  <SelectContent>
                    {WHITE_BALANCE_PRESETS.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.label}
                      </SelectItem>
                    ))}
                    {whiteBalancePresetId === WHITE_BALANCE_CUSTOM_KEY && (
                      <SelectItem value={WHITE_BALANCE_CUSTOM_KEY}>自定义</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              {renderSliderRows(
                adjustments,
                BASIC_COLOR_SLIDERS,
                previewAdjustmentValue,
                updateAdjustmentValue
              )}
            </div>
          </EditorSection>

          <EditorSection
            title="HSL"
            hint="色相 / 饱和 / 明度"
            isOpen={openSections.hsl}
            onToggle={() => toggleSection("hsl")}
          >
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-slate-200">点颜色</p>
                  <p className="text-[11px] text-slate-500">
                    {pointColorPicking ? "请在预览图中点击目标颜色" : "从照片中取色并定位到对应通道"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={pointColorPicking ? "default" : "secondary"}
                  onClick={() => {
                    if (pointColorPicking) {
                      cancelPointColorPick();
                      return;
                    }
                    startPointColorPick();
                  }}
                >
                  {pointColorPicking ? "取消取色" : "选择照片中的颜色"}
                </Button>
              </div>
              {lastPointColorSample && (
                <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                  <span
                    className="h-4 w-4 rounded-full border border-white/20"
                    style={{ backgroundColor: lastPointColorSample.hex }}
                  />
                  <span>{lastPointColorSample.hex.toUpperCase()}</span>
                  <span>→ {lastPointColorSample.mappedColor}</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {HSL_COLORS.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => setActiveHslColor(color.id)}
                  aria-pressed={activeHslColor === color.id}
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
              defaultValue={0}
              min={-100}
              max={100}
              format={(value) => (value > 0 ? `+${value}` : `${value}`)}
              onChange={(value) => previewHslValue(activeHslColor, "hue", value)}
              onCommit={(value) => updateHslValue(activeHslColor, "hue", value)}
              onReset={() => updateHslValue(activeHslColor, "hue", 0)}
            />
            <EditorSliderRow
              label="饱和"
              value={adjustments.hsl[activeHslColor].saturation}
              defaultValue={0}
              min={-100}
              max={100}
              format={(value) => (value > 0 ? `+${value}` : `${value}`)}
              onChange={(value) => previewHslValue(activeHslColor, "saturation", value)}
              onCommit={(value) => updateHslValue(activeHslColor, "saturation", value)}
              onReset={() => updateHslValue(activeHslColor, "saturation", 0)}
            />
            <EditorSliderRow
              label="明度"
              value={adjustments.hsl[activeHslColor].luminance}
              defaultValue={0}
              min={-100}
              max={100}
              format={(value) => (value > 0 ? `+${value}` : `${value}`)}
              onChange={(value) => previewHslValue(activeHslColor, "luminance", value)}
              onCommit={(value) => updateHslValue(activeHslColor, "luminance", value)}
              onReset={() => updateHslValue(activeHslColor, "luminance", 0)}
            />
          </EditorSection>

          <EditorSection
            title="颜色分级"
            hint="阴影 / 中间调 / 高光"
            isOpen={openSections.grading}
            onToggle={() => toggleSection("grading")}
          >
            <EditorColorGradingPanel
              colorGrading={adjustments.colorGrading}
              onPreviewZone={previewColorGradingZone}
              onCommitZone={updateColorGradingZone}
              onPreviewValue={previewColorGradingValue}
              onCommitValue={updateColorGradingValue}
              onReset={resetColorGrading}
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
                  aria-pressed={curveChannel === item.id}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <EditorPointCurve
              values={{
                curveHighlights: adjustments.curveHighlights,
                curveLights: adjustments.curveLights,
                curveDarks: adjustments.curveDarks,
                curveShadows: adjustments.curveShadows,
              }}
              onPreview={(key, value) => previewAdjustmentValue(key, value)}
              onCommit={(key, value) => updateAdjustmentValue(key, value)}
            />
            {renderSliderRows(
              adjustments,
              CURVE_SLIDERS,
              previewAdjustmentValue,
              updateAdjustmentValue
            )}
          </EditorSection>

          <EditorSection
            title="效果"
            hint="清晰度 / 纹理 / 去雾"
            isOpen={openSections.effects}
            onToggle={() => toggleSection("effects")}
          >
            {renderSliderRows(
              adjustments,
              EFFECTS_SLIDERS,
              previewAdjustmentValue,
              updateAdjustmentValue
            )}
          </EditorSection>

          <EditorSection
            title="细节"
            hint="锐化 / 降噪"
            isOpen={openSections.detail}
            onToggle={() => toggleSection("detail")}
          >
            {renderSliderRows(
              adjustments,
              DETAIL_SLIDERS,
              previewAdjustmentValue,
              updateAdjustmentValue
            )}
          </EditorSection>

          <EditorSection
            title="光学"
            hint="镜头与色差校正"
            isOpen={openSections.optics}
            onToggle={() => toggleSection("optics")}
          >
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-950 accent-sky-400"
                checked={adjustments.opticsCA}
                onChange={(event) =>
                  updateAdjustments({ opticsCA: event.currentTarget.checked })
                }
              />
              <span className="space-y-0.5">
                <span className="block">删除色差</span>
                <span className="block text-[11px] text-slate-500">减少边缘紫边和绿边。</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-950 accent-sky-400"
                checked={adjustments.opticsProfile}
                onChange={(event) =>
                  updateAdjustments({ opticsProfile: event.currentTarget.checked })
                }
              />
              <span className="space-y-0.5">
                <span className="block">启用镜头校正</span>
                <span className="block text-[11px] text-slate-500">
                  记录镜头修正开关，便于后续渲染对齐。
                </span>
              </span>
            </label>
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
                  aria-pressed={adjustments.aspectRatio === ratio.value}
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
                aria-pressed={adjustments.flipHorizontal}
              >
                水平翻转
              </Button>
              <Button
                size="sm"
                variant={adjustments.flipVertical ? "default" : "secondary"}
                onClick={() => toggleFlip("flipVertical")}
                aria-pressed={adjustments.flipVertical}
              >
                垂直翻转
              </Button>
            </div>
            {renderSliderRows(
              adjustments,
              CROP_SLIDERS,
              previewAdjustmentValue,
              updateAdjustmentValue
            )}
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
              <p className="text-slate-400">
                导出流程请使用页面顶部“返回工作台”后进入对应步骤。
              </p>
            </div>
          </EditorSection>
        </div>
      )}
    </>
  );
});



