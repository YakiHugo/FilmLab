import type { CSSProperties } from "react";

export const canvasEditDockStyle = {
  "--canvas-edit-rail-width": "60px",
  "--canvas-edit-panel-width": "500px",
  "--canvas-edit-bg": "#0b0b0c",
  "--canvas-edit-bg-soft": "#101011",
  "--canvas-edit-surface": "#171718",
  "--canvas-edit-surface-strong": "#131314",
  "--canvas-edit-border": "rgba(255,255,255,0.07)",
  "--canvas-edit-divider": "rgba(255,255,255,0.1)",
  "--canvas-edit-text": "#f4f4ef",
  "--canvas-edit-text-muted": "#9a9a95",
  "--canvas-edit-text-soft": "#6f6f6a",
  "--canvas-edit-pill": "#454543",
  "--canvas-edit-pill-text": "#d7d7d2",
  "--canvas-edit-track": "#151516",
  "--canvas-edit-range": "#d3d3ce",
  "--canvas-edit-thumb": "#797975",
  "--canvas-edit-shadow": "0 28px 72px rgba(0, 0, 0, 0.42)",
} as CSSProperties;

export const canvasEditDockBoundsClassName = "bottom-4 top-[64px]";
export const canvasEditDockRailLeftClassName = "left-3";
export const canvasEditDockPanelStyle = {
  left: "calc(0.75rem + var(--canvas-edit-rail-width) - 1px)",
  width: "min(var(--canvas-edit-panel-width), calc(100vw - 5.5rem))",
} as const satisfies Partial<CSSProperties>;

export const canvasDockPanelContentClassName = "flex min-h-0 flex-1 flex-col gap-5";
export const canvasDockSectionClassName =
  "rounded-[10px] border border-[color:var(--canvas-edit-border)] bg-[color:var(--canvas-edit-surface-strong)] p-4";
export const canvasDockSectionMutedClassName =
  "rounded-[10px] border border-[color:var(--canvas-edit-border)] bg-[color:var(--canvas-edit-surface)] p-4";
export const canvasDockOverlineClassName =
  "text-[10px] uppercase tracking-[0.22em] text-[color:var(--canvas-edit-text-soft)]";
export const canvasDockHeadingClassName =
  "mt-1 text-[15px] font-medium tracking-[-0.02em] text-[color:var(--canvas-edit-text)]";
export const canvasDockBodyTextClassName =
  "text-sm leading-6 text-[color:var(--canvas-edit-text-muted)]";
export const canvasDockIconBadgeClassName =
  "flex h-9 w-9 items-center justify-center rounded-[8px] border border-[color:var(--canvas-edit-border)] bg-[color:var(--canvas-edit-surface)]";
export const canvasDockBadgeClassName =
  "rounded-full border border-[color:var(--canvas-edit-border)] px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-[color:var(--canvas-edit-text-muted)]";
export const canvasDockMetricCardClassName =
  "rounded-[8px] border border-[color:var(--canvas-edit-border)] bg-[color:var(--canvas-edit-surface)] px-3 py-3";
export const canvasDockActionChipClassName =
  "h-9 rounded-[8px] border border-[color:var(--canvas-edit-border)] bg-[color:var(--canvas-edit-surface)] px-3 text-xs text-[color:var(--canvas-edit-pill-text)] transition hover:bg-[#202022] hover:text-[color:var(--canvas-edit-text)]";
export const canvasDockFieldClassName =
  "h-10 rounded-[8px] border border-[color:var(--canvas-edit-border)] bg-[color:var(--canvas-edit-surface)] px-3 text-sm text-[color:var(--canvas-edit-pill-text)]";
export const canvasDockFieldLabelClassName =
  "text-[10px] uppercase tracking-[0.2em] text-[color:var(--canvas-edit-text-soft)]";
export const canvasDockSelectTriggerClassName = canvasDockFieldClassName;
export const canvasDockSelectContentClassName =
  "border-[color:var(--canvas-edit-border)] bg-[#111112] text-[color:var(--canvas-edit-text)]";
export const canvasDockEmptyStateClassName =
  "rounded-[10px] border border-dashed border-[color:var(--canvas-edit-border)] bg-[color:var(--canvas-edit-surface-strong)]";
export const canvasDockListItemClassName =
  "rounded-[10px] border border-[color:var(--canvas-edit-border)] bg-[color:var(--canvas-edit-surface)]";
export const canvasDockInteractiveListItemClassName =
  "transition hover:border-[color:var(--canvas-edit-divider)] hover:bg-[#1b1b1d]";
export const canvasDockSelectedListItemClassName =
  "border-[color:rgba(255,255,255,0.16)] bg-[#1c1c1e] text-[color:var(--canvas-edit-text)]";
