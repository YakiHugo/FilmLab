import { useCallback, useEffect, useMemo, useState } from "react";
import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import { EditorSection } from "@/features/editor/EditorSection";
import { SliderControl } from "@/features/editor/components/controls/SliderControl";
import type { NumericAdjustmentKey } from "@/features/editor/types";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { useCanvasRuntimeStore } from "@/stores/canvasRuntimeStore";
import type { EditingAdjustments } from "@/types";
import type { CanvasImageElement } from "@/types/canvas";

const DEFAULT_ADJUSTMENTS = createDefaultAdjustments();

type CanvasEditSectionId = "light" | "color" | "tones" | "effects";

interface ProjectSliderDefinition {
  key: NumericAdjustmentKey;
  label: string;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
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

const createInitialOpenSections = (): Record<CanvasEditSectionId, boolean> => ({
  light: true,
  color: true,
  tones: true,
  effects: true,
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
      onReset={() => onCommitAdjustmentValue(slider.key, Number(DEFAULT_ADJUSTMENTS[slider.key] ?? 0))}
    />
  ));

const hasSliderSectionChanges = (
  adjustments: EditingAdjustments,
  sliders: ProjectSliderDefinition[]
) =>
  sliders.some((slider) => Number(adjustments[slider.key] ?? 0) !== Number(DEFAULT_ADJUSTMENTS[slider.key] ?? 0));

const createResetPatch = (
  sliders: ProjectSliderDefinition[]
): Partial<EditingAdjustments> =>
  sliders.reduce<Partial<EditingAdjustments>>((patch, slider) => {
    patch[slider.key] = DEFAULT_ADJUSTMENTS[slider.key] as EditingAdjustments[typeof slider.key];
    return patch;
  }, {});

export function ProjectEditPanel() {
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const selectedElementIds = useCanvasStore((state) => state.selectedElementIds);
  const upsertElement = useCanvasStore((state) => state.upsertElement);
  const setElementDraftAdjustments = useCanvasRuntimeStore((state) => state.setElementDraftAdjustments);
  const clearElementDraftAdjustments = useCanvasRuntimeStore((state) => state.clearElementDraftAdjustments);
  const requestBoardPreview = useCanvasRuntimeStore((state) => state.requestBoardPreview);
  const [openSections, setOpenSections] = useState(createInitialOpenSections);

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? null,
    [documents, activeDocumentId]
  );

  const imageElement = useMemo<CanvasImageElement | null>(() => {
    if (!activeDocument) {
      return null;
    }
    for (const elementId of selectedElementIds) {
      const element = activeDocument.elements.find((candidate) => candidate.id === elementId);
      if (element?.type === "image") {
        return element;
      }
    }
    return null;
  }, [activeDocument, selectedElementIds]);

  const asset = useAssetStore((state) =>
    imageElement ? state.assets.find((candidate) => candidate.id === imageElement.assetId) ?? null : null
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
    return () => {
      if (imageElement?.id) {
        clearElementDraftAdjustments(imageElement.id);
      }
    };
  }, [clearElementDraftAdjustments, imageElement?.id]);

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
      if (!imageElement || !activeDocumentId) {
        return;
      }
      setElementDraftAdjustments(imageElement.id, nextAdjustments);
      await upsertElement(activeDocumentId, {
        ...imageElement,
        adjustments: nextAdjustments,
      });
      clearElementDraftAdjustments(imageElement.id);
      void requestBoardPreview(imageElement.id, "interactive");
    },
    [
      activeDocumentId,
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
    async (key: NumericAdjustmentKey, value: number) => {
      await commitAdjustments(
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

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
        <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">Edit</p>
        <h2 className="mt-1 font-['Syne'] text-lg text-stone-100">Image Adjustments</h2>
        {disabled ? (
          <p className="mt-2 text-xs leading-5 text-stone-500">
            Select an image element on the canvas to adjust its properties.
          </p>
        ) : (
          <p className="mt-2 text-xs leading-5 text-stone-500">
            The canvas preview and export now use the same board-side image adjustment set.
          </p>
        )}
      </section>

      <section className="flex min-h-0 flex-1 flex-col rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <EditorSection
            title="Light & Contrast"
            isOpen={openSections.light}
            onToggle={() => toggleSection("light")}
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
            onToggle={() => toggleSection("color")}
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
            onToggle={() => toggleSection("tones")}
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
            onToggle={() => toggleSection("effects")}
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
        </div>
      </section>
    </div>
  );
}
