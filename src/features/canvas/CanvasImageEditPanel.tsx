import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CanvasEditSection } from "@/features/canvas/components/CanvasEditSection";
import { SliderControl } from "@/features/canvas/components/controls/SliderControl";
import type { NumericAdjustmentKey } from "@/features/canvas/imageAdjustmentTypes";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { asciiAdjustmentsEqual } from "@/lib/asciiRaster";
import { cn } from "@/lib/utils";
import {
  useCanvasElementDraftRenderState,
  useCanvasPreviewActions,
} from "@/features/canvas/runtime/canvasRuntimeHooks";
import { resolveCanvasImageRenderState } from "@/features/canvas/imageRenderState";
import type { CanvasImageRenderStateV1 } from "@/render/image";
import type { AsciiAdjustments } from "@/types";
import {
  canvasDockBodyTextClassName,
  canvasDockSelectContentClassName,
  canvasDockSelectTriggerClassName,
} from "./editDockTheme";
import type { CanvasImageEditTarget } from "./editPanelSelection";
import {
  applyAsciiAdjustmentsToRenderState,
  applyNumericAdjustmentToRenderState,
  type CanvasImageAdjustmentView,
  DEFAULT_CANVAS_IMAGE_ADJUSTMENT_VIEW,
  getCanvasImageAdjustmentView,
  resetRenderStateForAdjustmentKeys,
} from "./imageRenderStateEditing";
import { useCanvasImagePropertyActions } from "./hooks/useCanvasImagePropertyActions";

const DEFAULT_ADJUSTMENTS = createDefaultAdjustments();

type CanvasEditSectionId = "light" | "color" | "tones" | "effects" | "detail" | "ascii";

interface ProjectSliderDefinition {
  key: NumericAdjustmentKey;
  label: string;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}

interface ProjectEditControlsProps {
  adjustments: CanvasImageAdjustmentView;
  asciiAdjustments: AsciiAdjustments;
  asciiHasChanges: boolean;
  colorHasChanges: boolean;
  commitAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void;
  detailHasChanges: boolean;
  disabled: boolean;
  effectsHasChanges: boolean;
  lightHasChanges: boolean;
  onToggleSection: (sectionId: CanvasEditSectionId) => void;
  openSections: Record<CanvasEditSectionId, boolean>;
  previewAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void;
  resetSection: (sliders: ProjectSliderDefinition[]) => void;
  tonesHasChanges: boolean;
  updateAsciiAdjustments: (partial: Partial<AsciiAdjustments>, mode?: "preview" | "commit") => void;
}

interface CanvasImageEditPanelProps {
  children?: ReactNode;
  imageElement: CanvasImageEditTarget | null;
}

const formatSigned = (value: number) => (value > 0 ? `+${value}` : `${value}`);

const LIGHT_AND_CONTRAST_SLIDERS: ProjectSliderDefinition[] = [
  { key: "brightness", label: "亮度", min: -100, max: 100, format: formatSigned },
  { key: "exposure", label: "曝光", min: -100, max: 100, format: formatSigned },
  { key: "contrast", label: "对比度", min: -100, max: 100, format: formatSigned },
  { key: "clarity", label: "清晰度", min: -100, max: 100, format: formatSigned },
];

const COLOR_AND_WHITE_BALANCE_SLIDERS: ProjectSliderDefinition[] = [
  { key: "temperature", label: "色温", min: -100, max: 100, format: formatSigned },
  { key: "tint", label: "色偏", min: -100, max: 100, format: formatSigned },
  { key: "saturation", label: "饱和度", min: -100, max: 100, format: formatSigned },
  { key: "vibrance", label: "自然饱和度", min: -100, max: 100, format: formatSigned },
  { key: "hue", label: "色相", min: -100, max: 100, format: formatSigned },
];

const HIGHLIGHTS_AND_SHADOWS_SLIDERS: ProjectSliderDefinition[] = [
  { key: "highlights", label: "高光", min: -100, max: 100, format: formatSigned },
  { key: "shadows", label: "阴影", min: -100, max: 100, format: formatSigned },
  { key: "whites", label: "白色色阶", min: -100, max: 100, format: formatSigned },
  { key: "blacks", label: "黑色色阶", min: -100, max: 100, format: formatSigned },
];

