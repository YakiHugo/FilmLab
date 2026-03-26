import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditorSection } from "@/features/editor/EditorSection";
import { SliderControl } from "@/features/editor/components/controls/SliderControl";
import type { NumericAdjustmentKey } from "@/features/editor/types";
import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import { asciiAdjustmentsEqual } from "@/lib/asciiRaster";
import { cn } from "@/lib/utils";
import {
  useCanvasElementDraftAdjustments,
  useCanvasPreviewActions,
  useCanvasRuntimeAsset,
} from "@/features/canvas/runtime/canvasRuntimeHooks";
import type { AsciiAdjustments, EditingAdjustments } from "@/types";
import {
  canvasDockBodyTextClassName,
  canvasDockSelectContentClassName,
  canvasDockSelectTriggerClassName,
} from "./editDockTheme";
import { useCanvasImagePropertyActions } from "./hooks/useCanvasImagePropertyActions";
import { useCanvasSelectionModel } from "./hooks/useCanvasSelectionModel";
import { resolvePrimarySelectedImageElement } from "./selectionModel";

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
  adjustments: EditingAdjustments;
  asciiAdjustments: AsciiAdjustments;
  asciiHasChanges: boolean;
  colorHasChanges: boolean;
  commitAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void;
  commitAdjustments: (nextAdjustments: EditingAdjustments) => void;
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
}

const formatSigned = (value: number) => (value > 0 ? `+${value}` : `${value}`);

const LIGHT_AND_CONTRAST_SLIDERS: ProjectSliderDefinition[] = [
  { key: "brightness", label: "Brightness", min: -100, max: 100, format: formatSigned },
  { key: "exposure", label: "Exposure", min: -100, max: 100, format: formatSigned },
  { key: "contrast", label: "Contrast", min: -100, max: 100, format: formatSigned },
  { key: "clarity", label: "Clarity", min: -100, max: 100, format: formatSigned },
];

const COLOR_AND_WHITE_BALANCE_SLIDERS: ProjectSliderDefinition[] = [
  { key: "temperature", label: "Temperature", min: -100, max: 100, format: formatSigned },
  { key: "tint", label: "Tint", min: -100, max: 100, format: formatSigned },
  { key: "saturation", label: "Saturation", min: -100, max: 100, format: formatSigned },
  { key: "vibrance", label: "Vibrance", min: -100, max: 100, format: formatSigned },
  { key: "hue", label: "Hue", min: -100, max: 100, format: formatSigned },
];

const HIGHLIGHTS_AND_SHADOWS_SLIDERS: ProjectSliderDefinition[] = [
  { key: "highlights", label: "Highlights", min: -100, max: 100, format: formatSigned },
  { key: "shadows", label: "Shadows", min: -100, max: 100, format: formatSigned },
  { key: "whites", label: "White Level", min: -100, max: 100, format: formatSigned },
  { key: "blacks", label: "Black Level", min: -100, max: 100, format: formatSigned },
];

const EFFECTS_AND_FILTERS_SLIDERS: ProjectSliderDefinition[] = [
  { key: "texture", label: "Texture", min: -100, max: 100, format: formatSigned },
  { key: "dehaze", label: "Dehaze", min: -100, max: 100, format: formatSigned },
  { key: "vignette", label: "Vignette", min: -100, max: 100, format: formatSigned },
  { key: "grain", label: "Grain", min: 0, max: 100 },
  { key: "grainSize", label: "Grain Size", min: 0, max: 100 },
  { key: "grainRoughness", label: "Grain Roughness", min: 0, max: 100 },
  { key: "blur", label: "Blur", min: 0, max: 100 },
  { key: "dilate", label: "Dilate", min: 0, max: 100 },
];

const DETAIL_AND_GLOW_SLIDERS: ProjectSliderDefinition[] = [
  { key: "sharpening", label: "Sharpening", min: 0, max: 100 },
  { key: "sharpenRadius", label: "Sharpen Radius", min: 0, max: 100 },
  { key: "sharpenDetail", label: "Sharpen Detail", min: 0, max: 100 },
  { key: "masking", label: "Masking", min: 0, max: 100 },
  { key: "noiseReduction", label: "Noise Reduction", min: 0, max: 100 },
  { key: "colorNoiseReduction", label: "Color Noise", min: 0, max: 100 },
  { key: "glowIntensity", label: "Glow Intensity", min: 0, max: 100 },
  { key: "glowMidtoneFocus", label: "Glow Midtone Focus", min: 0, max: 100 },
  { key: "glowBias", label: "Glow Bias", min: 0, max: 100 },
  { key: "glowRadius", label: "Glow Radius", min: 0, max: 100 },
];

