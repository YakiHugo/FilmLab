import { Check, CircleDot, RadioTower, RotateCcw, Terminal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { CanvasImageRenderStateV1 } from "@/render/image";
import { useCanvasStore } from "@/stores/canvasStore";
import {
  canvasDockActionChipClassName,
  canvasDockBodyTextClassName,
  canvasDockOverlineClassName,
  canvasDockSectionClassName,
} from "./editDockTheme";
import {
  canvasEditTargetEqual,
  resolveCanvasEditTargetFromPrimarySelection,
  type CanvasImageEditTarget,
} from "./editPanelSelection";
import { resolveCanvasImageRenderState } from "./image/boardImageRendering";
import { CanvasSliderRow } from "./components/CanvasSliderRow";
import { useCanvasImagePropertyActions } from "./hooks/useCanvasImagePropertyActions";
import {
  useCanvasElementDraftRenderState,
  useCanvasPreviewActions,
} from "./runtime/canvasRuntimeHooks";
import { selectLoadedWorkbench } from "./store/canvasStoreSelectors";
import {
  applyComputationalStylePreset,
  clearComputationalStyle,
  COMPUTATIONAL_STYLE_PRESETS,
  DEFAULT_COMPUTATIONAL_STYLE_INTENSITY,
  resolveComputationalStyleIntensity,
  resolveComputationalStylePresetId,
  type ComputationalStylePresetId,
} from "./styles/computationalStylePresets";

const ADVANCED_PANELS = [
  { id: "ascii" as const, label: "ASCII", icon: Terminal },
  { id: "halftone" as const, label: "Halftone", icon: CircleDot },
  { id: "signal-damage" as const, label: "Signal", icon: RadioTower },
];

function useCanvasStyleTarget(): CanvasImageEditTarget | null {
  const primarySelectedElementId = useCanvasStore((state) => state.selectedElementIds[0] ?? null);
  const selectTarget = useCallback(
    (state: Parameters<typeof selectLoadedWorkbench>[0]) => {
      const target = resolveCanvasEditTargetFromPrimarySelection(
        selectLoadedWorkbench(state),
        primarySelectedElementId
      );
      return target?.type === "image" ? target : null;
    },
    [primarySelectedElementId]
  );
  return useCanvasStore(selectTarget, canvasEditTargetEqual);
}

function StylePreview({
  preview,
}: {
  preview: (typeof COMPUTATIONAL_STYLE_PRESETS)[number]["preview"];
}) {
  if (preview === "terminal") {
    return (
      <div className="flex h-full items-center justify-center bg-[#030503] font-mono text-[11px] leading-4 tracking-[0.18em] text-[#d9ff43]">
        <span>@@##**++==--..</span>
      </div>
    );
  }
  if (preview === "glyph") {
    return (
      <div className="relative h-full overflow-hidden bg-[linear-gradient(130deg,#f04f37,#6138a8_46%,#41d6b4)]">
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[12px] tracking-[0.16em] text-white mix-blend-screen">
          A8%M#01+GLYPH
        </div>
      </div>
    );
  }
  if (preview === "print") {
    return (
      <div className="h-full bg-[#e8e3d4] bg-[radial-gradient(circle_at_3px_3px,#e52d51_0_1.7px,transparent_1.9px),radial-gradient(circle_at_8px_8px,#13a6bb_0_1.7px,transparent_1.9px),radial-gradient(circle_at_3px_8px,#e6bd21_0_1.5px,transparent_1.8px)] bg-[length:10px_10px]" />
    );
  }
  if (preview === "signal") {
    return (
      <div className="relative h-full overflow-hidden bg-[#07080b]">
        <div className="absolute inset-[28%_-8%] -skew-x-12 bg-cyan-400/80 shadow-[-7px_0_0_rgba(255,35,67,0.75),7px_0_0_rgba(87,255,73,0.7)]" />
        <div className="absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent_0_5px,rgba(255,255,255,0.08)_6px)]" />
      </div>
    );
  }
  return (
    <div className="grid h-full grid-cols-6 gap-px bg-[#07110c] p-2">
      {Array.from({ length: 24 }, (_, index) => (
        <span
          key={index}
          className={
            index % 5 === 0 ? "bg-[#d9ff43]" : index % 3 === 0 ? "bg-[#ff6b35]" : "bg-[#1b4231]"
          }
          style={{ opacity: 0.35 + ((index * 13) % 60) / 100 }}
        />
      ))}
    </div>
  );
}

export function CanvasStyleLabPanel() {
  const imageElement = useCanvasStyleTarget();
  if (!imageElement) {
    return (
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto py-5 pr-1">
        <p className={canvasDockBodyTextClassName}>
          在画布上选择一张图片，Style Lab 才能写入计算视觉方向。
        </p>
      </section>
    );
  }
  return <CanvasStyleLabPanelForImage imageElement={imageElement} />;
}

function CanvasStyleLabPanelForImage({ imageElement }: { imageElement: CanvasImageEditTarget }) {
  const setActivePanel = useCanvasStore((state) => state.setActivePanel);
  const draftRenderState = useCanvasElementDraftRenderState(imageElement.id);
  const { clearElementDraftRenderState, requestBoardPreview, setElementDraftRenderState } =
    useCanvasPreviewActions();
  const { setRenderState } = useCanvasImagePropertyActions(imageElement);
  const renderState = useMemo(
    () => resolveCanvasImageRenderState(imageElement, draftRenderState),
    [draftRenderState, imageElement]
  );
  const renderStateRef = useRef<CanvasImageRenderStateV1>(renderState);
  renderStateRef.current = renderState;
  const activePresetId = resolveComputationalStylePresetId(renderState);
  const [intensity, setIntensity] = useState(() =>
    activePresetId
      ? resolveComputationalStyleIntensity(renderState, activePresetId)
      : DEFAULT_COMPUTATIONAL_STYLE_INTENSITY
  );
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activePresetId) {
      setIntensity(resolveComputationalStyleIntensity(renderState, activePresetId));
    }
  }, [activePresetId, renderState]);

  useEffect(
    () => () => {
      clearElementDraftRenderState(imageElement.id);
    },
    [clearElementDraftRenderState, imageElement.id]
  );

  const previewState = useCallback(
    (nextState: CanvasImageRenderStateV1) => {
      setElementDraftRenderState(imageElement.id, nextState);
      void requestBoardPreview(imageElement.id, "interactive");
    },
    [imageElement.id, requestBoardPreview, setElementDraftRenderState]
  );

  const commitState = useCallback(
    async (nextState: CanvasImageRenderStateV1) => {
      setIsApplying(true);
      setError(null);
      setElementDraftRenderState(imageElement.id, nextState);
      try {
        const committed = await setRenderState(nextState);
        if (!committed) {
          setError("风格未能保存，请重试。");
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "风格写入失败，请重试。");
      } finally {
        clearElementDraftRenderState(imageElement.id);
        setIsApplying(false);
      }
    },
    [clearElementDraftRenderState, imageElement.id, setElementDraftRenderState, setRenderState]
  );

  const applyPreset = useCallback(
    (presetId: ComputationalStylePresetId, nextIntensity: number, mode: "preview" | "commit") => {
      const nextState = applyComputationalStylePreset(
        renderStateRef.current,
        presetId,
        nextIntensity
      );
      if (mode === "preview") {
        previewState(nextState);
        return;
      }
      void commitState(nextState);
    },
    [commitState, previewState]
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      <div className="space-y-5 py-5">
        <div>
          <p className={canvasDockOverlineClassName}>Direction matrix / 05</p>
          <p className="mt-2 text-sm leading-6 text-[color:var(--canvas-edit-text-muted)]">
            每个方向都写入同一份图片 renderState；切换会替换计算载体，但保留构图与语义叠层。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {COMPUTATIONAL_STYLE_PRESETS.map((preset) => {
            const isActive = preset.id === activePresetId;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={isApplying}
                onClick={() => {
                  setIntensity(DEFAULT_COMPUTATIONAL_STYLE_INTENSITY);
                  applyPreset(preset.id, DEFAULT_COMPUTATIONAL_STYLE_INTENSITY, "commit");
                }}
                className={cn(
                  "group overflow-hidden rounded-[10px] border bg-[color:var(--canvas-edit-surface-strong)] text-left transition disabled:cursor-wait disabled:opacity-60",
                  isActive
                    ? "border-[#d9ff43]/55 shadow-[0_0_0_1px_rgba(217,255,67,0.08)]"
                    : "border-[color:var(--canvas-edit-border)] hover:border-white/20"
                )}
              >
                <div className="h-[70px] border-b border-[color:var(--canvas-edit-border)]">
                  <StylePreview preview={preset.preview} />
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--canvas-edit-text-soft)]">
                    <span>{preset.code}</span>
                    {isActive ? <Check className="h-3.5 w-3.5 text-[#d9ff43]" /> : null}
                  </div>
                  <p className="mt-2 text-[13px] font-medium text-[color:var(--canvas-edit-text)]">
                    {preset.label}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[color:var(--canvas-edit-text-soft)]">
                    {preset.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className={canvasDockSectionClassName}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={canvasDockOverlineClassName}>Carrier strength</p>
              <p className="mt-1 text-sm text-[color:var(--canvas-edit-text)]">
                {activePresetId
                  ? COMPUTATIONAL_STYLE_PRESETS.find((preset) => preset.id === activePresetId)?.name
                  : "No computational carrier"}
              </p>
            </div>
            <button
              type="button"
              disabled={!activePresetId || isApplying}
              onClick={() => void commitState(clearComputationalStyle(renderStateRef.current))}
              className="flex h-8 items-center gap-1.5 rounded-[7px] border border-[color:var(--canvas-edit-border)] px-2.5 text-[10px] uppercase tracking-[0.12em] text-[color:var(--canvas-edit-text-muted)] transition hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Bypass
            </button>
          </div>
          <div className="mt-5">
            <CanvasSliderRow
              variant="canvasDock"
              label="强度"
              value={Math.round(intensity * 100)}
              min={0}
              max={100}
              step={1}
              disabled={!activePresetId || isApplying}
              format={(value) => `${Math.round(value)}%`}
              onChange={(value) => {
                const nextIntensity = value / 100;
                setIntensity(nextIntensity);
                if (activePresetId) {
                  applyPreset(activePresetId, nextIntensity, "preview");
                }
              }}
              onCommit={(value) => {
                const nextIntensity = value / 100;
                if (activePresetId) {
                  applyPreset(activePresetId, nextIntensity, "commit");
                }
              }}
            />
          </div>
          {error ? <p className="mt-3 text-xs text-[#ff8b65]">{error}</p> : null}
        </div>

        <div>
          <p className={canvasDockOverlineClassName}>Fine controls</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {ADVANCED_PANELS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActivePanel(id)}
                className={cn(
                  canvasDockActionChipClassName,
                  "flex items-center justify-center gap-1.5 px-2"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
