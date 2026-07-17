import { Check, Clock3, Download, Frame, Stamp, Type } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore, type CanvasFloatingPanel } from "@/stores/canvasStore";
import type { CanvasOutputPresetId } from "@/types";
import {
  canvasDockBodyTextClassName,
  canvasDockOverlineClassName,
  canvasDockSectionClassName,
} from "./editDockTheme";
import { useCanvasLoadedWorkbenchCommands } from "./hooks/useCanvasLoadedWorkbenchCommands";
import { getCanvasImageEditValues } from "./image/imageRenderStateEditing";
import {
  selectIsCanvasWorkbenchMutationPending,
  selectLoadedWorkbench,
} from "./store/canvasStoreSelectors";
import {
  getCanvasOutputFormatBlockReason,
  getStudioCanvasPreset,
  resolveCanvasSemanticOverlayImageId,
} from "./studioPresets";

const OUTPUT_PRESET_IDS: CanvasOutputPresetId[] = [
  "social-square",
  "social-portrait",
  "social-story",
];

const OVERLAY_PANELS = [
  { id: "caption" as const, label: "Caption", icon: Type },
  { id: "timestamp" as const, label: "Timestamp", icon: Clock3 },
  { id: "watermark" as const, label: "Watermark", icon: Stamp },
] as const;

interface CanvasOutputPanelProps {
  onExport: () => void;
}

