import type { CanvasPresetId, CanvasSlice, CanvasWorkbench } from "@/types";
import type { CanvasWorkbenchEditablePatch } from "./store/canvasStoreTypes";
import { appendCanvasSlice, buildStripSlices, clearCanvasSlices, deleteCanvasSlice, updateCanvasSlice } from "./slices";
import { applyCanvasPresetToDocument } from "./studioPresets";
import {
  resolveOrderedCanvasSlices,
  resolveSelectedCanvasSliceId,
} from "./workbenchPanelState";

export type CanvasStoryPanelIntent =
  | { type: "append-slice" }
  | { type: "apply-preset"; presetId: CanvasPresetId }
  | { type: "build-strip-slices"; count: number }
  | { type: "clear-slices" }
  | { type: "delete-slice"; sliceId: string }
  | { type: "toggle-guide"; key: keyof CanvasWorkbench["guides"]; value: boolean }
  | { type: "update-safe-area"; key: keyof CanvasWorkbench["safeArea"]; value: number }
  | { type: "update-slice"; sliceId: string; patch: Partial<CanvasSlice> };

export interface CanvasStoryPanelPlan {
  orderedSlices: CanvasSlice[];
  patch: CanvasWorkbenchEditablePatch;
  selectedSliceId: string | null;
}

type CanvasSliceNumericField = "height" | "width" | "x" | "y";

const cloneSlices = (slices: CanvasSlice[]) => slices.map((slice) => ({ ...slice }));

const createSliceLayoutPatch = (
  workbench: Pick<CanvasWorkbench, "height" | "presetId" | "slices" | "width">
): CanvasWorkbenchEditablePatch => ({
  height: workbench.height,
  presetId: workbench.presetId,
  slices: cloneSlices(workbench.slices),
  width: workbench.width,
});

const createGuidePatch = (
  workbench: Pick<CanvasWorkbench, "guides">
): CanvasWorkbenchEditablePatch => ({
  guides: { ...workbench.guides },
});

const createSafeAreaPatch = (
  workbench: Pick<CanvasWorkbench, "safeArea">
): CanvasWorkbenchEditablePatch => ({
  safeArea: { ...workbench.safeArea },
});

const planNextWorkbench = (
  nextWorkbench: CanvasWorkbench,
  selectedSliceId: string | null,
  patch: CanvasWorkbenchEditablePatch
): CanvasStoryPanelPlan => {
  const orderedSlices = resolveOrderedCanvasSlices(nextWorkbench);
  return {
    orderedSlices,
    patch,
    selectedSliceId: resolveSelectedCanvasSliceId({
      orderedSlices,
      selectedSliceId,
    }),
  };
};

export const planCanvasStoryPanelIntent = ({
  intent,
  selectedSliceId,
  workbench,
}: {
  intent: CanvasStoryPanelIntent;
  selectedSliceId: string | null;
  workbench: CanvasWorkbench;
}): CanvasStoryPanelPlan => {
  switch (intent.type) {
    case "append-slice": {
      const nextWorkbench = appendCanvasSlice(workbench);
      const orderedSlices = resolveOrderedCanvasSlices(nextWorkbench);
      return {
        orderedSlices,
        patch: createSliceLayoutPatch(nextWorkbench),
        selectedSliceId: orderedSlices[orderedSlices.length - 1]?.id ?? null,
      };
    }
    case "apply-preset": {
      const presetWorkbench = applyCanvasPresetToDocument(workbench, intent.presetId);
      return planNextWorkbench(
        presetWorkbench,
        selectedSliceId,
        createSliceLayoutPatch(presetWorkbench)
      );
    }
    case "build-strip-slices": {
      const nextWorkbench = buildStripSlices(workbench, intent.count);
      const orderedSlices = resolveOrderedCanvasSlices(nextWorkbench);
      return {
        orderedSlices,
        patch: createSliceLayoutPatch(nextWorkbench),
        selectedSliceId: orderedSlices[0]?.id ?? null,
      };
    }
    case "clear-slices": {
      const nextWorkbench = clearCanvasSlices(workbench);
      return {
        orderedSlices: [],
        patch: createSliceLayoutPatch(nextWorkbench),
        selectedSliceId: null,
      };
    }
    case "delete-slice": {
      const nextWorkbench = deleteCanvasSlice(workbench, intent.sliceId);
      const orderedSlices = resolveOrderedCanvasSlices(nextWorkbench);
      return {
        orderedSlices,
        patch: createSliceLayoutPatch(nextWorkbench),
        selectedSliceId: orderedSlices[0]?.id ?? null,
      };
    }
    case "toggle-guide":
      return planNextWorkbench(
        {
          ...workbench,
          guides: {
            ...workbench.guides,
            [intent.key]: intent.value,
          },
        },
        selectedSliceId,
        createGuidePatch({
          guides: {
            ...workbench.guides,
            [intent.key]: intent.value,
          },
        })
      );
    case "update-safe-area":
      return planNextWorkbench(
        {
          ...workbench,
          safeArea: {
            ...workbench.safeArea,
            [intent.key]: Math.max(0, intent.value),
          },
        },
        selectedSliceId,
        createSafeAreaPatch({
          safeArea: {
            ...workbench.safeArea,
            [intent.key]: Math.max(0, intent.value),
          },
        })
      );
    case "update-slice": {
      const updatedSliceWorkbench = updateCanvasSlice(workbench, intent.sliceId, intent.patch);
      return planNextWorkbench(
        updatedSliceWorkbench,
        selectedSliceId,
        createSliceLayoutPatch(updatedSliceWorkbench)
      );
    }
    default:
      return planNextWorkbench(workbench, selectedSliceId, {});
  }
};

export const resolveCanvasSliceNamePatch = (value: string): Pick<CanvasSlice, "name"> => ({
  name: value,
});

export const resolveCanvasSliceNumericPatch = (
  key: CanvasSliceNumericField,
  rawValue: string
): Pick<CanvasSlice, CanvasSliceNumericField> => ({
  [key]: Math.max(key === "x" || key === "y" ? 0 : 1, Number(rawValue) || 0),
} as Pick<CanvasSlice, CanvasSliceNumericField>);
