import { memo } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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
  type CurveChannel,
  type SectionId,
  type SliderDefinition,
} from "./editorPanelConfig";
import type { NumericAdjustmentKey } from "./types";
import type { EditingAdjustments, HslColorKey } from "@/types";

interface EditorAdjustmentPanelProps {
  adjustments: EditingAdjustments | null;
  activeHslColor: HslColorKey;
  curveChannel: CurveChannel;
  openSections: Record<SectionId, boolean>;
  onSelectHslColor: (color: HslColorKey) => void;
  onSetCurveChannel: (channel: CurveChannel) => void;
  onToggleSection: (sectionId: SectionId) => void;
  onUpdateAdjustments: (partial: Partial<EditingAdjustments>) => void;
  onUpdateAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void;
  onUpdateHslValue: (
    color: HslColorKey,
    channel: "hue" | "saturation" | "luminance",
    value: number
  ) => void;
  onToggleFlip: (axis: "flipHorizontal" | "flipVertical") => void;
}

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

export const EditorAdjustmentPanel = memo(function EditorAdjustmentPanel({
  adjustments,
  activeHslColor,
  curveChannel,
  openSections,
  onSelectHslColor,
  onSetCurveChannel,
  onToggleSection,
  onUpdateAdjustments,
  onUpdateAdjustmentValue,
  onUpdateHslValue,
  onToggleFlip,
}: EditorAdjustmentPanelProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>操作体验</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-slate-300">
          <p>实时预览：滑杆即刻生效。</p>
          <p>原图/编辑对比：支持一键切换。</p>
          <p>批量处理：回到工作台可同步参数。</p>
          <p className="text-slate-500">双指缩放、Undo/Redo、历史记录规划中。</p>
        </CardContent>
      </Card>

      {!adjustments ? (
        <Card>
          <CardContent className="p-4 text-sm text-slate-400">
            请选择一张照片以查看精修工具。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <EditorSection
            title="基础调整"
            hint="光线 / 曝光 / 颜色"
            isOpen={openSections.basic}
            onToggle={() => onToggleSection("basic")}
          >
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">光线</p>
              {renderSliderRows(adjustments, BASIC_LIGHT_SLIDERS, onUpdateAdjustmentValue)}
              <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-500">颜色</p>
              {renderSliderRows(adjustments, BASIC_COLOR_SLIDERS, onUpdateAdjustmentValue)}
            </div>
          </EditorSection>

          <EditorSection
            title="HSL 颜色精细控制"
            hint="Hue / Saturation / Luminance"
            isOpen={openSections.hsl}
            onToggle={() => onToggleSection("hsl")}
          >
            <div className="flex flex-wrap gap-2">
              {HSL_COLORS.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => onSelectHslColor(color.id)}
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
              label="色相 (H)"
              value={adjustments.hsl[activeHslColor].hue}
              min={-100}
              max={100}
              format={(value) => (value > 0 ? `+${value}` : `${value}`)}
              onChange={(value) => onUpdateHslValue(activeHslColor, "hue", value)}
            />
            <EditorSliderRow
              label="饱和度 (S)"
              value={adjustments.hsl[activeHslColor].saturation}
              min={-100}
              max={100}
              format={(value) => (value > 0 ? `+${value}` : `${value}`)}
              onChange={(value) => onUpdateHslValue(activeHslColor, "saturation", value)}
            />
            <EditorSliderRow
              label="明亮度 (L)"
              value={adjustments.hsl[activeHslColor].luminance}
              min={-100}
              max={100}
              format={(value) => (value > 0 ? `+${value}` : `${value}`)}
              onChange={(value) => onUpdateHslValue(activeHslColor, "luminance", value)}
            />
            <p className="text-[11px] text-slate-500">
              已覆盖红/橙/黄/绿/青/蓝/紫/洋红（渲染适配中）。
            </p>
          </EditorSection>

          <EditorSection
            title="曲线"
            hint="RGB 总曲线 / 单通道"
            isOpen={openSections.curve}
            onToggle={() => onToggleSection("curve")}
          >
            <div className="flex flex-wrap gap-2">
              {CURVE_CHANNELS.map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant={curveChannel === item.id ? "default" : "secondary"}
                  onClick={() => onSetCurveChannel(item.id)}
                  disabled={!item.enabled}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            {renderSliderRows(adjustments, CURVE_SLIDERS, onUpdateAdjustmentValue)}
            <p className="text-[11px] text-slate-500">点曲线与单通道曲线编辑规划中。</p>
          </EditorSection>

          <EditorSection
            title="清晰度与质感"
            hint="Clarity / Texture / Dehaze"
            isOpen={openSections.effects}
            onToggle={() => onToggleSection("effects")}
          >
            {renderSliderRows(adjustments, EFFECTS_SLIDERS, onUpdateAdjustmentValue)}
          </EditorSection>

          <EditorSection
            title="细节与降噪"
            hint="锐化 / 降噪"
            isOpen={openSections.detail}
            onToggle={() => onToggleSection("detail")}
          >
            {renderSliderRows(adjustments, DETAIL_SLIDERS, onUpdateAdjustmentValue)}
            <p className="text-[11px] text-slate-500">细节算法将逐步接入渲染管线。</p>
          </EditorSection>

          <EditorSection
            title="裁切与构图"
            hint="比例 / 旋转 / 翻转"
            isOpen={openSections.crop}
            onToggle={() => onToggleSection("crop")}
          >
            <div className="flex flex-wrap gap-2">
              {ASPECT_RATIOS.map((ratio) => (
                <Button
                  key={ratio.value}
                  size="sm"
                  variant={adjustments.aspectRatio === ratio.value ? "default" : "secondary"}
                  onClick={() => onUpdateAdjustments({ aspectRatio: ratio.value })}
                >
                  {ratio.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={adjustments.flipHorizontal ? "default" : "secondary"}
                onClick={() => onToggleFlip("flipHorizontal")}
              >
                水平翻转
              </Button>
              <Button
                size="sm"
                variant={adjustments.flipVertical ? "default" : "secondary"}
                onClick={() => onToggleFlip("flipVertical")}
              >
                垂直翻转
              </Button>
            </div>
            {renderSliderRows(adjustments, CROP_SLIDERS, onUpdateAdjustmentValue)}
          </EditorSection>

          <EditorSection
            title="局部调整"
            hint="渐变 / 径向 / 画笔"
            isOpen={openSections.local}
            onToggle={() => onToggleSection("local")}
          >
            <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-xs text-slate-300">
              渐变滤镜、径向滤镜、画笔、局部曝光/对比/色温（规划中）。
            </div>
          </EditorSection>

          <EditorSection
            title="AI / 智能功能"
            hint="Web 端亮点"
            isOpen={openSections.ai}
            onToggle={() => onToggleSection("ai")}
          >
            <div className="flex flex-wrap gap-2">
              {AI_FEATURES.map((label) => (
                <Badge key={label} className="border-white/10 bg-white/5 text-slate-200">
                  {label}
                </Badge>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">AI 功能作为 Web 端优势，逐步开放。</p>
          </EditorSection>

          <EditorSection
            title="导出与格式"
            hint="尺寸 / 质量 / 色彩"
            isOpen={openSections.export}
            onToggle={() => onToggleSection("export")}
          >
            <div className="space-y-2 text-xs text-slate-300">
              <p>导出尺寸：原图 / 指定长边。</p>
              <p>导出质量：JPEG 质量可调。</p>
              <p>格式：PNG / JPEG / WebP。</p>
              <p>色彩空间：默认 sRGB。</p>
              <p>EXIF：可保留或移除。</p>
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
