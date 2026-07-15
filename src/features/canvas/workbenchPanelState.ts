import type { CanvasSlice, CanvasWorkbench } from "@/types";

const DEFAULT_CANVAS_WORKBENCH_NAME = "Untitled Workbench";

export const resolveCanvasWorkbenchName = (
  value: string | null | undefined,
  fallback = DEFAULT_CANVAS_WORKBENCH_NAME
) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
};

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