const EFFECTS_AND_FILTERS_SLIDERS: ProjectSliderDefinition[] = [
  { key: "texture", label: "纹理", min: -100, max: 100, format: formatSigned },
  { key: "dehaze", label: "去朦胧", min: -100, max: 100, format: formatSigned },
  { key: "vignette", label: "暗角", min: -100, max: 100, format: formatSigned },
  { key: "grain", label: "颗粒", min: 0, max: 100 },
  { key: "grainSize", label: "颗粒大小", min: 0, max: 100 },
  { key: "grainRoughness", label: "颗粒粗糙度", min: 0, max: 100 },
  { key: "blur", label: "模糊", min: 0, max: 100 },
  { key: "dilate", label: "膨胀", min: 0, max: 100 },
];

const DETAIL_AND_GLOW_SLIDERS: ProjectSliderDefinition[] = [
  { key: "sharpening", label: "锐化", min: 0, max: 100 },
  { key: "sharpenRadius", label: "锐化半径", min: 0, max: 100 },
  { key: "sharpenDetail", label: "锐化细节", min: 0, max: 100 },
  { key: "masking", label: "蒙版", min: 0, max: 100 },
  { key: "noiseReduction", label: "降噪", min: 0, max: 100 },
  { key: "colorNoiseReduction", label: "彩色噪点", min: 0, max: 100 },
  { key: "glowIntensity", label: "辉光强度", min: 0, max: 100 },
  { key: "glowMidtoneFocus", label: "中间调聚焦", min: 0, max: 100 },
  { key: "glowBias", label: "辉光偏移", min: 0, max: 100 },
  { key: "glowRadius", label: "辉光半径", min: 0, max: 100 },
];

const ASCII_CHARSET_OPTIONS: Array<{
  label: string;
  value: AsciiAdjustments["charsetPreset"];
}> = [
  { label: "标准", value: "standard" },
  { label: "方块", value: "blocks" },
  { label: "细节", value: "detailed" },
];

const ASCII_COLOR_MODE_OPTIONS: Array<{
  label: string;
  value: AsciiAdjustments["colorMode"];
}> = [
  { label: "灰度", value: "grayscale" },
  { label: "全彩", value: "full-color" },
];

const ASCII_DITHER_OPTIONS: Array<{
  label: string;
  value: AsciiAdjustments["dither"];
}> = [
  { label: "无", value: "none" },
  { label: "Floyd-Steinberg", value: "floyd-steinberg" },
];

const createInitialOpenSections = (): Record<CanvasEditSectionId, boolean> => ({
  light: true,
  color: true,
  tones: true,
  effects: true,
  detail: false,
  ascii: false,
});

const sliderToneForKey = (key: NumericAdjustmentKey) =>
  key === "temperature" ? "temperature" : key === "tint" ? "tint" : "neutral";

interface ProjectSliderRowProps {
  adjustmentKey: NumericAdjustmentKey;
  format?: ProjectSliderDefinition["format"];
  label: string;
  max: number;
  min: number;
  onCommitAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void;
  onPreviewAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void;
  step?: number;
  value: number;
}

const ProjectSliderRow = memo(function ProjectSliderRow({
  adjustmentKey,
  label,
  min,
  max,
  step,
  format,
  onCommitAdjustmentValue,
  onPreviewAdjustmentValue,
  value,
}: ProjectSliderRowProps) {
  const defaultValue = Number(DEFAULT_ADJUSTMENTS[adjustmentKey] ?? 0);

  const handleChange = useCallback(
    (nextValue: number) => {
      onPreviewAdjustmentValue(adjustmentKey, nextValue);
    },
    [adjustmentKey, onPreviewAdjustmentValue]
  );

  const handleCommit = useCallback(
    (nextValue: number) => {
      onCommitAdjustmentValue(adjustmentKey, nextValue);
    },
    [adjustmentKey, onCommitAdjustmentValue]
  );

  const handleReset = useCallback(() => {
    onCommitAdjustmentValue(adjustmentKey, defaultValue);
  }, [adjustmentKey, defaultValue, onCommitAdjustmentValue]);

  return (
    <SliderControl
      variant="canvasDock"
      label={label}
      value={value}
      defaultValue={defaultValue}
      min={min}
      max={max}
      step={step}
      format={format}
      tone={sliderToneForKey(adjustmentKey)}
      onChange={handleChange}
      onCommit={handleCommit}
      onReset={handleReset}
    />
  );
});

