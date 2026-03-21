import type { CanvasWorkbench, CanvasSlice } from "@/types";
import { getStudioCanvasPreset } from "./studioPresets";

const createSliceId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `slice-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
};

const nowIso = () => new Date().toISOString();

const sanitizeSliceName = (value: string, fallback: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

export const buildStripSlices = (document: CanvasWorkbench, count: number): CanvasWorkbench => {
  const preset = getStudioCanvasPreset(document.presetId);
  const safeCount = Math.max(1, Math.round(count));
  const slices: CanvasSlice[] = Array.from({ length: safeCount }, (_, index) => ({
    id: createSliceId(),
    name: `Slide ${index + 1}`,
    x: index * preset.width,
    y: 0,
    width: preset.width,
    height: preset.height,
    order: index + 1,
  }));

  return {
    ...document,
    width: preset.width * safeCount,
    height: preset.height,
    slices,
    updatedAt: nowIso(),
  };
};

export const clearCanvasSlices = (document: CanvasWorkbench): CanvasWorkbench => {
  const preset = getStudioCanvasPreset(document.presetId);
  return {
    ...document,
    width: preset.width,
    height: preset.height,
    slices: [],
    updatedAt: nowIso(),
  };
};

export const appendCanvasSlice = (document: CanvasWorkbench): CanvasWorkbench => {
  const preset = getStudioCanvasPreset(document.presetId);
  const nextOrder = document.slices.length + 1;
  const slices = [
    ...document.slices,
    {
      id: createSliceId(),
      name: `Slide ${nextOrder}`,
      x: preset.width * (nextOrder - 1),
      y: 0,
      width: preset.width,
      height: preset.height,
      order: nextOrder,
    },
  ];

  return {
    ...document,
    width: preset.width * nextOrder,
    height: preset.height,
    slices,
    updatedAt: nowIso(),
  };
};

export const updateCanvasSlice = (
  document: CanvasWorkbench,
  sliceId: string,
  patch: Partial<CanvasSlice>
): CanvasWorkbench => ({
  ...document,
  slices: document.slices
    .map((slice) =>
      slice.id === sliceId
        ? {
            ...slice,
            ...patch,
            name: sanitizeSliceName(
              typeof patch.name === "string" ? patch.name : slice.name,
              slice.name
            ),
          }
        : slice
    )
    .sort((left, right) => left.order - right.order),
  updatedAt: nowIso(),
});

export const deleteCanvasSlice = (document: CanvasWorkbench, sliceId: string): CanvasWorkbench => {
  const remaining = document.slices
    .filter((slice) => slice.id !== sliceId)
    .sort((left, right) => left.order - right.order)
    .map((slice, index) => ({
      ...slice,
      order: index + 1,
    }));

  if (remaining.length === 0) {
    return clearCanvasSlices(document);
  }

  const width = remaining.reduce((max, slice) => Math.max(max, slice.x + slice.width), 0);
  const height = remaining.reduce((max, slice) => Math.max(max, slice.y + slice.height), 0);

  return {
    ...document,
    width: Math.max(document.width, width),
    height: Math.max(document.height, height),
    slices: remaining,
    updatedAt: nowIso(),
  };
};
