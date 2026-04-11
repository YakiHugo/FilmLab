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

type AsciiSectionId = "presets" | "character" | "background" | "color";

const ASCII_CHARSET_OPTIONS: Array<{
  label: string;
  value: AsciiAdjustments["charsetPreset"];
}> = [
  { label: "标准", value: "standard" },
  { label: "简约", value: "minimal" },
  { label: "方块", value: "blocks" },
  { label: "细节", value: "detailed" },
  { label: "自定义", value: "custom" },
];

const ASCII_COLOR_MODE_OPTIONS: Array<{
  label: string;
  value: AsciiAdjustments["colorMode"];
}> = [
  { label: "灰度", value: "grayscale" },
  { label: "全彩", value: "full-color" },
  { label: "双色", value: "duotone" },
];

const ASCII_DITHER_OPTIONS: Array<{
  label: string;
  value: AsciiAdjustments["dither"];
}> = [
  { label: "无", value: "none" },
  { label: "Floyd-Steinberg", value: "floyd-steinberg" },
];

const ASCII_RENDER_MODE_OPTIONS: Array<{
  label: string;
  value: AsciiAdjustments["renderMode"];
}> = [
  { label: "字符", value: "glyph" },
  { label: "点阵", value: "dot" },
];

const ASCII_BACKGROUND_MODE_OPTIONS: Array<{
  label: string;
  value: AsciiAdjustments["backgroundMode"];
}> = [
  { label: "无", value: "none" },
  { label: "纯色", value: "solid" },
  { label: "单元填充", value: "cell-solid" },
  { label: "模糊原图", value: "blurred-source" },
];

const ASCII_FOREGROUND_BLEND_OPTIONS: Array<{
  label: string;
  value: AsciiAdjustments["foregroundBlendMode"];
}> = [
  { label: "正常", value: "source-over" },
  { label: "正片叠底", value: "multiply" },
  { label: "滤色", value: "screen" },
  { label: "叠加", value: "overlay" },
  { label: "柔光", value: "soft-light" },
];

type AsciiNumericKey =
  | "density"
  | "coverage"
  | "edgeEmphasis"
  | "cellSize"
  | "characterSpacing"
  | "foregroundOpacity"
  | "backgroundBlur"
  | "backgroundOpacity";

const formatRatio = (value: number) => value.toFixed(2);
const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

interface AsciiSliderDef {
  key: AsciiNumericKey;
  label: string;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}

// brightness / contrast are not surfaced here — they duplicate the image edit
// panel's "光线与对比" section, which already operates on the source pixels
// that feed into the ASCII sampler. density / coverage / edgeEmphasis are
// retained because they modify the ASCII tone→glyph mapping itself, not the
// underlying image tone, so there is no equivalent control elsewhere.
const CHARACTER_SLIDERS: AsciiSliderDef[] = [
  { key: "cellSize", label: "单元尺寸", min: 6, max: 48, step: 1 },
  {
    key: "characterSpacing",
    label: "字符间距",
    min: 0.7,
    max: 1.6,
    step: 0.05,
    format: formatRatio,
  },
  { key: "density", label: "字符密度", min: 0.1, max: 1, step: 0.01, format: formatRatio },
  { key: "coverage", label: "覆盖率", min: 0.05, max: 1, step: 0.01, format: formatRatio },
  { key: "edgeEmphasis", label: "边缘强度", min: 0, max: 1, step: 0.01, format: formatRatio },
  {
    key: "foregroundOpacity",
    label: "字符不透明度",
    min: 0,
    max: 1,
    step: 0.01,
    format: formatPercent,
  },
];

const sectionKeysHaveChanges = (
  current: AsciiAdjustments,
  defaults: AsciiAdjustments,
  keys: Array<keyof AsciiAdjustments>
) => keys.some((key) => current[key] !== defaults[key]);

