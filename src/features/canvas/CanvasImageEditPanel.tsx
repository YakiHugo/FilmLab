import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasRuntimeStore } from "@/stores/canvasRuntimeStore";
import { useCanvasStore } from "@/stores/canvasStore";
import type { AsciiAdjustments, EditingAdjustments } from "@/types";
import { useCanvasSelectionModel } from "./hooks/useCanvasSelectionModel";
import { resolvePrimarySelectedImageElement } from "./selectionModel";

const DEFAULT_ADJUSTMENTS = createDefaultAdjustments();

type CanvasEditSectionId = "light" | "color" | "tones" | "effects" | "ascii";

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
  { key: "grain", label: "Grain", min: 0, max: 100 },
  { key: "blur", label: "Blur", min: 0, max: 100 },
  { key: "dilate", label: "Dilate", min: 0, max: 100 },
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
  ascii: false,
});

const renderSliderRows = (
  adjustments: EditingAdjustments,
  sliders: ProjectSliderDefinition[],
  onPreviewAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void,
  onCommitAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void
) =>
  sliders.map((slider) => (
    <SliderControl
      key={slider.key}
      label={slider.label}
      value={Number(adjustments[slider.key] ?? 0)}
      defaultValue={Number(DEFAULT_ADJUSTMENTS[slider.key] ?? 0)}
      min={slider.min}
      max={slider.max}
      step={slider.step}
      format={slider.format}
      onChange={(value) => onPreviewAdjustmentValue(slider.key, value)}
      onCommit={(value) => onCommitAdjustmentValue(slider.key, value)}
      onReset={() =>
        onCommitAdjustmentValue(slider.key, Number(DEFAULT_ADJUSTMENTS[slider.key] ?? 0))
      }
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
    <section className="flex min-h-0 flex-1 flex-col rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <EditorSection
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
            (key, value) => void commitAdjustmentValue(key, value)
          )}
        </EditorSection>

        <EditorSection
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
            (key, value) => void commitAdjustmentValue(key, value)
          )}
        </EditorSection>

        <EditorSection
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
            (key, value) => void commitAdjustmentValue(key, value)
          )}
        </EditorSection>

        <EditorSection
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
            (key, value) => void commitAdjustmentValue(key, value)
          )}
        </EditorSection>

        <EditorSection
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
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={asciiAdjustments.enabled ? "default" : "secondary"}
                size="sm"
                onClick={() => updateAsciiAdjustments({ enabled: !asciiAdjustments.enabled })}
              >
                {asciiAdjustments.enabled ? "ASCII On" : "ASCII Off"}
              </Button>
              <Button
                type="button"
                variant={asciiAdjustments.invert ? "default" : "secondary"}
                size="sm"
                disabled={!asciiAdjustments.enabled || disabled}
                onClick={() => updateAsciiAdjustments({ invert: !asciiAdjustments.invert })}
              >
                Invert
              </Button>
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
                <SelectTrigger className="h-10 rounded-2xl border-white/10 bg-black/35 text-sm">
                  <SelectValue placeholder="Character set" />
                </SelectTrigger>
                <SelectContent>
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
                <SelectTrigger className="h-10 rounded-2xl border-white/10 bg-black/35 text-sm">
                  <SelectValue placeholder="Color mode" />
                </SelectTrigger>
                <SelectContent>
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
                <SelectTrigger className="h-10 rounded-2xl border-white/10 bg-black/35 text-sm">
                  <SelectValue placeholder="Dither" />
                </SelectTrigger>
                <SelectContent>
                  {ASCII_DITHER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <SliderControl
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
      </div>
    </section>
  );
});

