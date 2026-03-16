import { useCallback, useMemo } from "react";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { PROJECT_EDIT_SLIDERS } from "@/features/editor/editorPanelConfig";
import { EditorSliderRow } from "@/features/editor/EditorSliderRow";
import { useCanvasStore } from "@/stores/canvasStore";
import type { NumericAdjustmentKey } from "@/features/editor/types";
import type { CanvasImageElement } from "@/types/canvas";

const defaults = createDefaultAdjustments();

export function ProjectEditPanel() {
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const selectedElementIds = useCanvasStore((state) => state.selectedElementIds);
  const upsertElement = useCanvasStore((state) => state.upsertElement);

  const activeDocument = useMemo(
    () => documents.find((d) => d.id === activeDocumentId) ?? null,
    [documents, activeDocumentId],
  );

  const imageElement = useMemo<CanvasImageElement | null>(() => {
    if (!activeDocument) return null;
    for (const id of selectedElementIds) {
      const el = activeDocument.elements.find((e) => e.id === id);
      if (el?.type === "image") return el;
    }
    return null;
  }, [activeDocument, selectedElementIds]);

  const adjustments = imageElement?.adjustments ?? defaults;
  const disabled = !imageElement;

  const handleChange = useCallback(
    (key: NumericAdjustmentKey, value: number) => {
      if (!imageElement || !activeDocumentId) return;
      const next = { ...imageElement, adjustments: { ...adjustments, [key]: value } };
      void upsertElement(activeDocumentId, next);
    },
    [imageElement, activeDocumentId, adjustments, upsertElement],
  );

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
        <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">Edit</p>
        <h2 className="mt-1 font-['Syne'] text-lg text-stone-100">Image Adjustments</h2>
        {disabled && (
          <p className="mt-2 text-xs leading-5 text-stone-500">
            Select an image element on the canvas to adjust its properties.
          </p>
        )}
      </section>

      <section className="flex min-h-0 flex-1 flex-col rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {PROJECT_EDIT_SLIDERS.map((slider) => (
            <EditorSliderRow
              key={slider.key}
              label={slider.label}
              value={adjustments[slider.key] as number}
              min={slider.min}
              max={slider.max}
              step={slider.step}
              format={slider.format}
              disabled={disabled}
              onChange={(v) => handleChange(slider.key, v)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