const ASCII_CHARSET_OPTIONS: Array<{
  label: string;
  value: AsciiAdjustments["charsetPreset"];
}> = [
  { label: "Standard", value: "standard" },
  { label: "Blocks", value: "blocks" },
  { label: "Detailed", value: "detailed" },
];

const ASCII_COLOR_MODE_OPTIONS: Array<{
  label: string;
  value: AsciiAdjustments["colorMode"];
}> = [
  { label: "Grayscale", value: "grayscale" },
  { label: "Full Color", value: "full-color" },
];

const ASCII_DITHER_OPTIONS: Array<{
  label: string;
  value: AsciiAdjustments["dither"];
}> = [
  { label: "None", value: "none" },
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
  adjustments: EditingAdjustments,
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
  adjustments: EditingAdjustments,
  sliders: ProjectSliderDefinition[]
) =>
  sliders.some(
    (slider) =>
      Number(adjustments[slider.key] ?? 0) !== Number(DEFAULT_ADJUSTMENTS[slider.key] ?? 0)
  );

const createResetPatch = (sliders: ProjectSliderDefinition[]): Partial<EditingAdjustments> =>
  sliders.reduce<Partial<EditingAdjustments>>((patch, slider) => {
    patch[slider.key] = DEFAULT_ADJUSTMENTS[slider.key] as EditingAdjustments[typeof slider.key];
    return patch;
  }, {});

const ProjectEditControls = memo(function ProjectEditControls({
  adjustments,
  asciiAdjustments,
  asciiHasChanges,
  colorHasChanges,
  commitAdjustmentValue,
  commitAdjustments,
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
      <EditorSection
        variant="canvasDock"
        title="Light & Contrast"
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
      </EditorSection>

      <EditorSection
        variant="canvasDock"
        title="Color & White Balance"
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
      </EditorSection>

      <EditorSection
        variant="canvasDock"
        title="Highlights and Shadows"
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
      </EditorSection>

      <EditorSection
        variant="canvasDock"
        title="Effects & Filters"
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
      </EditorSection>

      <EditorSection
        variant="canvasDock"
        title="Detail & Glow"
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
      </EditorSection>

      <EditorSection
        variant="canvasDock"
        title="ASCII Raster"
        isOpen={openSections.ascii}
        onToggle={() => onToggleSection("ascii")}
        hasChanges={asciiHasChanges}
        canResetChanges={asciiHasChanges}
        onResetChanges={() =>
          commitAdjustments(
            normalizeAdjustments({
              ...adjustments,
              ascii: { ...DEFAULT_ADJUSTMENTS.ascii! },
            })
          )
        }
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
              {asciiAdjustments.enabled ? "ASCII On" : "ASCII Off"}
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
              Invert
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
                <SelectValue placeholder="Character set" />
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
                <SelectValue placeholder="Color mode" />
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
                <SelectValue placeholder="Dither" />
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
            label="Cell Size"
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
            label="Character Spacing"
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
            label="ASCII Contrast"
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
      </EditorSection>
    </section>
  );
});

