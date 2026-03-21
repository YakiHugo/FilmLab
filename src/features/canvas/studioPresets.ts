import type {
  CanvasWorkbench,
  CanvasGuideSettings,
  CanvasPresetId,
  CanvasSafeArea,
} from "@/types";
import {
  normalizeCanvasWorkbench as normalizeCanvasWorkbenchRuntime,
  normalizeCanvasWorkbenchWithCleanup as normalizeCanvasWorkbenchWithCleanupRuntime,
  type NormalizableCanvasWorkbench,
  type NormalizedCanvasWorkbenchResult,
} from "./documentGraph";

export interface StudioCanvasPreset {
  id: CanvasPresetId;
  label: string;
  shortLabel: string;
  description: string;
  width: number;
  height: number;
}

export const DEFAULT_CANVAS_GUIDES: CanvasGuideSettings = {
  showCenter: false,
  showThirds: true,
  showSafeArea: true,
};

export const DEFAULT_CANVAS_SAFE_AREA: CanvasSafeArea = {
  top: 72,
  right: 72,
  bottom: 72,
  left: 72,
};

export const STUDIO_CANVAS_PRESETS: StudioCanvasPreset[] = [
  {
    id: "social-portrait",
    label: "Portrait 4:5",
    shortLabel: "4:5",
    description: "Best for cover images and carousel hero frames.",
    width: 1080,
    height: 1350,
  },
  {
    id: "social-square",
    label: "Square 1:1",
    shortLabel: "1:1",
    description: "Balanced, compact posts for feed-first sharing.",
    width: 1080,
    height: 1080,
  },
  {
    id: "social-story",
    label: "Story 9:16",
    shortLabel: "9:16",
    description: "Full-height story or reel cover compositions.",
    width: 1080,
    height: 1920,
  },
  {
    id: "social-landscape",
    label: "Landscape 16:9",
    shortLabel: "16:9",
    description: "Wide-format recaps, headers, and editorial 工作台.",
    width: 1600,
    height: 900,
  },
];

const presetMap = new Map(STUDIO_CANVAS_PRESETS.map((preset) => [preset.id, preset]));

export const getStudioCanvasPreset = (presetId: CanvasPresetId | undefined | null) =>
  (presetId ? presetMap.get(presetId) : undefined) ??
  STUDIO_CANVAS_PRESETS.find((preset) => preset.id === "social-portrait")!;

export const createDefaultCanvasWorkbenchFields = () => {
  const preset = getStudioCanvasPreset("social-portrait");
  return {
    width: preset.width,
    height: preset.height,
    presetId: preset.id,
    slices: [],
    guides: { ...DEFAULT_CANVAS_GUIDES },
    safeArea: { ...DEFAULT_CANVAS_SAFE_AREA },
  } satisfies Pick<
    CanvasWorkbench,
    "width" | "height" | "presetId" | "slices" | "guides" | "safeArea"
  >;
};

export const applyCanvasPresetToDocument = (
  document: CanvasWorkbench,
  presetId: CanvasPresetId
): CanvasWorkbench => {
  const preset = getStudioCanvasPreset(presetId);
  const orderedSlices = document.slices.slice().sort((left, right) => left.order - right.order);
  const hasSlices = orderedSlices.length > 0;
  return {
    ...document,
    presetId,
    width: hasSlices ? preset.width * orderedSlices.length : preset.width,
    height: preset.height,
    slices: hasSlices
      ? orderedSlices.map((slice, index) => ({
          ...slice,
          x: index * preset.width,
          y: 0,
          width: preset.width,
          height: preset.height,
          order: index + 1,
        }))
      : document.slices,
    updatedAt: new Date().toISOString(),
  };
};

export const normalizeCanvasWorkbenchWithCleanup = (
  document: NormalizableCanvasWorkbench
): NormalizedCanvasWorkbenchResult =>
  normalizeCanvasWorkbenchWithCleanupRuntime({
    ...document,
    width: document.width || getStudioCanvasPreset(document.presetId).width,
    height: document.height || getStudioCanvasPreset(document.presetId).height,
    presetId: document.presetId ?? getStudioCanvasPreset(document.presetId).id,
    slices: Array.isArray(document.slices)
      ? document.slices
          .map((slice, index) => ({
            ...slice,
            order: Number.isFinite(slice.order) ? slice.order : index + 1,
          }))
          .sort((left, right) => left.order - right.order)
      : [],
    guides: {
      ...DEFAULT_CANVAS_GUIDES,
      ...(document.guides ?? {}),
    },
    safeArea: {
      ...DEFAULT_CANVAS_SAFE_AREA,
      ...(document.safeArea ?? {}),
    },
  });

export const normalizeCanvasWorkbench = (document: NormalizableCanvasWorkbench): CanvasWorkbench =>
  normalizeCanvasWorkbenchRuntime({
    ...document,
    width: document.width || getStudioCanvasPreset(document.presetId).width,
    height: document.height || getStudioCanvasPreset(document.presetId).height,
    presetId: document.presetId ?? getStudioCanvasPreset(document.presetId).id,
    slices: Array.isArray(document.slices)
      ? document.slices
          .map((slice, index) => ({
            ...slice,
            order: Number.isFinite(slice.order) ? slice.order : index + 1,
          }))
          .sort((left, right) => left.order - right.order)
      : [],
    guides: {
      ...DEFAULT_CANVAS_GUIDES,
      ...(document.guides ?? {}),
    },
    safeArea: {
      ...DEFAULT_CANVAS_SAFE_AREA,
      ...(document.safeArea ?? {}),
    },
  });
