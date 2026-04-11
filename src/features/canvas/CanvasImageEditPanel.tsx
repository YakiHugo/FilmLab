import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CanvasEditSection } from "@/features/canvas/components/CanvasEditSection";
import { SliderControl } from "@/features/canvas/components/controls/SliderControl";
import type { CanvasImageNumericFieldId } from "@/features/canvas/imageAdjustmentTypes";
import {
  useCanvasElementDraftRenderState,
  useCanvasPreviewActions,
} from "@/features/canvas/runtime/canvasRuntimeHooks";
import { resolveCanvasImageRenderState } from "@/features/canvas/imageRenderState";
import type { CanvasImageRenderStateV1 } from "@/render/image";
import { canvasDockBodyTextClassName } from "./editDockTheme";
import type { CanvasImageEditTarget } from "./editPanelSelection";
import {
  applyNumericFieldToRenderState,
  type CanvasImageEditValues,
  DEFAULT_CANVAS_IMAGE_EDIT_VALUES,
  getCanvasImageEditValues,
  resetRenderStateForNumericFields,
} from "./imageRenderStateEditing";
import { useCanvasImagePropertyActions } from "./hooks/useCanvasImagePropertyActions";

type CanvasEditSectionId = "light" | "color" | "tones" | "effects" | "detail";

interface ProjectSliderDefinition {
  key: CanvasImageNumericFieldId;
  label: string;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}

interface ProjectEditControlsProps {
  fieldValues: CanvasImageEditValues;
  colorHasChanges: boolean;
  commitFieldValue: (fieldId: CanvasImageNumericFieldId, value: number) => void;
  detailHasChanges: boolean;
  disabled: boolean;
  effectsHasChanges: boolean;
  lightHasChanges: boolean;
  onToggleSection: (sectionId: CanvasEditSectionId) => void;
  openSections: Record<CanvasEditSectionId, boolean>;
  previewFieldValue: (fieldId: CanvasImageNumericFieldId, value: number) => void;
  resetSection: (sliders: ProjectSliderDefinition[]) => void;
  tonesHasChanges: boolean;
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

const createInitialOpenSections = (): Record<CanvasEditSectionId, boolean> => ({
  light: true,
  color: true,
  tones: true,
  effects: true,
  detail: false,
});

const sliderToneForKey = (key: CanvasImageNumericFieldId) =>
  key === "temperature" ? "temperature" : key === "tint" ? "tint" : "neutral";

interface ProjectSliderRowProps {
  fieldId: CanvasImageNumericFieldId;
  format?: ProjectSliderDefinition["format"];
  label: string;
  max: number;
  min: number;
  onCommitFieldValue: (fieldId: CanvasImageNumericFieldId, value: number) => void;
  onPreviewFieldValue: (fieldId: CanvasImageNumericFieldId, value: number) => void;
  step?: number;
  value: number;
}

const ProjectSliderRow = memo(function ProjectSliderRow({
  fieldId,
  label,
  min,
  max,
  step,
  format,
  onCommitFieldValue,
  onPreviewFieldValue,
  value,
}: ProjectSliderRowProps) {
  const defaultValue = Number(DEFAULT_CANVAS_IMAGE_EDIT_VALUES[fieldId]);

  const handleChange = useCallback(
    (nextValue: number) => {
      onPreviewFieldValue(fieldId, nextValue);
    },
    [fieldId, onPreviewFieldValue]
  );

  const handleCommit = useCallback(
    (nextValue: number) => {
      onCommitFieldValue(fieldId, nextValue);
    },
    [fieldId, onCommitFieldValue]
  );

  const handleReset = useCallback(() => {
    onCommitFieldValue(fieldId, defaultValue);
  }, [defaultValue, fieldId, onCommitFieldValue]);

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
      tone={sliderToneForKey(fieldId)}
      onChange={handleChange}
      onCommit={handleCommit}
      onReset={handleReset}
    />
  );
});

const renderSliderRows = (
  fieldValues: CanvasImageEditValues,
  sliders: ProjectSliderDefinition[],
  onPreviewFieldValue: (fieldId: CanvasImageNumericFieldId, value: number) => void,
  onCommitFieldValue: (fieldId: CanvasImageNumericFieldId, value: number) => void
) =>
  sliders.map((slider) => (
    <ProjectSliderRow
      key={slider.key}
      fieldId={slider.key}
      label={slider.label}
      min={slider.min}
      max={slider.max}
      step={slider.step}
      format={slider.format}
      value={Number(fieldValues[slider.key] ?? 0)}
      onPreviewFieldValue={onPreviewFieldValue}
      onCommitFieldValue={onCommitFieldValue}
    />
  ));