export function CanvasImageEditPanel() {
  const upsertElement = useCanvasStore((state) => state.upsertElement);
  const setElementDraftAdjustments = useCanvasRuntimeStore(
    (state) => state.setElementDraftAdjustments
  );
  const clearElementDraftAdjustments = useCanvasRuntimeStore(
    (state) => state.clearElementDraftAdjustments
  );
  const requestBoardPreview = useCanvasRuntimeStore((state) => state.requestBoardPreview);
  const [openSections, setOpenSections] = useState(createInitialOpenSections);
  const { activeWorkbench, committedSelectedElementIds, primarySelectedImageElement: imageElement } =
    useCanvasSelectionModel();

  const committedImageElement = useMemo(
    () => resolvePrimarySelectedImageElement(activeWorkbench, committedSelectedElementIds),
    [activeWorkbench, committedSelectedElementIds]
  );
  const committedImageElementId = committedImageElement?.id ?? null;
  const committedImageElementIdRef = useRef<string | null>(committedImageElementId);

  const asset = useAssetStore((state) =>
    imageElement
      ? (state.assets.find((candidate) => candidate.id === imageElement.assetId) ?? null)
      : null
  );

  const draftAdjustments = useCanvasRuntimeStore((state) =>
    imageElement ? state.draftAdjustmentsByElementId[imageElement.id] : undefined
  );

  const adjustments = useMemo(
    () =>
      normalizeAdjustments(
        draftAdjustments ?? imageElement?.adjustments ?? asset?.adjustments ?? DEFAULT_ADJUSTMENTS
      ),
    [asset?.adjustments, draftAdjustments, imageElement?.adjustments]
  );
  const disabled = !imageElement;

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

  useEffect(
    () => () => {
      const currentCommittedImageElementId = committedImageElementIdRef.current;
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
      await upsertElement({
        ...imageElement,
        adjustments: nextAdjustments,
      });
      clearElementDraftAdjustments(imageElement.id);
      void requestBoardPreview(imageElement.id, "interactive");
    },
    [
      clearElementDraftAdjustments,
      imageElement,
      requestBoardPreview,
      setElementDraftAdjustments,
      upsertElement,
    ]
  );

  const previewAdjustmentValue = useCallback(
    (key: NumericAdjustmentKey, value: number) => {
      previewAdjustments(
        normalizeAdjustments({
          ...adjustments,
          [key]: value,
        })
      );
    },
    [adjustments, previewAdjustments]
  );

  const commitAdjustmentValue = useCallback(
    (key: NumericAdjustmentKey, value: number) => {
      void commitAdjustments(
        normalizeAdjustments({
          ...adjustments,
          [key]: value,
        })
      );
    },
    [adjustments, commitAdjustments]
  );

  const resetSection = useCallback(
    (sliders: ProjectSliderDefinition[]) => {
      void commitAdjustments(
        normalizeAdjustments({
          ...adjustments,
          ...createResetPatch(sliders),
        })
      );
    },
    [adjustments, commitAdjustments]
  );

  const lightHasChanges = hasSliderSectionChanges(adjustments, LIGHT_AND_CONTRAST_SLIDERS);
  const colorHasChanges = hasSliderSectionChanges(adjustments, COLOR_AND_WHITE_BALANCE_SLIDERS);
  const tonesHasChanges = hasSliderSectionChanges(adjustments, HIGHLIGHTS_AND_SHADOWS_SLIDERS);
  const effectsHasChanges = hasSliderSectionChanges(adjustments, EFFECTS_AND_FILTERS_SLIDERS);
  const asciiAdjustments = adjustments.ascii ?? DEFAULT_ADJUSTMENTS.ascii!;
  const asciiHasChanges = !asciiAdjustmentsEqual(asciiAdjustments, DEFAULT_ADJUSTMENTS.ascii);

  const updateAsciiAdjustments = useCallback(
    (partial: Partial<AsciiAdjustments>, mode: "preview" | "commit" = "commit") => {
      const nextAdjustments = normalizeAdjustments({
        ...adjustments,
        ascii: {
          ...asciiAdjustments,
          ...partial,
        },
      });
      if (mode === "preview") {
        previewAdjustments(nextAdjustments);
        return;
      }
      void commitAdjustments(nextAdjustments);
    },
    [adjustments, asciiAdjustments, commitAdjustments, previewAdjustments]
  );

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
        <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">编辑</p>
        <h2 className="mt-1 font-['Syne'] text-lg text-stone-100">图像调整</h2>
        {disabled ? (
          <p className="mt-2 text-xs leading-5 text-stone-500">
            先在画布上选中一个图片元素，再调整它的参数。
          </p>
        ) : (
          <>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              画布预览和导出现在共用同一套工作台侧图像调整参数。
            </p>
            <p className="mt-2 truncate text-xs uppercase tracking-[0.18em] text-stone-400">
              {asset?.name ?? imageElement.assetId}
            </p>
          </>
        )}
      </section>

      <ProjectEditControls
        adjustments={adjustments}
        asciiAdjustments={asciiAdjustments}
        asciiHasChanges={asciiHasChanges}
        colorHasChanges={colorHasChanges}
        commitAdjustmentValue={commitAdjustmentValue}
        commitAdjustments={(nextAdjustments) => {
          void commitAdjustments(nextAdjustments);
        }}
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
    </div>
  );
}
