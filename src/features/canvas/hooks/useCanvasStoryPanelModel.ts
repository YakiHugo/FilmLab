import { useCallback, useMemo } from "react";
import type { CanvasPresetId, CanvasSlice, CanvasWorkbench } from "@/types";
import { getStudioCanvasPreset } from "../studioPresets";
import {
  planCanvasStoryPanelIntent,
  resolveCanvasSliceNamePatch,
  resolveCanvasSliceNumericPatch,
} from "../storyPanelState";
import { resolveOrderedCanvasSlices } from "../workbenchPanelState";
import { useCanvasWorkbenchActions } from "./useCanvasWorkbenchActions";

interface UseCanvasStoryPanelModelOptions {
  selectedSliceId: string | null;
  onSelectSlice: (sliceId: string | null) => void;
}

export function useCanvasStoryPanelModel({
  onSelectSlice,
  selectedSliceId,
}: UseCanvasStoryPanelModelOptions) {
  const { activeWorkbench, patchActiveWorkbench } = useCanvasWorkbenchActions();

  const orderedSlices = useMemo(
    () => resolveOrderedCanvasSlices(activeWorkbench),
    [activeWorkbench]
  );

  const selectedSlice =
    orderedSlices.find((slice) => slice.id === selectedSliceId) ?? null;
  const currentPreset = getStudioCanvasPreset(activeWorkbench?.presetId);

  const commitIntent = useCallback(
    (intent: Parameters<typeof planCanvasStoryPanelIntent>[0]["intent"]) => {
      if (!activeWorkbench) {
        return;
      }

      const plan = planCanvasStoryPanelIntent({
        intent,
        selectedSliceId,
        workbench: activeWorkbench,
      });
      if (plan.selectedSliceId !== selectedSliceId) {
        onSelectSlice(plan.selectedSliceId);
      }
      void patchActiveWorkbench(plan.patch, { trackHistory: false });
    },
    [activeWorkbench, onSelectSlice, patchActiveWorkbench, selectedSliceId]
  );

  const selectSlice = useCallback(
    (sliceId: string | null) => {
      if (sliceId !== selectedSliceId) {
        onSelectSlice(sliceId);
      }
    },
    [onSelectSlice, selectedSliceId]
  );

  const applyPreset = useCallback(
    (presetId: CanvasPresetId) => {
      commitIntent({ type: "apply-preset", presetId });
    },
    [commitIntent]
  );

  const updateSelectedSlice = useCallback(
    (patch: Partial<CanvasSlice>) => {
      if (!selectedSlice) {
        return;
      }

      commitIntent({
        type: "update-slice",
        sliceId: selectedSlice.id,
        patch,
      });
    },
    [commitIntent, selectedSlice]
  );

  const updateSelectedSliceName = useCallback(
    (value: string) => {
      updateSelectedSlice(resolveCanvasSliceNamePatch(value));
    },
    [updateSelectedSlice]
  );

  const updateSelectedSliceNumberField = useCallback(
    (key: "height" | "width" | "x" | "y", rawValue: string) => {
      updateSelectedSlice(resolveCanvasSliceNumericPatch(key, rawValue));
    },
    [updateSelectedSlice]
  );

  const deleteSelectedSlice = useCallback(() => {
    if (!selectedSlice) {
      return;
    }

    commitIntent({ type: "delete-slice", sliceId: selectedSlice.id });
  }, [commitIntent, selectedSlice]);

  const updateSafeArea = useCallback(
    (key: keyof CanvasWorkbench["safeArea"], rawValue: string) => {
      commitIntent({
        type: "update-safe-area",
        key,
        value: Number(rawValue) || 0,
      });
    },
    [commitIntent]
  );

  const updateGuide = useCallback(
    (key: keyof CanvasWorkbench["guides"], value: boolean) => {
      commitIntent({
        type: "toggle-guide",
        key,
        value,
      });
    },
    [commitIntent]
  );

  return {
    activeWorkbench,
    appendSlice: () => commitIntent({ type: "append-slice" }),
    applyPreset,
    buildStripSlices: (count: number) => commitIntent({ type: "build-strip-slices", count }),
    clearSlices: () => commitIntent({ type: "clear-slices" }),
    currentPreset,
    deleteSelectedSlice,
    orderedSlices,
    selectSlice,
    selectedSlice,
    updateGuide,
    updateSafeArea,
    updateSelectedSlice,
    updateSelectedSliceName,
    updateSelectedSliceNumberField,
  };
}
