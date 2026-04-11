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
import { asciiAdjustmentsEqual } from "@/lib/asciiAdjustments";
import { cn } from "@/lib/utils";
import {
  useCanvasElementDraftRenderState,
  useCanvasPreviewActions,
} from "@/features/canvas/runtime/canvasRuntimeHooks";
import { resolveCanvasImageRenderState } from "@/features/canvas/imageRenderState";
import type { CanvasImageRenderStateV1 } from "@/render/image";
import type { AsciiAdjustments } from "@/types";
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
  applyAsciiAdjustmentsToRenderState,
  DEFAULT_CANVAS_ASCII_ADJUSTMENTS,
  getCanvasImageEditValues,
} from "./imageRenderStateEditing";
import { useCanvasImagePropertyActions } from "./hooks/useCanvasImagePropertyActions";

type AsciiSectionId = "presets";

const ASCII_CHARSET_OPTIONS: Array<{
  label: string;
  value: AsciiAdjustments["charsetPreset"];
}> = [
  { label: "标准", value: "standard" },
  { label: "方块", value: "blocks" },
  { label: "细节", value: "detailed" },
];

const ASCII_COLOR_MODE_OPTIONS: Array<{
  label: string;
  value: AsciiAdjustments["colorMode"];
}> = [
  { label: "灰度", value: "grayscale" },
  { label: "全彩", value: "full-color" },
];

const ASCII_DITHER_OPTIONS: Array<{
  label: string;
  value: AsciiAdjustments["dither"];
}> = [
  { label: "无", value: "none" },
  { label: "Floyd-Steinberg", value: "floyd-steinberg" },
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

export function CanvasAsciiEditPanel() {
  const imageElement = useCanvasEditImageTarget();

  if (!imageElement) {
    return (
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
        <div className="py-5">
          <p className={canvasDockBodyTextClassName}>
            在画布上选择一张图片后，即可调整 ASCII 效果。
          </p>
        </div>
      </section>
    );
  }

  return <CanvasAsciiEditPanelForImage imageElement={imageElement} />;
}

function CanvasAsciiEditPanelForImage({
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
  const [openSections, setOpenSections] = useState<Record<AsciiSectionId, boolean>>(
    () => ({ presets: true })
  );

  const committedImageElementId = imageElement.id;
  const committedImageElementIdRef = useRef<string | null>(committedImageElementId);
  const draftRenderState = useCanvasElementDraftRenderState(committedImageElementId);

  const renderState = useMemo(
    () => resolveCanvasImageRenderState(imageElement, draftRenderState),
    [draftRenderState, imageElement]
  );
  const fieldValues = useMemo(
    () => getCanvasImageEditValues(renderState),
    [renderState]
  );
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

  const toggleSection = useCallback((sectionId: AsciiSectionId) => {
    setOpenSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }, []);

  const asciiAdjustments = fieldValues.ascii ?? DEFAULT_CANVAS_ASCII_ADJUSTMENTS;
  const asciiHasChanges = !asciiAdjustmentsEqual(
    asciiAdjustments,
    DEFAULT_CANVAS_ASCII_ADJUSTMENTS
  );
  const disabled = false;

  const updateAsciiAdjustments = useCallback(
    (partial: Partial<AsciiAdjustments>, mode: "preview" | "commit" = "commit") => {
      if (!renderStateRef.current) {
        return;
      }
      const nextRenderState = applyAsciiAdjustmentsToRenderState(renderStateRef.current, partial);
      if (mode === "preview") {
        previewRenderState(nextRenderState);
        return;
      }
      void commitAdjustments(nextRenderState);
    },
    [commitAdjustments, previewRenderState]
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      <CanvasEditSection
        variant="canvasDock"
        title="ASCII 光栅"
        isOpen={openSections.presets}
        onToggle={() => toggleSection("presets")}
        hasChanges={asciiHasChanges}
        canResetChanges={asciiHasChanges}
        onResetChanges={() => updateAsciiAdjustments({ ...DEFAULT_CANVAS_ASCII_ADJUSTMENTS })}
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
              {asciiAdjustments.enabled ? "ASCII 已开启" : "ASCII 已关闭"}
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
              反相
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
                <SelectValue placeholder="字符集" />
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
                <SelectValue placeholder="颜色模式" />
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
                <SelectValue placeholder="抖动" />
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
            label="单元尺寸"
            value={asciiAdjustments.cellSize}
            defaultValue={DEFAULT_CANVAS_ASCII_ADJUSTMENTS.cellSize}
            min={6}
            max={24}
            disabled={!asciiAdjustments.enabled || disabled}
            onChange={(value) => updateAsciiAdjustments({ cellSize: value }, "preview")}
            onCommit={(value) => updateAsciiAdjustments({ cellSize: value })}
          />
          <SliderControl
            variant="canvasDock"
            label="字符间距"
            value={asciiAdjustments.characterSpacing}
            defaultValue={DEFAULT_CANVAS_ASCII_ADJUSTMENTS.characterSpacing}
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
            label="ASCII 对比度"
            value={asciiAdjustments.contrast}
            defaultValue={DEFAULT_CANVAS_ASCII_ADJUSTMENTS.contrast}
            min={0.5}
            max={2.5}
            step={0.05}
            disabled={!asciiAdjustments.enabled || disabled}
            format={(value) => value.toFixed(2)}
            onChange={(value) => updateAsciiAdjustments({ contrast: value }, "preview")}
            onCommit={(value) => updateAsciiAdjustments({ contrast: value })}
          />
        </div>
      </CanvasEditSection>
    </section>
  );
}
