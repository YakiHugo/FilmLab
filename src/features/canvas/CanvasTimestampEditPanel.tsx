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
import {
  useCanvasElementDraftRenderState,
  useCanvasPreviewActions,
} from "@/features/canvas/runtime/canvasRuntimeHooks";
import { cn } from "@/lib/utils";
import type { CanvasImageRenderStateV1 } from "@/render/image";
import { useCanvasStore } from "@/stores/canvasStore";
import type { TimestampAdjustments } from "@/types";
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
import { useCanvasImagePropertyActions } from "./hooks/useCanvasImagePropertyActions";
import { resolveCanvasImageRenderState } from "./image/boardImageRendering";
import {
  applyTimestampAdjustmentsToRenderState,
  DEFAULT_CANVAS_TIMESTAMP_ADJUSTMENTS,
  getCanvasImageEditValues,
} from "./image/imageRenderStateEditing";
import { selectLoadedWorkbench } from "./store/canvasStoreSelectors";

const POSITION_OPTIONS: Array<{
  label: string;
  value: TimestampAdjustments["position"];
}> = [
  { label: "Top left", value: "top-left" },
  { label: "Top right", value: "top-right" },
  { label: "Bottom left", value: "bottom-left" },
  { label: "Bottom right", value: "bottom-right" },
];

function useCanvasTimestampTarget(): CanvasImageEditTarget | null {
  const selectedElementId = useCanvasStore((state) => state.selectedElementIds[0] ?? null);
  const selectTarget = useCallback(
    (state: Parameters<typeof selectLoadedWorkbench>[0]) => {
      const target = resolveCanvasEditTargetFromPrimarySelection(
        selectLoadedWorkbench(state),
        selectedElementId
      );
      return target?.type === "image" ? target : null;
    },
    [selectedElementId]
  );
  return useCanvasStore(selectTarget, canvasEditTargetEqual);
}

export function CanvasTimestampEditPanel() {
  const imageElement = useCanvasTimestampTarget();
  if (!imageElement) {
    return (
      <section className="py-5">
        <p className={canvasDockBodyTextClassName}>
          Select an image on the canvas to add its capture timestamp.
        </p>
      </section>
    );
  }
  return <CanvasTimestampEditPanelForImage imageElement={imageElement} />;
}

function CanvasTimestampEditPanelForImage({
  imageElement,
}: {
  imageElement: CanvasImageEditTarget;
}) {
  const draftRenderState = useCanvasElementDraftRenderState(imageElement.id);
  const { clearElementDraftRenderState, requestBoardPreview, setElementDraftRenderState } =
    useCanvasPreviewActions();
  const { setRenderState } = useCanvasImagePropertyActions(imageElement);
  const [error, setError] = useState<string | null>(null);
  const [sectionOpen, setSectionOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const commitSequenceRef = useRef(0);
  const activeCommitRef = useRef<number | null>(null);
  const renderState = useMemo(
    () => resolveCanvasImageRenderState(imageElement, draftRenderState),
    [draftRenderState, imageElement]
  );
  const renderStateRef = useRef<CanvasImageRenderStateV1>(renderState);
  renderStateRef.current = renderState;
  const timestamp = getCanvasImageEditValues(renderState).timestamp;

  useEffect(
    () => () => {
      clearElementDraftRenderState(imageElement.id);
    },
    [clearElementDraftRenderState, imageElement.id]
  );

  const updateTimestamp = useCallback(
    async (partial: Partial<TimestampAdjustments>, mode: "preview" | "commit") => {
      if (mode === "commit" && activeCommitRef.current !== null) {
        return;
      }
      const nextState = applyTimestampAdjustmentsToRenderState(renderStateRef.current, partial);
      setElementDraftRenderState(imageElement.id, nextState);
      if (mode === "preview") {
        void requestBoardPreview(imageElement.id, "interactive");
        return;
      }

      const commitId = ++commitSequenceRef.current;
      activeCommitRef.current = commitId;
      setSaving(true);
      setError(null);
      try {
        const committed = await setRenderState(nextState);
        if (!committed) {
          setError("Timestamp 未能保存，请重试。");
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Timestamp 写入失败，请重试。");
      } finally {
        if (activeCommitRef.current === commitId) {
          activeCommitRef.current = null;
          clearElementDraftRenderState(imageElement.id);
          setSaving(false);
        }
      }
    },
    [
      clearElementDraftRenderState,
      imageElement.id,
      requestBoardPreview,
      setElementDraftRenderState,
      setRenderState,
    ]
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      <div className="py-5">
        <CanvasEditSection
          variant="canvasDock"
          title="Capture timestamp"
          isOpen={sectionOpen}
          onToggle={() => setSectionOpen((current) => !current)}
          canResetChanges={!saving}
          onResetChanges={() =>
            void updateTimestamp({ ...DEFAULT_CANVAS_TIMESTAMP_ADJUSTMENTS }, "commit")
          }
        >
          <div className="space-y-4">
            <button
              type="button"
              disabled={saving}
              className={cn(
                "h-10 w-full rounded-[8px] border border-[color:var(--canvas-edit-border)] px-3 text-sm font-medium transition disabled:cursor-wait disabled:opacity-60",
                timestamp.enabled
                  ? "bg-[color:var(--canvas-edit-text)] text-black hover:bg-white"
                  : "bg-[color:var(--canvas-edit-surface)] text-[color:var(--canvas-edit-text-muted)] hover:text-[color:var(--canvas-edit-text)]"
              )}
              onClick={() => void updateTimestamp({ enabled: !timestamp.enabled }, "commit")}
            >
              {timestamp.enabled ? "ON" : "OFF"}
            </button>

            <div className="space-y-1.5">
              <span className={canvasDockBodyTextClassName}>Position</span>
              <Select
                value={timestamp.position}
                disabled={!timestamp.enabled || saving}
                onValueChange={(value) =>
                  void updateTimestamp(
                    { position: value as TimestampAdjustments["position"] },
                    "commit"
                  )
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

            <CanvasSliderRow
              variant="canvasDock"
              label="Size"
              value={timestamp.size}
              defaultValue={DEFAULT_CANVAS_TIMESTAMP_ADJUSTMENTS.size}
              min={12}
              max={48}
              step={1}
              disabled={!timestamp.enabled || saving}
              onChange={(value) => void updateTimestamp({ size: value }, "preview")}
              onCommit={(value) => void updateTimestamp({ size: value }, "commit")}
            />
            <CanvasSliderRow
              variant="canvasDock"
              label="Opacity"
              value={timestamp.opacity}
              defaultValue={DEFAULT_CANVAS_TIMESTAMP_ADJUSTMENTS.opacity}
              min={0}
              max={100}
              step={1}
              disabled={!timestamp.enabled || saving}
              onChange={(value) => void updateTimestamp({ opacity: value }, "preview")}
              onCommit={(value) => void updateTimestamp({ opacity: value }, "commit")}
            />
            <p className="text-xs leading-5 text-[color:var(--canvas-edit-text-soft)]">
              Timestamp 读取图片的拍摄时间；没有 EXIF 时使用导入时间。
            </p>
            {error ? <p className="text-xs text-red-300">{error}</p> : null}
          </div>
        </CanvasEditSection>
      </div>
    </section>
  );
}