const PRESET_KEYS: Array<keyof AsciiAdjustments> = [
  "charsetPreset",
  "customCharset",
  "invert",
];
const CHARACTER_KEYS: Array<keyof AsciiAdjustments> = [
  "renderMode",
  "cellSize",
  "characterSpacing",
  "density",
  "coverage",
  "edgeEmphasis",
  "foregroundOpacity",
  "foregroundBlendMode",
  "gridOverlay",
];
const BACKGROUND_KEYS: Array<keyof AsciiAdjustments> = [
  "backgroundMode",
  "backgroundColor",
  "backgroundBlur",
  "backgroundOpacity",
];
const COLOR_KEYS: Array<keyof AsciiAdjustments> = ["colorMode", "dither"];

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
  const [openSections, setOpenSections] = useState<Record<AsciiSectionId, boolean>>(() => ({
    presets: true,
    character: true,
    background: true,
    color: false,
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

  const toggleSection = useCallback((sectionId: AsciiSectionId) => {
    setOpenSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }, []);

  const asciiAdjustments = fieldValues.ascii ?? DEFAULT_CANVAS_ASCII_ADJUSTMENTS;
  const asciiEnabled = asciiAdjustments.enabled;
  const asciiHasChanges = !asciiAdjustmentsEqual(
    asciiAdjustments,
    DEFAULT_CANVAS_ASCII_ADJUSTMENTS
  );
  const presetsHasChanges =
    asciiEnabled !== DEFAULT_CANVAS_ASCII_ADJUSTMENTS.enabled ||
    sectionKeysHaveChanges(asciiAdjustments, DEFAULT_CANVAS_ASCII_ADJUSTMENTS, PRESET_KEYS);
  const characterHasChanges = sectionKeysHaveChanges(
    asciiAdjustments,
    DEFAULT_CANVAS_ASCII_ADJUSTMENTS,
    CHARACTER_KEYS
  );
  const backgroundHasChanges = sectionKeysHaveChanges(
    asciiAdjustments,
    DEFAULT_CANVAS_ASCII_ADJUSTMENTS,
    BACKGROUND_KEYS
  );
  const colorHasChanges = sectionKeysHaveChanges(
    asciiAdjustments,
    DEFAULT_CANVAS_ASCII_ADJUSTMENTS,
    COLOR_KEYS
  );

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

  const resetSectionKeys = useCallback(
    (keys: Array<keyof AsciiAdjustments>) => {
      const partial: Partial<AsciiAdjustments> = {};
      for (const key of keys) {
        // The generic assignment is safe — we're picking from the defaults of
        // the same type and writing back to a Partial of the same type.
        (partial as Record<string, unknown>)[key] = DEFAULT_CANVAS_ASCII_ADJUSTMENTS[key];
      }
      updateAsciiAdjustments(partial);
    },
    [updateAsciiAdjustments]
  );

  const renderAsciiSlider = (slider: AsciiSliderDef) => {
    const partialFor = (value: number): Partial<AsciiAdjustments> =>
      ({ [slider.key]: value }) as Partial<AsciiAdjustments>;
    return (
      <SliderControl
        key={slider.key}
        variant="canvasDock"
        label={slider.label}
        value={asciiAdjustments[slider.key]}
        defaultValue={DEFAULT_CANVAS_ASCII_ADJUSTMENTS[slider.key]}
        min={slider.min}
        max={slider.max}
        step={slider.step}
        format={slider.format}
        disabled={!asciiEnabled}
        onChange={(value) => updateAsciiAdjustments(partialFor(value), "preview")}
        onCommit={(value) => updateAsciiAdjustments(partialFor(value))}
      />
    );
  };

  const showBackgroundColor =
    asciiAdjustments.backgroundMode === "solid" ||
    asciiAdjustments.backgroundMode === "cell-solid";
  const showBackgroundBlur = asciiAdjustments.backgroundMode === "blurred-source";
  const showBackgroundOpacity = asciiAdjustments.backgroundMode !== "none";

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      {/* Inner wrapper isolates the CanvasEditSections from the outer flex
          column so each section can take its natural block height and the
          outer overflow-y-auto can scroll when totals exceed the panel.
          Without this, flex children fall back to min-height: auto and the
          scroll container fails to activate. */}
      <div>
      <CanvasEditSection
        variant="canvasDock"
        title="预设"
        isOpen={openSections.presets}
        onToggle={() => toggleSection("presets")}
        hasChanges={presetsHasChanges}
        canResetChanges={asciiHasChanges}
        onResetChanges={() => updateAsciiAdjustments({ ...DEFAULT_CANVAS_ASCII_ADJUSTMENTS })}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={cn(
                "h-10 rounded-[8px] border border-[color:var(--canvas-edit-border)] px-3 text-sm font-medium transition",
                asciiEnabled
                  ? "bg-[color:var(--canvas-edit-text)] text-black hover:bg-white"
                  : "bg-[color:var(--canvas-edit-surface)] text-[color:var(--canvas-edit-text-muted)] hover:text-[color:var(--canvas-edit-text)]"
              )}
              onClick={() => updateAsciiAdjustments({ enabled: !asciiEnabled })}
            >
              {asciiEnabled ? "ASCII 已开启" : "ASCII 已关闭"}
            </button>
            <button
              type="button"
              disabled={!asciiEnabled}
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

          <Select
            value={asciiAdjustments.charsetPreset}
            onValueChange={(value) =>
              updateAsciiAdjustments({
                charsetPreset: value as AsciiAdjustments["charsetPreset"],
              })
            }
            disabled={!asciiEnabled}
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

          {asciiAdjustments.charsetPreset === "custom" ? (
            <div className="space-y-1.5">
              <label className="text-xs text-[color:var(--canvas-edit-text-muted)]">
                自定义字符（按密度自动排序，从密到疏）
              </label>
              <textarea
                rows={2}
                spellCheck={false}
                placeholder="例如：@#*+=-:. "
                value={asciiAdjustments.customCharset}
                disabled={!asciiEnabled}
                className={cn(
                  "w-full rounded-[8px] border border-[color:var(--canvas-edit-border)] bg-[color:var(--canvas-edit-surface)] px-3 py-2 font-mono text-sm leading-relaxed text-[color:var(--canvas-edit-text)] outline-none transition focus:border-[color:var(--canvas-edit-text)] disabled:cursor-not-allowed disabled:opacity-40"
                )}
                onChange={(event) =>
                  updateAsciiAdjustments(
                    { customCharset: event.target.value },
                    "preview"
                  )
                }
                onBlur={(event) =>
                  updateAsciiAdjustments({ customCharset: event.target.value })
                }
              />
            </div>
          ) : null}
        </div>
      </CanvasEditSection>

      <CanvasEditSection
        variant="canvasDock"
        title="字符"
        isOpen={openSections.character}
        onToggle={() => toggleSection("character")}
        hasChanges={characterHasChanges}
        canResetChanges={characterHasChanges}
        onResetChanges={() => resetSectionKeys(CHARACTER_KEYS)}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2">
            <Select
              value={asciiAdjustments.renderMode}
              onValueChange={(value) =>
                updateAsciiAdjustments({
                  renderMode: value as AsciiAdjustments["renderMode"],
                })
              }
              disabled={!asciiEnabled}
            >
              <SelectTrigger className={canvasDockSelectTriggerClassName}>
                <SelectValue placeholder="渲染模式" />
              </SelectTrigger>
              <SelectContent className={canvasDockSelectContentClassName}>
                {ASCII_RENDER_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">{CHARACTER_SLIDERS.map(renderAsciiSlider)}</div>

          <Select
            value={asciiAdjustments.foregroundBlendMode}
            onValueChange={(value) =>
              updateAsciiAdjustments({
                foregroundBlendMode: value as AsciiAdjustments["foregroundBlendMode"],
              })
            }
            disabled={!asciiEnabled}
          >
            <SelectTrigger className={canvasDockSelectTriggerClassName}>
              <SelectValue placeholder="混合模式" />
            </SelectTrigger>
            <SelectContent className={canvasDockSelectContentClassName}>
              {ASCII_FOREGROUND_BLEND_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            type="button"
            disabled={!asciiEnabled}
            className={cn(
              "h-10 w-full rounded-[8px] border border-[color:var(--canvas-edit-border)] px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
              asciiAdjustments.gridOverlay
                ? "bg-[color:var(--canvas-edit-text)] text-black hover:bg-white"
                : "bg-[color:var(--canvas-edit-surface)] text-[color:var(--canvas-edit-text-muted)] hover:text-[color:var(--canvas-edit-text)]"
            )}
            onClick={() =>
              updateAsciiAdjustments({ gridOverlay: !asciiAdjustments.gridOverlay })
            }
          >
            {asciiAdjustments.gridOverlay ? "网格已开启" : "网格已关闭"}
          </button>
        </div>
      </CanvasEditSection>

      <CanvasEditSection
        variant="canvasDock"
        title="背景"
        isOpen={openSections.background}
        onToggle={() => toggleSection("background")}
        hasChanges={backgroundHasChanges}
        canResetChanges={backgroundHasChanges}
        onResetChanges={() => resetSectionKeys(BACKGROUND_KEYS)}
      >
        <div className="space-y-4">
          <Select
            value={asciiAdjustments.backgroundMode}
            onValueChange={(value) =>
              updateAsciiAdjustments({
                backgroundMode: value as AsciiAdjustments["backgroundMode"],
              })
            }
            disabled={!asciiEnabled}
          >
            <SelectTrigger className={canvasDockSelectTriggerClassName}>
              <SelectValue placeholder="背景模式" />
            </SelectTrigger>
            <SelectContent className={canvasDockSelectContentClassName}>
              {ASCII_BACKGROUND_MODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {showBackgroundColor ? (
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-[color:var(--canvas-edit-text-muted)]">背景颜色</span>
              <input
                type="color"
                value={asciiAdjustments.backgroundColor}
                disabled={!asciiEnabled}
                className="h-8 w-12 cursor-pointer rounded-[6px] border border-[color:var(--canvas-edit-border)] bg-transparent disabled:cursor-not-allowed disabled:opacity-40"
                onChange={(event) =>
                  updateAsciiAdjustments({ backgroundColor: event.target.value }, "preview")
                }
                onBlur={(event) =>
                  updateAsciiAdjustments({ backgroundColor: event.target.value })
                }
              />
            </label>
          ) : null}

          {showBackgroundBlur ? (
            <SliderControl
              variant="canvasDock"
              label="背景模糊"
              value={asciiAdjustments.backgroundBlur}
              defaultValue={DEFAULT_CANVAS_ASCII_ADJUSTMENTS.backgroundBlur}
              min={0}
              max={100}
              step={1}
              disabled={!asciiEnabled}
              onChange={(value) => updateAsciiAdjustments({ backgroundBlur: value }, "preview")}
              onCommit={(value) => updateAsciiAdjustments({ backgroundBlur: value })}
            />
          ) : null}

          {showBackgroundOpacity ? (
            <SliderControl
              variant="canvasDock"
              label="背景不透明度"
              value={asciiAdjustments.backgroundOpacity}
              defaultValue={DEFAULT_CANVAS_ASCII_ADJUSTMENTS.backgroundOpacity}
              min={0}
              max={1}
              step={0.01}
              format={formatPercent}
              disabled={!asciiEnabled}
              onChange={(value) =>
                updateAsciiAdjustments({ backgroundOpacity: value }, "preview")
              }
              onCommit={(value) => updateAsciiAdjustments({ backgroundOpacity: value })}
            />
          ) : null}
        </div>
      </CanvasEditSection>

      <CanvasEditSection
        variant="canvasDock"
        title="色彩与抖动"
        isOpen={openSections.color}
        onToggle={() => toggleSection("color")}
        hasChanges={colorHasChanges}
        canResetChanges={colorHasChanges}
        onResetChanges={() => resetSectionKeys(COLOR_KEYS)}
      >
        <div className="grid grid-cols-1 gap-2">
          <Select
            value={asciiAdjustments.colorMode}
            onValueChange={(value) =>
              updateAsciiAdjustments({
                colorMode: value as AsciiAdjustments["colorMode"],
              })
            }
            disabled={!asciiEnabled}
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
            disabled={!asciiEnabled}
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
      </CanvasEditSection>
      </div>
    </section>
  );
}
