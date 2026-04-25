import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanvasEditSection } from "@/features/canvas/components/CanvasEditSection";
import { SliderControl } from "@/features/canvas/components/controls/SliderControl";
import { cn } from "@/lib/utils";
import {
  useCanvasElementDraftRenderState,
  useCanvasPreviewActions,
} from "@/features/canvas/runtime/canvasRuntimeHooks";
import { resolveCanvasImageRenderState } from "@/features/canvas/imageRenderState";
import type { CanvasImageRenderStateV1 } from "@/render/image";
import type { WatermarkAdjustments } from "@/types";
import { useCanvasStore } from "@/stores/canvasStore";
import { canvasDockBodyTextClassName } from "./editDockTheme";
import {
  canvasEditTargetEqual,
  resolveCanvasEditTargetFromPrimarySelection,
  type CanvasImageEditTarget,
} from "./editPanelSelection";
import { selectLoadedWorkbench } from "./store/canvasStoreSelectors";
import {
  applyWatermarkAdjustmentsToRenderState,
  DEFAULT_CANVAS_WATERMARK_ADJUSTMENTS,
  getCanvasImageEditValues,
} from "./imageRenderStateEditing";
import { useCanvasImagePropertyActions } from "./hooks/useCanvasImagePropertyActions";

type WatermarkSectionId = "text" | "appearance";

type WatermarkNumericKey = "opacity" | "fontSize" | "angle" | "density";

const formatAngle = (value: number) => `${Math.round(value)}°`;
const formatDensity = (value: number) => value.toFixed(1);

interface WatermarkSliderDef {
  key: WatermarkNumericKey;
  label: string;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}

const APPEARANCE_SLIDERS: WatermarkSliderDef[] = [
  { key: "fontSize", label: "Font Size", min: 12, max: 120, step: 1 },
  { key: "angle", label: "Angle", min: -90, max: 90, step: 1, format: formatAngle },
  { key: "density", label: "Density", min: 0.5, max: 5, step: 0.1, format: formatDensity },
  { key: "opacity", label: "Opacity", min: 0, max: 100, step: 1 },
];

function useCanvasEditImageTarget(): CanvasImageEditTarget | null {
  const primarySelectedElementId = useCanvasStore(
    (state) => state.selectedElementIds[0] ?? null
  );
  const selectEditTarget = useCallback(
    (state: Parameters<typeof selectLoadedWorkbench>[0]) => {
      const target = resolveCanvasEditTargetFromPrimarySelection(
        selectLoadedWorkbench(state),
        primarySelectedElementId
      );
      return target?.type === "image" ? target : null;
    },
    [primarySelectedElementId]
  );
  return useCanvasStore(selectEditTarget, canvasEditTargetEqual);
}

export function CanvasWatermarkEditPanel() {
  const imageElement = useCanvasEditImageTarget();

  if (!imageElement) {
    return (
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
        <div className="py-5">
          <p className={canvasDockBodyTextClassName}>
            Select an image on the canvas to add a watermark overlay.
          </p>
        </div>
      </section>
    );
  }

  return <CanvasWatermarkEditPanelForImage imageElement={imageElement} />;
}

