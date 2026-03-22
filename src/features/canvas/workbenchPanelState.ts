import type { CanvasSlice, CanvasWorkbench } from "@/types";
import type { CanvasWorkbenchEditablePatch } from "./store/canvasStoreTypes";

export const DEFAULT_CANVAS_WORKBENCH_NAME = "Untitled Workbench";

export const resolveCanvasWorkbenchName = (
  value: string | null | undefined,
  fallback = DEFAULT_CANVAS_WORKBENCH_NAME
) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
};

export const resolveCanvasWorkbenchSequenceName = (index: number) =>
  `Workbench ${String(Math.max(1, Math.round(index))).padStart(2, "0")}`;

export const resolveOrderedCanvasSlices = (
  workbench: Pick<CanvasWorkbench, "slices"> | null | undefined
): CanvasSlice[] =>
  (workbench?.slices ?? [])
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((slice) => ({ ...slice }));

export const resolveSelectedCanvasSliceId = ({
  orderedSlices,
  selectedSliceId,
}: {
  orderedSlices: CanvasSlice[];
  selectedSliceId: string | null;
}) => {
  if (selectedSliceId && orderedSlices.some((slice) => slice.id === selectedSliceId)) {
    return selectedSliceId;
  }

  return orderedSlices[0]?.id ?? null;
};

export const createCanvasWorkbenchEditablePatch = (
  workbench: Pick<
    CanvasWorkbench,
    | "backgroundColor"
    | "guides"
    | "height"
    | "name"
    | "presetId"
    | "safeArea"
    | "slices"
    | "thumbnailBlob"
    | "width"
  >
): CanvasWorkbenchEditablePatch => ({
  backgroundColor: workbench.backgroundColor,
  guides: { ...workbench.guides },
  height: workbench.height,
  name: workbench.name,
  presetId: workbench.presetId,
  safeArea: { ...workbench.safeArea },
  slices: workbench.slices.map((slice) => ({ ...slice })),
  thumbnailBlob: workbench.thumbnailBlob,
  width: workbench.width,
});
