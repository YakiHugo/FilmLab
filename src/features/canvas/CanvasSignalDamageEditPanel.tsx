import { useCallback, useEffect, useMemo, useRef } from "react";
import { CanvasEditSection } from "@/features/canvas/components/CanvasEditSection";
import { SliderControl } from "@/features/canvas/components/controls/SliderControl";
import { cn } from "@/lib/utils";
import {
  useCanvasElementDraftRenderState,
  useCanvasPreviewActions,
} from "@/features/canvas/runtime/canvasRuntimeHooks";
import { resolveCanvasImageRenderState } from "@/features/canvas/imageRenderState";
import type { CanvasImageRenderStateV1 } from "@/render/image";
import type { ChannelDriftAdjustments } from "@/types";
import { useCanvasStore } from "@/stores/canvasStore";
import { canvasDockBodyTextClassName } from "./editDockTheme";
import {
  canvasEditTargetEqual,
  resolveCanvasEditTargetFromPrimarySelection,
  type CanvasImageEditTarget,
} from "./editPanelSelection";
import { selectLoadedWorkbench } from "./store/canvasStoreSelectors";
import {
  applyChannelDriftAdjustmentsToRenderState,
  DEFAULT_CANVAS_CHANNEL_DRIFT_ADJUSTMENTS,
  getCanvasImageEditValues,
} from "./imageRenderStateEditing";
import { useCanvasImagePropertyActions } from "./hooks/useCanvasImagePropertyActions";

type ChannelDriftNumericKey =
  | "redOffsetX"
  | "redOffsetY"
  | "greenOffsetX"
  | "greenOffsetY"
  | "blueOffsetX"
  | "blueOffsetY"
  | "intensity";

const formatPx = (value: number) => `${value.toFixed(1)}px`;
const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

interface ChannelDriftSliderDef {
  key: ChannelDriftNumericKey;
  label: string;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}

const CHANNEL_SLIDERS: ChannelDriftSliderDef[] = [
  { key: "redOffsetX", label: "Red X", min: -100, max: 100, step: 1, format: formatPx },
  { key: "redOffsetY", label: "Red Y", min: -100, max: 100, step: 1, format: formatPx },
  { key: "greenOffsetX", label: "Green X", min: -100, max: 100, step: 1, format: formatPx },
  { key: "greenOffsetY", label: "Green Y", min: -100, max: 100, step: 1, format: formatPx },
  { key: "blueOffsetX", label: "Blue X", min: -100, max: 100, step: 1, format: formatPx },
  { key: "blueOffsetY", label: "Blue Y", min: -100, max: 100, step: 1, format: formatPx },
  { key: "intensity", label: "强度", min: 0, max: 1, step: 0.01, format: formatPercent },
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

export function CanvasSignalDamageEditPanel() {
  const imageElement = useCanvasEditImageTarget();

  if (!imageElement) {
    return (
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
        <div className="py-5">
          <p className={canvasDockBodyTextClassName}>
            在画布上选择一张图片后，即可调整信号损伤效果。
          </p>
        </div>
      </section>
    );
  }

  return <CanvasSignalDamageEditPanelForImage imageElement={imageElement} />;
}

function CanvasSignalDamageEditPanelForImage({
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

  const channelDrift = fieldValues.channelDrift ?? DEFAULT_CANVAS_CHANNEL_DRIFT_ADJUSTMENTS;
  const driftEnabled = channelDrift.enabled;

  const updateChannelDrift = useCallback(
    (partial: Partial<ChannelDriftAdjustments>, mode: "preview" | "commit" = "commit") => {
      const nextRenderState = applyChannelDriftAdjustmentsToRenderState(
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

  const renderSlider = (slider: ChannelDriftSliderDef) => (
    <SliderControl
      key={slider.key}
      variant="canvasDock"
      label={slider.label}
      value={channelDrift[slider.key]}
      defaultValue={DEFAULT_CANVAS_CHANNEL_DRIFT_ADJUSTMENTS[slider.key]}
      min={slider.min}
      max={slider.max}
      step={slider.step}
      format={slider.format}
      disabled={!driftEnabled}
      onChange={(value: number) => updateChannelDrift({ [slider.key]: value }, "preview")}
      onCommit={(value: number) => updateChannelDrift({ [slider.key]: value })}
    />
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      <div>
      <CanvasEditSection
        variant="canvasDock"
        title="Channel Drift"
        isOpen={true}
        onToggle={() => {}}
        canResetChanges
        onResetChanges={() => updateChannelDrift({ ...DEFAULT_CANVAS_CHANNEL_DRIFT_ADJUSTMENTS })}
      >
        <div className="space-y-4">
          <button
            type="button"
            className={cn(
              "h-10 w-full rounded-[8px] border border-[color:var(--canvas-edit-border)] px-3 text-sm font-medium transition",
              driftEnabled
                ? "bg-[color:var(--canvas-edit-text)] text-black hover:bg-white"
                : "bg-[color:var(--canvas-edit-surface)] text-[color:var(--canvas-edit-text-muted)] hover:text-[color:var(--canvas-edit-text)]"
            )}
            onClick={() => updateChannelDrift({ enabled: !driftEnabled })}
          >
            {driftEnabled ? "ON" : "OFF"}
          </button>
          {CHANNEL_SLIDERS.map(renderSlider)}
        </div>
      </CanvasEditSection>
      </div>
    </section>
  );
}