const renderSliderRows = (
  adjustments: CanvasImageAdjustmentView,
  sliders: ProjectSliderDefinition[],
  onPreviewAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void,
  onCommitAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void
) =>
  sliders.map((slider) => (
    <ProjectSliderRow
      key={slider.key}
      adjustmentKey={slider.key}
      label={slider.label}
      min={slider.min}
      max={slider.max}
      step={slider.step}
      format={slider.format}
      value={Number(adjustments[slider.key] ?? 0)}
      onPreviewAdjustmentValue={onPreviewAdjustmentValue}
      onCommitAdjustmentValue={onCommitAdjustmentValue}
    />
  ));

const hasSliderSectionChanges = (
  adjustments: CanvasImageAdjustmentView,
  sliders: ProjectSliderDefinition[]
) =>
  sliders.some(
    (slider) =>
      Number(adjustments[slider.key] ?? 0) !== Number(DEFAULT_ADJUSTMENTS[slider.key] ?? 0)
  );

const ProjectEditControls = memo(function ProjectEditControls({
  adjustments,
  asciiAdjustments,
  asciiHasChanges,
  colorHasChanges,
  commitAdjustmentValue,
  detailHasChanges,
  disabled,
  effectsHasChanges,
  lightHasChanges,
  onToggleSection,
  openSections,
  previewAdjustmentValue,
  resetSection,
  tonesHasChanges,
  updateAsciiAdjustments,
}: ProjectEditControlsProps) {
  return (
    <section>
      <CanvasEditSection
        variant="canvasDock"
        title="光线与对比"
        isOpen={openSections.light}
        onToggle={() => onToggleSection("light")}
        hasChanges={lightHasChanges}
        canResetChanges={lightHasChanges}
        onResetChanges={() => resetSection(LIGHT_AND_CONTRAST_SLIDERS)}
      >
        {renderSliderRows(
          adjustments,
          LIGHT_AND_CONTRAST_SLIDERS,
          previewAdjustmentValue,
          commitAdjustmentValue
        )}
      </CanvasEditSection>

      <CanvasEditSection
        variant="canvasDock"
        title="色彩与白平衡"
        isOpen={openSections.color}
        onToggle={() => onToggleSection("color")}
        hasChanges={colorHasChanges}
        canResetChanges={colorHasChanges}
        onResetChanges={() => resetSection(COLOR_AND_WHITE_BALANCE_SLIDERS)}
      >
        {renderSliderRows(
          adjustments,
          COLOR_AND_WHITE_BALANCE_SLIDERS,
          previewAdjustmentValue,
          commitAdjustmentValue
        )}
      </CanvasEditSection>

      <CanvasEditSection
        variant="canvasDock"
        title="高光与阴影"
        isOpen={openSections.tones}
        onToggle={() => onToggleSection("tones")}
        hasChanges={tonesHasChanges}
        canResetChanges={tonesHasChanges}
        onResetChanges={() => resetSection(HIGHLIGHTS_AND_SHADOWS_SLIDERS)}
      >
        {renderSliderRows(
          adjustments,
          HIGHLIGHTS_AND_SHADOWS_SLIDERS,
          previewAdjustmentValue,
          commitAdjustmentValue
        )}
      </CanvasEditSection>

      <CanvasEditSection
        variant="canvasDock"
        title="效果与滤镜"
        isOpen={openSections.effects}
        onToggle={() => onToggleSection("effects")}
        hasChanges={effectsHasChanges}
        canResetChanges={effectsHasChanges}
        onResetChanges={() => resetSection(EFFECTS_AND_FILTERS_SLIDERS)}
      >
        {renderSliderRows(
          adjustments,
          EFFECTS_AND_FILTERS_SLIDERS,
          previewAdjustmentValue,
          commitAdjustmentValue
        )}
      </CanvasEditSection>

      <CanvasEditSection
        variant="canvasDock"
        title="细节与辉光"
        isOpen={openSections.detail}
        onToggle={() => onToggleSection("detail")}
        hasChanges={detailHasChanges}
        canResetChanges={detailHasChanges}
        onResetChanges={() => resetSection(DETAIL_AND_GLOW_SLIDERS)}
      >
        {renderSliderRows(
          adjustments,
          DETAIL_AND_GLOW_SLIDERS,
          previewAdjustmentValue,
          commitAdjustmentValue
        )}
      </CanvasEditSection>

      <CanvasEditSection
        variant="canvasDock"
        title="ASCII 光栅"
        isOpen={openSections.ascii}
        onToggle={() => onToggleSection("ascii")}
        hasChanges={asciiHasChanges}
        canResetChanges={asciiHasChanges}
        onResetChanges={() => updateAsciiAdjustments({ ...DEFAULT_ADJUSTMENTS.ascii! })}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={cn(
                "h-10 rounded-[8px] border border-[color:var(--canvas-edit-border)] px-3 text-sm font-medium transition",
                asciiAdjustments.enabled
                  ? "bg-[color:var(--canvas-edit-text)] text-black hover:bg-white"
                  : "bg-[color:var(--canvas-edit-surface)] text-[color:var(--canvas-edit-text-muted)] hover:text-[color:var(--canvas-edit-text)]"
              )}
              onClick={() => updateAsciiAdjustments({ enabled: !asciiAdjustments.enabled })}
            >
              {asciiAdjustments.enabled ? "ASCII 已开启" : "ASCII 已关闭"}
            </button>
            <button
              type="button"
              disabled={!asciiAdjustments.enabled || disabled}
              className={cn(
                "h-10 rounded-[8px] border border-[color:var(--canvas-edit-border)] px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
                asciiAdjustments.invert
                  ? "bg-[color:var(--canvas-edit-text)] text-black hover:bg-white"
                  : "bg-[color:var(--canvas-edit-surface)] text-[color:var(--canvas-edit-text-muted)] hover:text-[color:var(--canvas-edit-text)]"
              )}
              onClick={() => updateAsciiAdjustments({ invert: !asciiAdjustments.invert })}
            >
              反相
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Select
              value={asciiAdjustments.charsetPreset}
              onValueChange={(value) =>
                updateAsciiAdjustments({
                  charsetPreset: value as AsciiAdjustments["charsetPreset"],
                })
              }
              disabled={!asciiAdjustments.enabled || disabled}
            >
              <SelectTrigger className={canvasDockSelectTriggerClassName}>
                <SelectValue placeholder="字符集" />
              </SelectTrigger>
              <SelectContent className={canvasDockSelectContentClassName}>
                {ASCII_CHARSET_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={asciiAdjustments.colorMode}
              onValueChange={(value) =>
                updateAsciiAdjustments({
                  colorMode: value as AsciiAdjustments["colorMode"],
                })
              }
              disabled={!asciiAdjustments.enabled || disabled}
            >
              <SelectTrigger className={canvasDockSelectTriggerClassName}>
                <SelectValue placeholder="颜色模式" />
              </SelectTrigger>
              <SelectContent className={canvasDockSelectContentClassName}>
                {ASCII_COLOR_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={asciiAdjustments.dither}
              onValueChange={(value) =>
                updateAsciiAdjustments({
                  dither: value as AsciiAdjustments["dither"],
                })
              }
              disabled={!asciiAdjustments.enabled || disabled}
            >
              <SelectTrigger className={canvasDockSelectTriggerClassName}>
                <SelectValue placeholder="抖动" />
              </SelectTrigger>
              <SelectContent className={canvasDockSelectContentClassName}>
                {ASCII_DITHER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <SliderControl
            variant="canvasDock"
            label="单元尺寸"
            value={asciiAdjustments.cellSize}
            defaultValue={DEFAULT_ADJUSTMENTS.ascii?.cellSize ?? 12}
            min={6}
            max={24}
            disabled={!asciiAdjustments.enabled || disabled}
            onChange={(value) => updateAsciiAdjustments({ cellSize: value }, "preview")}
            onCommit={(value) => updateAsciiAdjustments({ cellSize: value })}
          />
          <SliderControl
            variant="canvasDock"
            label="字符间距"
            value={asciiAdjustments.characterSpacing}
            defaultValue={DEFAULT_ADJUSTMENTS.ascii?.characterSpacing ?? 1}
            min={0.7}
            max={1.6}
            step={0.05}
            disabled={!asciiAdjustments.enabled || disabled}
            format={(value) => value.toFixed(2)}
            onChange={(value) => updateAsciiAdjustments({ characterSpacing: value }, "preview")}
            onCommit={(value) => updateAsciiAdjustments({ characterSpacing: value })}
          />
          <SliderControl
            variant="canvasDock"
            label="ASCII 对比度"
            value={asciiAdjustments.contrast}
            defaultValue={DEFAULT_ADJUSTMENTS.ascii?.contrast ?? 1}
            min={0.5}
            max={2.5}
            step={0.05}
            disabled={!asciiAdjustments.enabled || disabled}
            format={(value) => value.toFixed(2)}
            onChange={(value) => updateAsciiAdjustments({ contrast: value }, "preview")}
            onCommit={(value) => updateAsciiAdjustments({ contrast: value })}
          />
        </div>
      </CanvasEditSection>
    </section>
  );
});

export function CanvasImageEditPanel({
  children,
  imageElement,
}: CanvasImageEditPanelProps) {
  const {
    clearElementDraftRenderState,
    requestBoardPreview,
    setElementDraftRenderState,
  } = useCanvasPreviewActions();
  const [openSections, setOpenSections] = useState(createInitialOpenSections);
  const { setRenderState } = useCanvasImagePropertyActions(imageElement);
  const committedImageElement = imageElement;
  const displayedImageElementId = imageElement?.id ?? null;
  const committedImageElementId = committedImageElement?.id ?? null;
  const committedImageElementIdRef = useRef<string | null>(committedImageElementId);
  const displayedImageElementIdRef = useRef<string | null>(displayedImageElementId);
  const draftRenderState = useCanvasElementDraftRenderState(imageElement?.id ?? null);

  const renderState = useMemo(
    () =>
      imageElement
        ? resolveCanvasImageRenderState(imageElement, undefined, draftRenderState)
        : null,
    [draftRenderState, imageElement]
  );
  const adjustments = useMemo(
    () => (renderState ? getCanvasImageAdjustmentView(renderState) : DEFAULT_CANVAS_IMAGE_ADJUSTMENT_VIEW),
    [renderState]
  );
  const hasEditableRenderState = Boolean(renderState);
  const disabled = !imageElement || !hasEditableRenderState;
  const renderStateRef = useRef(renderState);
  renderStateRef.current = renderState;

  const toggleSection = useCallback((sectionId: CanvasEditSectionId) => {
    setOpenSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }, []);

  useEffect(() => {
    const previousCommittedImageElementId = committedImageElementIdRef.current;
    if (
      previousCommittedImageElementId &&
      previousCommittedImageElementId !== committedImageElementId
    ) {
      clearElementDraftRenderState(previousCommittedImageElementId);
    }
    committedImageElementIdRef.current = committedImageElementId;
  }, [clearElementDraftRenderState, committedImageElementId]);

  useEffect(() => {
    const previousDisplayedImageElementId = displayedImageElementIdRef.current;
    if (
      previousDisplayedImageElementId &&
      previousDisplayedImageElementId !== displayedImageElementId &&
      previousDisplayedImageElementId !== committedImageElementId
    ) {
      clearElementDraftRenderState(previousDisplayedImageElementId);
    }
    displayedImageElementIdRef.current = displayedImageElementId;
  }, [
    clearElementDraftRenderState,
    committedImageElementId,
    displayedImageElementId,
  ]);

  useEffect(
    () => () => {
      const currentCommittedImageElementId = committedImageElementIdRef.current;
      const currentDisplayedImageElementId = displayedImageElementIdRef.current;
      if (
        currentDisplayedImageElementId &&
        currentDisplayedImageElementId !== currentCommittedImageElementId
      ) {
        clearElementDraftRenderState(currentDisplayedImageElementId);
      }
      if (currentCommittedImageElementId) {
        clearElementDraftRenderState(currentCommittedImageElementId);
      }
    },
    [clearElementDraftRenderState]
  );

  const previewRenderState = useCallback(
    (nextRenderState: CanvasImageRenderStateV1) => {
      if (!imageElement || !nextRenderState) {
        return;
      }
      setElementDraftRenderState(imageElement.id, nextRenderState);
      void requestBoardPreview(imageElement.id, "interactive");
    },
    [imageElement, requestBoardPreview, setElementDraftRenderState]
  );

  const commitAdjustments = useCallback(
    async (nextRenderState: CanvasImageRenderStateV1) => {
      if (!imageElement || !nextRenderState) {
        return;
      }
      setElementDraftRenderState(imageElement.id, nextRenderState);
      await setRenderState(nextRenderState);
      clearElementDraftRenderState(imageElement.id);
    },
    [
      clearElementDraftRenderState,
      imageElement,
      setElementDraftRenderState,
      setRenderState,
    ]
  );

  const previewAdjustmentValue = useCallback(
    (key: NumericAdjustmentKey, value: number) => {
      if (!renderStateRef.current) {
        return;
      }
      previewRenderState(applyNumericAdjustmentToRenderState(renderStateRef.current, key, value));
    },
    [previewRenderState]
  );

  const commitAdjustmentValue = useCallback(
    (key: NumericAdjustmentKey, value: number) => {
      if (!renderStateRef.current) {
        return;
      }
      void commitAdjustments(applyNumericAdjustmentToRenderState(renderStateRef.current, key, value));
    },
    [commitAdjustments]
  );

  const resetSection = useCallback(
    (sliders: ProjectSliderDefinition[]) => {
      if (!renderStateRef.current) {
        return;
      }
      void commitAdjustments(
        resetRenderStateForAdjustmentKeys(
          renderStateRef.current,
          sliders.map((slider) => slider.key)
        )
      );
    },
    [commitAdjustments]
  );

  const lightHasChanges = hasSliderSectionChanges(adjustments, LIGHT_AND_CONTRAST_SLIDERS);
  const colorHasChanges = hasSliderSectionChanges(adjustments, COLOR_AND_WHITE_BALANCE_SLIDERS);
  const tonesHasChanges = hasSliderSectionChanges(adjustments, HIGHLIGHTS_AND_SHADOWS_SLIDERS);
  const effectsHasChanges = hasSliderSectionChanges(adjustments, EFFECTS_AND_FILTERS_SLIDERS);
  const detailHasChanges = hasSliderSectionChanges(adjustments, DETAIL_AND_GLOW_SLIDERS);
  const asciiAdjustments = adjustments.ascii ?? DEFAULT_ADJUSTMENTS.ascii!;
  const asciiHasChanges = !asciiAdjustmentsEqual(asciiAdjustments, DEFAULT_ADJUSTMENTS.ascii);

  const updateAsciiAdjustments = useCallback(
    (partial: Partial<AsciiAdjustments>, mode: "preview" | "commit" = "commit") => {
      if (!renderStateRef.current) {
        return;
      }
      const nextRenderState = applyAsciiAdjustmentsToRenderState(renderStateRef.current, partial);
      if (mode === "preview") {
        previewRenderState(nextRenderState);
        return;
      }
      void commitAdjustments(nextRenderState);
    },
    [commitAdjustments, previewRenderState]
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      {disabled ? (
        <div className="py-5">
          <p className={canvasDockBodyTextClassName}>
            {imageElement
              ? "源素材可用后，这里的图像控制就会解锁。"
              : "在画布上选择一张图片后，即可开始编辑。"}
          </p>
        </div>
      ) : (
        <ProjectEditControls
          adjustments={adjustments}
          asciiAdjustments={asciiAdjustments}
          asciiHasChanges={asciiHasChanges}
          colorHasChanges={colorHasChanges}
          commitAdjustmentValue={commitAdjustmentValue}
          detailHasChanges={detailHasChanges}
          disabled={disabled}
          effectsHasChanges={effectsHasChanges}
          lightHasChanges={lightHasChanges}
          onToggleSection={toggleSection}
          openSections={openSections}
          previewAdjustmentValue={previewAdjustmentValue}
          resetSection={resetSection}
          tonesHasChanges={tonesHasChanges}
          updateAsciiAdjustments={updateAsciiAdjustments}
        />
      )}

      {children ? <div className="mt-4 border-t border-[color:var(--canvas-edit-divider)] pt-6">{children}</div> : null}
    </section>
  );
}
