import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CanvasEditSection } from "@/features/canvas/components/CanvasEditSection";
import { SliderControl } from "@/features/canvas/components/controls/SliderControl";
import { cn } from "@/lib/utils";
import {
  useCanvasElementDraftRenderState,
  useCanvasPreviewActions,
} from "@/features/canvas/runtime/canvasRuntimeHooks";
import { resolveCanvasImageRenderState } from "@/features/canvas/imageRenderState";
import type { CanvasImageRenderStateV1 } from "@/render/image";
import type { CaptionAdjustments } from "@/types";
import { useCanvasStore } from "@/stores/canvasStore";
import {
  canvasDockBodyTextClassName,
  canvasDockSelectContentClassName,
  canvasDockSelectTriggerClassName,
} from "./editDockTheme";
import {
  canvasEditTargetEqual,
  resolveCanvasEditTargetFromPrimarySelection,
  type CanvasImageEditTarget,
} from "./editPanelSelection";
import { selectLoadedWorkbench } from "./store/canvasStoreSelectors";
import {
  applyCaptionAdjustmentsToRenderState,
  DEFAULT_CANVAS_CAPTION_ADJUSTMENTS,
  getCanvasImageEditValues,
} from "./imageRenderStateEditing";
import { useCanvasImagePropertyActions } from "./hooks/useCanvasImagePropertyActions";

type CaptionSectionId = "text" | "layout" | "appearance";

const POSITION_OPTIONS: Array<{
  label: string;
  value: CaptionAdjustments["position"];
}> = [
  { label: "Top", value: "top" },
  { label: "Center", value: "center" },
  { label: "Bottom", value: "bottom" },
];

const ALIGNMENT_OPTIONS: Array<{
  label: string;
  value: CaptionAdjustments["alignment"];
}> = [
  { label: "Left", value: "left" },
  { label: "Center", value: "center" },
  { label: "Right", value: "right" },
];

type CaptionNumericKey = "fontSize" | "padding" | "opacity" | "backgroundOpacity";

interface CaptionSliderDef {
  key: CaptionNumericKey;
  label: string;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}

const LAYOUT_SLIDERS: CaptionSliderDef[] = [
  { key: "fontSize", label: "Font Size", min: 12, max: 72, step: 1 },
  { key: "padding", label: "Padding", min: 0, max: 100, step: 1 },
];

const APPEARANCE_SLIDERS: CaptionSliderDef[] = [
  { key: "opacity", label: "Opacity", min: 0, max: 100, step: 1 },
  { key: "backgroundOpacity", label: "Background Opacity", min: 0, max: 100, step: 1 },
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

export function CanvasCaptionEditPanel() {
  const imageElement = useCanvasEditImageTarget();

  if (!imageElement) {
    return (
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
        <div className="py-5">
          <p className={canvasDockBodyTextClassName}>
            Select an image on the canvas to add a caption overlay.
          </p>
        </div>
      </section>
    );
  }

  return <CanvasCaptionEditPanelForImage imageElement={imageElement} />;
}

function CanvasCaptionEditPanelForImage({
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
  const [openSections, setOpenSections] = useState<Record<CaptionSectionId, boolean>>(() => ({
    text: true,
    layout: true,
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

  const toggleSection = useCallback((sectionId: CaptionSectionId) => {
    setOpenSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }, []);

  const captionAdjustments = fieldValues.caption ?? DEFAULT_CANVAS_CAPTION_ADJUSTMENTS;
  const captionEnabled = captionAdjustments.enabled;

  const updateCaptionAdjustments = useCallback(
    (partial: Partial<CaptionAdjustments>, mode: "preview" | "commit" = "commit") => {
      const nextRenderState = applyCaptionAdjustmentsToRenderState(
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

  const renderSlider = (slider: CaptionSliderDef) => (
    <SliderControl
      key={slider.key}
      variant="canvasDock"
      label={slider.label}
      value={captionAdjustments[slider.key]}
      defaultValue={DEFAULT_CANVAS_CAPTION_ADJUSTMENTS[slider.key]}
      min={slider.min}
      max={slider.max}
      step={slider.step}
      format={slider.format}
      disabled={!captionEnabled}
      onChange={(value: number) => updateCaptionAdjustments({ [slider.key]: value }, "preview")}
      onCommit={(value: number) => updateCaptionAdjustments({ [slider.key]: value })}
    />
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      <div>
        <CanvasEditSection
          variant="canvasDock"
          title="Caption"
          isOpen={openSections.text}
          onToggle={() => toggleSection("text")}
          canResetChanges
          onResetChanges={() => updateCaptionAdjustments({ ...DEFAULT_CANVAS_CAPTION_ADJUSTMENTS })}
        >
          <div className="space-y-4">
            <button
              type="button"
              className={cn(
                "h-10 w-full rounded-[8px] border border-[color:var(--canvas-edit-border)] px-3 text-sm font-medium transition",
                captionEnabled
                  ? "bg-[color:var(--canvas-edit-text)] text-black hover:bg-white"
                  : "bg-[color:var(--canvas-edit-surface)] text-[color:var(--canvas-edit-text-muted)] hover:text-[color:var(--canvas-edit-text)]"
              )}
              onClick={() => updateCaptionAdjustments({ enabled: !captionEnabled })}
            >
              {captionEnabled ? "ON" : "OFF"}
            </button>
            <div className="space-y-1">
              <span className={canvasDockBodyTextClassName}>Text</span>
              <input
                type="text"
                value={captionAdjustments.text}
                onChange={(e) =>
                  updateCaptionAdjustments({ text: e.target.value }, "preview")
                }
                onBlur={(e) => updateCaptionAdjustments({ text: e.target.value })}
                disabled={!captionEnabled}
                placeholder="Enter caption text..."
                className={cn(
                  "h-10 w-full rounded-[8px] border border-[color:var(--canvas-edit-border)] bg-[color:var(--canvas-edit-surface)] px-3 text-sm text-[color:var(--canvas-edit-text)] placeholder:text-[color:var(--canvas-edit-text-muted)]",
                  !captionEnabled && "opacity-50"
                )}
              />
            </div>
          </div>
        </CanvasEditSection>

        <CanvasEditSection
          variant="canvasDock"
          title="Layout"
          isOpen={openSections.layout}
          onToggle={() => toggleSection("layout")}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className={canvasDockBodyTextClassName}>Position</span>
              <Select
                value={captionAdjustments.position}
                onValueChange={(value) =>
                  updateCaptionAdjustments({
                    position: value as CaptionAdjustments["position"],
                  })
                }
              >
                <SelectTrigger className={canvasDockSelectTriggerClassName}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={canvasDockSelectContentClassName}>
                  {POSITION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <span className={canvasDockBodyTextClassName}>Alignment</span>
              <Select
                value={captionAdjustments.alignment}
                onValueChange={(value) =>
                  updateCaptionAdjustments({
                    alignment: value as CaptionAdjustments["alignment"],
                  })
                }
              >
                <SelectTrigger className={canvasDockSelectTriggerClassName}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={canvasDockSelectContentClassName}>
                  {ALIGNMENT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {LAYOUT_SLIDERS.map(renderSlider)}
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