export function CanvasOutputPanel({ onExport }: CanvasOutputPanelProps) {
  const workbench = useCanvasStore(selectLoadedWorkbench);
  const isMutationPending = useCanvasStore(selectIsCanvasWorkbenchMutationPending);
  const setActivePanel = useCanvasStore((state) => state.setActivePanel);
  const setSelectedElementIds = useCanvasStore((state) => state.setSelectedElementIds);
  const { executeCommand } = useCanvasLoadedWorkbenchCommands();
  const [applyingPresetId, setApplyingPresetId] = useState<CanvasOutputPresetId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const outputImageId = workbench ? resolveCanvasSemanticOverlayImageId(workbench) : null;
  const outputImage =
    outputImageId && workbench?.nodes[outputImageId]?.type === "image"
      ? workbench.nodes[outputImageId]
      : null;
  const editValues = useMemo(
    () => (outputImage ? getCanvasImageEditValues(outputImage.renderState) : null),
    [outputImage]
  );
  const blockReason = workbench ? getCanvasOutputFormatBlockReason(workbench) : null;
  const blockMessage =
    blockReason === "grouped-cover"
      ? "The cover image is grouped. Ungroup it before switching the output format."
      : blockReason === "sliced-workbench"
        ? "Legacy sliced workbenches cannot switch to a single-frame format directly."
        : null;

  const overlayEnabled = {
    caption: Boolean(editValues?.caption.enabled),
    timestamp: Boolean(editValues?.timestamp.enabled),
    watermark: Boolean(editValues?.watermark.enabled),
  };

  const applyPreset = async (presetId: CanvasOutputPresetId) => {
    if (!workbench || blockReason || applyingPresetId || isMutationPending) {
      return;
    }
    setApplyingPresetId(presetId);
    setError(null);
    try {
      const committed = await executeCommand({
        type: "APPLY_OUTPUT_FORMAT",
        presetId,
      });
      if (!committed) {
        setError("画幅未能保存，请重试。");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "画幅切换失败，请重试。");
    } finally {
      setApplyingPresetId(null);
    }
  };

  const openOverlayPanel = (panel: Exclude<CanvasFloatingPanel, null>) => {
    if (!outputImageId || applyingPresetId || isMutationPending) {
      return;
    }
    setSelectedElementIds([outputImageId]);
    setActivePanel(panel);
  };

  if (!workbench) {
    return (
      <section className="py-5">
        <p className={canvasDockBodyTextClassName}>先打开一个作品，再配置输出。</p>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      <div className="space-y-5 py-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className={canvasDockOverlineClassName}>Artifact / final frame</p>
            <p className="mt-2 font-mono text-[12px] text-[color:var(--canvas-edit-text-muted)]">
              {workbench.width} × {workbench.height} PX
            </p>
          </div>
          <span className="rounded border border-[color:var(--canvas-edit-divider)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--canvas-edit-text-soft)]">
            {getStudioCanvasPreset(workbench.presetId).shortLabel}
          </span>
        </div>

        <div className={canvasDockSectionClassName}>
          <div className="mb-3 flex items-center gap-2">
            <Frame className="h-4 w-4 text-[color:var(--canvas-edit-text-muted)]" />
            <p className="text-sm font-medium text-[color:var(--canvas-edit-text)]">Output ratio</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {OUTPUT_PRESET_IDS.map((presetId) => {
              const preset = getStudioCanvasPreset(presetId);
              const active = workbench.presetId === presetId;
              const busy = applyingPresetId === presetId;
              return (
                <button
                  key={presetId}
                  type="button"
                  disabled={Boolean(blockReason) || Boolean(applyingPresetId) || isMutationPending}
                  onClick={() => void applyPreset(presetId)}
                  className={cn(
                    "relative flex min-h-[92px] flex-col items-center justify-end gap-2 overflow-hidden rounded-[8px] border px-2 pb-3 pt-2 transition disabled:cursor-not-allowed disabled:opacity-45",
                    active
                      ? "border-[#d9ff43]/55 bg-[#d9ff43]/[0.08] text-[#eaff9d]"
                      : "border-[color:var(--canvas-edit-border)] bg-[color:var(--canvas-edit-surface)] text-[color:var(--canvas-edit-text-muted)] hover:border-[color:var(--canvas-edit-divider)] hover:text-[color:var(--canvas-edit-text)]"
                  )}
                >
                  <span
                    className="block border border-current/40 bg-black/40"
                    style={{
                      width: `${Math.max(20, 32 * (preset.width / preset.height))}px`,
                      height: `${Math.max(28, 32 * (preset.height / preset.width))}px`,
                    }}
                  />
                  <span className="font-mono text-[11px] tracking-[0.08em]">
                    {busy ? "WRITE" : preset.shortLabel}
                  </span>
                  {active ? <Check className="absolute right-2 top-2 h-3.5 w-3.5" /> : null}
                </button>
              );
            })}
          </div>
          {blockMessage ? (
            <p className="mt-3 text-xs leading-5 text-amber-300/80">{blockMessage}</p>
          ) : null}
          {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
        </div>

        <div className={canvasDockSectionClassName}>
          <p className="mb-3 text-sm font-medium text-[color:var(--canvas-edit-text)]">
            Semantic overlays
          </p>
          <div className="space-y-2">
            {OVERLAY_PANELS.map((overlay) => {
              const Icon = overlay.icon;
              const enabled = overlayEnabled[overlay.id];
              return (
                <button
                  key={overlay.id}
                  type="button"
                  disabled={!outputImageId || Boolean(applyingPresetId) || isMutationPending}
                  onClick={() => openOverlayPanel(overlay.id)}
                  className="flex w-full items-center justify-between rounded-[8px] border border-[color:var(--canvas-edit-border)] bg-[color:var(--canvas-edit-surface)] px-3 py-3 text-left transition hover:border-[color:var(--canvas-edit-divider)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-[color:var(--canvas-edit-text-muted)]" />
                    <span className="text-sm text-[color:var(--canvas-edit-text)]">
                      {overlay.label}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[10px] uppercase tracking-[0.14em]",
                      enabled ? "text-[#d9ff43]" : "text-[color:var(--canvas-edit-text-soft)]"
                    )}
                  >
                    {enabled ? "ON" : "OFF"}
                  </span>
                </button>
              );
            })}
          </div>
          {!outputImageId ? (
            <p className="mt-3 text-xs leading-5 text-[color:var(--canvas-edit-text-soft)]">
              添加一张主图后才能写入语义叠层。
            </p>
          ) : null}
        </div>

        <Button
          type="button"
          disabled={Boolean(applyingPresetId) || isMutationPending}
          onClick={onExport}
          className="h-11 w-full rounded-[8px] bg-[#d9ff43] font-mono text-[12px] font-semibold uppercase tracking-[0.12em] text-[#0b0d08] hover:bg-[#e5ff78] disabled:cursor-wait disabled:opacity-50"
        >
          <Download className="mr-2 h-4 w-4" />
          Render artifact
        </Button>
      </div>
    </section>
  );
}