const hasSliderSectionChanges = (
  fieldValues: CanvasImageEditValues,
  sliders: ProjectSliderDefinition[]
) =>
  sliders.some(
    (slider) =>
      Number(fieldValues[slider.key] ?? 0) !==
      Number(DEFAULT_CANVAS_IMAGE_EDIT_VALUES[slider.key])
  );

const ProjectEditControls = memo(function ProjectEditControls({
  fieldValues,
  colorHasChanges,
  commitFieldValue,
  detailHasChanges,
  disabled: _disabled,
  effectsHasChanges,
  lightHasChanges,
  onToggleSection,
  openSections,
  previewFieldValue,
  resetSection,
  tonesHasChanges,
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
          fieldValues,
          LIGHT_AND_CONTRAST_SLIDERS,
          previewFieldValue,
          commitFieldValue
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
          fieldValues,
          COLOR_AND_WHITE_BALANCE_SLIDERS,
          previewFieldValue,
          commitFieldValue
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
          fieldValues,
          HIGHLIGHTS_AND_SHADOWS_SLIDERS,
          previewFieldValue,
          commitFieldValue
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
          fieldValues,
          EFFECTS_AND_FILTERS_SLIDERS,
          previewFieldValue,
          commitFieldValue
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
          fieldValues,
          DETAIL_AND_GLOW_SLIDERS,
          previewFieldValue,
          commitFieldValue
        )}
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
        ? resolveCanvasImageRenderState(imageElement, draftRenderState)
        : null,
    [draftRenderState, imageElement]
  );
  const fieldValues = useMemo(
    () => (renderState ? getCanvasImageEditValues(renderState) : DEFAULT_CANVAS_IMAGE_EDIT_VALUES),
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

  const previewFieldValue = useCallback(
    (fieldId: CanvasImageNumericFieldId, value: number) => {
      if (!renderStateRef.current) {
        return;
      }
      previewRenderState(applyNumericFieldToRenderState(renderStateRef.current, fieldId, value));
    },
    [previewRenderState]
  );

  const commitFieldValue = useCallback(
    (fieldId: CanvasImageNumericFieldId, value: number) => {
      if (!renderStateRef.current) {
        return;
      }
      void commitAdjustments(applyNumericFieldToRenderState(renderStateRef.current, fieldId, value));
    },
    [commitAdjustments]
  );

  const resetSection = useCallback(
    (sliders: ProjectSliderDefinition[]) => {
      if (!renderStateRef.current) {
        return;
      }
      void commitAdjustments(
        resetRenderStateForNumericFields(
          renderStateRef.current,
          sliders.map((slider) => slider.key)
        )
      );
    },
    [commitAdjustments]
  );

  const lightHasChanges = hasSliderSectionChanges(fieldValues, LIGHT_AND_CONTRAST_SLIDERS);
  const colorHasChanges = hasSliderSectionChanges(fieldValues, COLOR_AND_WHITE_BALANCE_SLIDERS);
  const tonesHasChanges = hasSliderSectionChanges(fieldValues, HIGHLIGHTS_AND_SHADOWS_SLIDERS);
  const effectsHasChanges = hasSliderSectionChanges(fieldValues, EFFECTS_AND_FILTERS_SLIDERS);
  const detailHasChanges = hasSliderSectionChanges(fieldValues, DETAIL_AND_GLOW_SLIDERS);

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
          fieldValues={fieldValues}
          colorHasChanges={colorHasChanges}
          commitFieldValue={commitFieldValue}
          detailHasChanges={detailHasChanges}
          disabled={disabled}
          effectsHasChanges={effectsHasChanges}
          lightHasChanges={lightHasChanges}
          onToggleSection={toggleSection}
          openSections={openSections}
          previewFieldValue={previewFieldValue}
          resetSection={resetSection}
          tonesHasChanges={tonesHasChanges}
        />
      )}

      {children ? <div className="mt-4 border-t border-[color:var(--canvas-edit-divider)] pt-6">{children}</div> : null}
    </section>
  );
}