export function CanvasImageEditPanel({ children }: CanvasImageEditPanelProps) {
  const {
    clearElementDraftAdjustments,
    requestBoardPreview,
    setElementDraftAdjustments,
  } = useCanvasPreviewActions();
  const [openSections, setOpenSections] = useState(createInitialOpenSections);
  const { activeWorkbench, committedSelectedElementIds, primarySelectedImageElement: imageElement } =
    useCanvasSelectionModel();
  const { setAdjustments } = useCanvasImagePropertyActions(imageElement);

  const committedImageElement = useMemo(
    () => resolvePrimarySelectedImageElement(activeWorkbench, committedSelectedElementIds),
    [activeWorkbench, committedSelectedElementIds]
  );
  const displayedImageElementId = imageElement?.id ?? null;
  const committedImageElementId = committedImageElement?.id ?? null;
  const committedImageElementIdRef = useRef<string | null>(committedImageElementId);
  const displayedImageElementIdRef = useRef<string | null>(displayedImageElementId);
  const { asset } = useCanvasRuntimeAsset(imageElement?.assetId ?? null);
  const draftAdjustments = useCanvasElementDraftAdjustments(imageElement?.id ?? null);

  const adjustments = useMemo(
    () =>
      normalizeAdjustments(
        draftAdjustments ?? imageElement?.adjustments ?? asset?.adjustments ?? DEFAULT_ADJUSTMENTS
      ),
    [asset?.adjustments, draftAdjustments, imageElement?.adjustments]
  );
  const disabled = !imageElement;
  const adjustmentsRef = useRef(adjustments);
  adjustmentsRef.current = adjustments;

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
      clearElementDraftAdjustments(previousCommittedImageElementId);
    }
    committedImageElementIdRef.current = committedImageElementId;
  }, [clearElementDraftAdjustments, committedImageElementId]);

  useEffect(() => {
    const previousDisplayedImageElementId = displayedImageElementIdRef.current;
    if (
      previousDisplayedImageElementId &&
      previousDisplayedImageElementId !== displayedImageElementId &&
      previousDisplayedImageElementId !== committedImageElementId
    ) {
      clearElementDraftAdjustments(previousDisplayedImageElementId);
    }
    displayedImageElementIdRef.current = displayedImageElementId;
  }, [
    clearElementDraftAdjustments,
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
        clearElementDraftAdjustments(currentDisplayedImageElementId);
      }
      if (currentCommittedImageElementId) {
        clearElementDraftAdjustments(currentCommittedImageElementId);
      }
    },
    [clearElementDraftAdjustments]
  );

  const previewAdjustments = useCallback(
    (nextAdjustments: EditingAdjustments) => {
      if (!imageElement) {
        return;
      }
      setElementDraftAdjustments(imageElement.id, nextAdjustments);
      void requestBoardPreview(imageElement.id, "interactive");
    },
    [imageElement, requestBoardPreview, setElementDraftAdjustments]
  );

  const commitAdjustments = useCallback(
    async (nextAdjustments: EditingAdjustments) => {
      if (!imageElement) {
        return;
      }
      setElementDraftAdjustments(imageElement.id, nextAdjustments);
      await setAdjustments(nextAdjustments);
      clearElementDraftAdjustments(imageElement.id);
    },
    [
      clearElementDraftAdjustments,
      imageElement,
      setElementDraftAdjustments,
      setAdjustments,
    ]
  );

  const previewAdjustmentValue = useCallback(
    (key: NumericAdjustmentKey, value: number) => {
      previewAdjustments(
        normalizeAdjustments({
          ...adjustmentsRef.current,
          [key]: value,
        })
      );
    },
    [previewAdjustments]
  );

  const commitAdjustmentValue = useCallback(
    (key: NumericAdjustmentKey, value: number) => {
      void commitAdjustments(
        normalizeAdjustments({
          ...adjustmentsRef.current,
          [key]: value,
        })
      );
    },
    [commitAdjustments]
  );

  const resetSection = useCallback(
    (sliders: ProjectSliderDefinition[]) => {
      void commitAdjustments(
        normalizeAdjustments({
          ...adjustmentsRef.current,
          ...createResetPatch(sliders),
        })
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
      const currentAdjustments = adjustmentsRef.current;
      const currentAsciiAdjustments = currentAdjustments.ascii ?? DEFAULT_ADJUSTMENTS.ascii!;
      const nextAdjustments = normalizeAdjustments({
        ...currentAdjustments,
        ascii: {
          ...currentAsciiAdjustments,
          ...partial,
        },
      });
      if (mode === "preview") {
        previewAdjustments(nextAdjustments);
        return;
      }
      void commitAdjustments(nextAdjustments);
    },
    [commitAdjustments, previewAdjustments]
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      {disabled ? (
        <div className="py-5">
          <p className={canvasDockBodyTextClassName}>
            Select an image on the canvas to start editing.
          </p>
        </div>
      ) : (
        <ProjectEditControls
          adjustments={adjustments}
          asciiAdjustments={asciiAdjustments}
          asciiHasChanges={asciiHasChanges}
          colorHasChanges={colorHasChanges}
          commitAdjustmentValue={commitAdjustmentValue}
          commitAdjustments={commitAdjustments}
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
