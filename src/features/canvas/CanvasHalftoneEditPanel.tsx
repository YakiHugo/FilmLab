import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CanvasEditSection } from "@/features/canvas/components/CanvasEditSection";
import { CanvasSliderRow } from "@/features/canvas/components/CanvasSliderRow";
import { cn } from "@/lib/utils";
import {
  useCanvasElementDraftRenderState,
  useCanvasPreviewActions,
} from "@/features/canvas/runtime/canvasRuntimeHooks";
import { resolveCanvasImageRenderState } from "@/features/canvas/image/boardImageRendering";
import type { CanvasImageRenderStateV1 } from "@/render/image";
import type { HalftoneAdjustments } from "@/types";
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
  applyHalftoneAdjustmentsToRenderState,
  DEFAULT_CANVAS_HALFTONE_ADJUSTMENTS,
  getCanvasImageEditValues,
} from "./image/imageRenderStateEditing";
import { useCanvasImagePropertyActions } from "./hooks/useCanvasImagePropertyActions";

type HalftoneSectionId = "screen" | "appearance";

const HALFTONE_SHAPE_OPTIONS: Array<{
  label: string;
  value: HalftoneAdjustments["shape"];
}> = [
  { label: "圆形", value: "circle" },
  { label: "菱形", value: "diamond" },
  { label: "线条", value: "line" },
  { label: "方形", value: "square" },
];

const HALFTONE_COLOR_MODE_OPTIONS: Array<{
  label: string;
  value: HalftoneAdjustments["colorMode"];
}> = [
  { label: "单色", value: "mono" },
  { label: "CMYK", value: "cmyk" },
  { label: "RGB", value: "rgb" },
];

type HalftoneNumericKey =
  | "frequency"
  | "angle"
  | "dotScale"
  | "contrast"
  | "backgroundOpacity";

const formatRatio = (value: number) => value.toFixed(2);

interface HalftoneSliderDef {
  key: HalftoneNumericKey;
  label: string;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}

const SCREEN_SLIDERS: HalftoneSliderDef[] = [
  { key: "frequency", label: "网点频率", min: 4, max: 80, step: 1 },
  { key: "angle", label: "屏幕角度", min: 0, max: 360, step: 1 },
  { key: "dotScale", label: "点大小", min: 0.5, max: 2, step: 0.05, format: formatRatio },
  { key: "contrast", label: "对比度", min: 0.5, max: 3, step: 0.05, format: formatRatio },
];

const APPEARANCE_SLIDERS: HalftoneSliderDef[] = [
  { key: "backgroundOpacity", label: "背景不透明度", min: 0, max: 1, step: 0.01, format: formatRatio },
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

export function CanvasHalftoneEditPanel() {
  const imageElement = useCanvasEditImageTarget();

  if (!imageElement) {
    return (
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
        <div className="py-5">
          <p className={canvasDockBodyTextClassName}>
            在画布上选择一张图片后，即可调整半色调效果。
          </p>
        </div>
      </section>
    );
  }

  return <CanvasHalftoneEditPanelForImage imageElement={imageElement} />;
}

function CanvasHalftoneEditPanelForImage({
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
  const [openSections, setOpenSections] = useState<Record<HalftoneSectionId, boolean>>(() => ({
    screen: true,
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

  const toggleSection = useCallback((sectionId: HalftoneSectionId) => {
    setOpenSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }, []);

  const halftoneAdjustments = fieldValues.halftone ?? DEFAULT_CANVAS_HALFTONE_ADJUSTMENTS;
  const halftoneEnabled = halftoneAdjustments.enabled;

  const updateHalftoneAdjustments = useCallback(
    (partial: Partial<HalftoneAdjustments>, mode: "preview" | "commit" = "commit") => {
      const nextRenderState = applyHalftoneAdjustmentsToRenderState(
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

  const renderSlider = (slider: HalftoneSliderDef) => (
    <CanvasSliderRow
      key={slider.key}
      variant="canvasDock"
      label={slider.label}
      value={halftoneAdjustments[slider.key]}
      defaultValue={DEFAULT_CANVAS_HALFTONE_ADJUSTMENTS[slider.key]}
      min={slider.min}
      max={slider.max}
      step={slider.step}
      format={slider.format}
      disabled={!halftoneEnabled}
      onChange={(value: number) => updateHalftoneAdjustments({ [slider.key]: value }, "preview")}
      onCommit={(value: number) => updateHalftoneAdjustments({ [slider.key]: value })}
    />
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      <div>
      <CanvasEditSection
        variant="canvasDock"
        title="网屏"
        isOpen={openSections.screen}
        onToggle={() => toggleSection("screen")}
        canResetChanges
        onResetChanges={() => updateHalftoneAdjustments({ ...DEFAULT_CANVAS_HALFTONE_ADJUSTMENTS })}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={cn(
                "h-10 rounded-[8px] border border-[color:var(--canvas-edit-border)] px-3 text-sm font-medium transition",
                halftoneEnabled
                  ? "bg-[color:var(--canvas-edit-text)] text-black hover:bg-white"
                  : "bg-[color:var(--canvas-edit-surface)] text-[color:var(--canvas-edit-text-muted)] hover:text-[color:var(--canvas-edit-text)]"
              )}
              onClick={() => updateHalftoneAdjustments({ enabled: !halftoneEnabled })}
            >
              {halftoneEnabled ? "ON" : "OFF"}
            </button>
            <button
              type="button"
              className={cn(
                "h-10 rounded-[8px] border border-[color:var(--canvas-edit-border)] px-3 text-sm font-medium transition",
                halftoneAdjustments.invert
                  ? "bg-[color:var(--canvas-edit-text)] text-black hover:bg-white"
                  : "bg-[color:var(--canvas-edit-surface)] text-[color:var(--canvas-edit-text-muted)] hover:text-[color:var(--canvas-edit-text)]"
              )}
              onClick={() => updateHalftoneAdjustments({ invert: !halftoneAdjustments.invert })}
            >
              反转
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className={canvasDockBodyTextClassName}>形状</span>
            <Select
              value={halftoneAdjustments.shape}
              onValueChange={(value) =>
                updateHalftoneAdjustments({
                  shape: value as HalftoneAdjustments["shape"],
                })
              }
            >
              <SelectTrigger className={canvasDockSelectTriggerClassName}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={canvasDockSelectContentClassName}>
                {HALFTONE_SHAPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <span className={canvasDockBodyTextClassName}>色彩模式</span>
            <Select
              value={halftoneAdjustments.colorMode}
              onValueChange={(value) =>
                updateHalftoneAdjustments({
                  colorMode: value as HalftoneAdjustments["colorMode"],
                })
              }
            >
              <SelectTrigger className={canvasDockSelectTriggerClassName}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={canvasDockSelectContentClassName}>
                {HALFTONE_COLOR_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {SCREEN_SLIDERS.map(renderSlider)}
        </div>
      </CanvasEditSection>

      <CanvasEditSection
        variant="canvasDock"
        title="外观"
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