function CanvasWatermarkEditPanelForImage({
  imageElement,
}: {
  imageElement: CanvasImageEditTarget;
}) {
  const {
    clearElementDraftRenderState,
    requestBoardPreview,
    setElementDraftRenderState,
  } = useCanvasPreviewActions();
  const { setRenderState } = useCanvasImagePropertyActions(imageElement);
  const [openSections, setOpenSections] = useState<Record<WatermarkSectionId, boolean>>(() => ({
    text: true,
    appearance: true,
  }));

  const committedImageElementId = imageElement.id;
  const committedImageElementIdRef = useRef<string | null>(committedImageElementId);
  const draftRenderState = useCanvasElementDraftRenderState(committedImageElementId);

  const renderState = useMemo(
    () => resolveCanvasImageRenderState(imageElement, draftRenderState),
    [draftRenderState, imageElement]
  );
  const fieldValues = useMemo(() => getCanvasImageEditValues(renderState), [renderState]);
  const renderStateRef = useRef<CanvasImageRenderStateV1 | null>(renderState);
  renderStateRef.current = renderState;

  useEffect(() => {
    const previous = committedImageElementIdRef.current;
    if (previous && previous !== committedImageElementId) {
      clearElementDraftRenderState(previous);
    }
    committedImageElementIdRef.current = committedImageElementId;
  }, [clearElementDraftRenderState, committedImageElementId]);

  useEffect(
    () => () => {
      const current = committedImageElementIdRef.current;
      if (current) {
        clearElementDraftRenderState(current);
      }
    },
    [clearElementDraftRenderState]
  );

  const previewRenderState = useCallback(
    (nextRenderState: CanvasImageRenderStateV1) => {
      setElementDraftRenderState(imageElement.id, nextRenderState);
      void requestBoardPreview(imageElement.id, "interactive");
    },
    [imageElement.id, requestBoardPreview, setElementDraftRenderState]
  );

  const commitAdjustments = useCallback(
    async (nextRenderState: CanvasImageRenderStateV1) => {
      setElementDraftRenderState(imageElement.id, nextRenderState);
      await setRenderState(nextRenderState);
      clearElementDraftRenderState(imageElement.id);
    },
    [
      clearElementDraftRenderState,
      imageElement.id,
      setElementDraftRenderState,
      setRenderState,
    ]
  );

  const toggleSection = useCallback((sectionId: WatermarkSectionId) => {
    setOpenSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }, []);

  const watermarkAdjustments = fieldValues.watermark ?? DEFAULT_CANVAS_WATERMARK_ADJUSTMENTS;
  const watermarkEnabled = watermarkAdjustments.enabled;

  const updateWatermarkAdjustments = useCallback(
    (partial: Partial<WatermarkAdjustments>, mode: "preview" | "commit" = "commit") => {
      const nextRenderState = applyWatermarkAdjustmentsToRenderState(
        renderStateRef.current!,
        partial
      );
      if (mode === "preview") {
        previewRenderState(nextRenderState);
      } else {
        void commitAdjustments(nextRenderState);
      }
    },
    [commitAdjustments, previewRenderState]
  );

  const renderSlider = (slider: WatermarkSliderDef) => (
    <SliderControl
      key={slider.key}
      variant="canvasDock"
      label={slider.label}
      value={watermarkAdjustments[slider.key]}
      defaultValue={DEFAULT_CANVAS_WATERMARK_ADJUSTMENTS[slider.key]}
      min={slider.min}
      max={slider.max}
      step={slider.step}
      format={slider.format}
      disabled={!watermarkEnabled}
      onChange={(value: number) => updateWatermarkAdjustments({ [slider.key]: value }, "preview")}
      onCommit={(value: number) => updateWatermarkAdjustments({ [slider.key]: value })}
    />
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      <div>
        <CanvasEditSection
          variant="canvasDock"
          title="Watermark"
          isOpen={openSections.text}
          onToggle={() => toggleSection("text")}
          canResetChanges
          onResetChanges={() =>
            updateWatermarkAdjustments({ ...DEFAULT_CANVAS_WATERMARK_ADJUSTMENTS })
          }
        >
          <div className="space-y-4">
            <button
              type="button"
              className={cn(
                "h-10 w-full rounded-[8px] border border-[color:var(--canvas-edit-border)] px-3 text-sm font-medium transition",
                watermarkEnabled
                  ? "bg-[color:var(--canvas-edit-text)] text-black hover:bg-white"
                  : "bg-[color:var(--canvas-edit-surface)] text-[color:var(--canvas-edit-text-muted)] hover:text-[color:var(--canvas-edit-text)]"
              )}
              onClick={() => updateWatermarkAdjustments({ enabled: !watermarkEnabled })}
            >
              {watermarkEnabled ? "ON" : "OFF"}
            </button>
            <div className="space-y-1">
              <span className={canvasDockBodyTextClassName}>Text</span>
              <input
                type="text"
                value={watermarkAdjustments.text}
                onChange={(e) =>
                  updateWatermarkAdjustments({ text: e.target.value }, "preview")
                }
                onBlur={(e) => updateWatermarkAdjustments({ text: e.target.value })}
                disabled={!watermarkEnabled}
                placeholder="DRAFT"
                className={cn(
                  "h-10 w-full rounded-[8px] border border-[color:var(--canvas-edit-border)] bg-[color:var(--canvas-edit-surface)] px-3 text-sm text-[color:var(--canvas-edit-text)] placeholder:text-[color:var(--canvas-edit-text-muted)]",
                  !watermarkEnabled && "opacity-50"
                )}
              />
            </div>
          </div>
        </CanvasEditSection>

        <CanvasEditSection
          variant="canvasDock"
          title="Appearance"
          isOpen={openSections.appearance}
          onToggle={() => toggleSection("appearance")}
        >
          <div className="space-y-2">
            {APPEARANCE_SLIDERS.map(renderSlider)}
          </div>
        </CanvasEditSection>
      </div>
    </section>
  );
}
