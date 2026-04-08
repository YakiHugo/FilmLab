import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import { useEditorStore, type PointColorPickTarget } from "@/stores/editorStore";
import type { Asset, AssetUpdate, EditingAdjustments, HslColorKey } from "@/types";
import { mapHueToHslColor, rgbToHue, toHex } from "./colorUtils";

interface EditorPatchActions {
  applyEditorPatch: (patch: AssetUpdate) => boolean;
  stageEditorPatch: (historyKey: string, patch: AssetUpdate) => void;
  commitEditorPatch: (historyKey: string, patch: AssetUpdate) => boolean;
}

export function useEditorColorGrading(
  selectedAsset: Asset | null,
  adjustments: EditingAdjustments | null,
  actions: EditorPatchActions
) {
  const { applyEditorPatch, stageEditorPatch, commitEditorPatch } = actions;

  const {
    activeHslColor,
    pointColorPicking,
    pointColorPickTarget,
    lastPointColorSample,
    setActiveHslColor,
    setPointColorPicking,
    setPointColorPickTarget,
    setLastPointColorSample,
  } = useEditorStore(
    useShallow((state) => ({
      activeHslColor: state.activeHslColor,
      pointColorPicking: state.pointColorPicking,
      pointColorPickTarget: state.pointColorPickTarget,
      lastPointColorSample: state.lastPointColorSample,
      setActiveHslColor: state.setActiveHslColor,
      setPointColorPicking: state.setPointColorPicking,
      setPointColorPickTarget: state.setPointColorPickTarget,
      setLastPointColorSample: state.setLastPointColorSample,
    }))
  );

  const resolveCurrentAdjustments = useCallback(() => {
    if (!adjustments) {
      return null;
    }
    return normalizeAdjustments(adjustments);
  }, [adjustments]);

  const previewHslValue = useCallback(
    (color: HslColorKey, channel: "hue" | "saturation" | "luminance", value: number) => {
      const currentAdjustments = resolveCurrentAdjustments();
      if (!selectedAsset || !currentAdjustments) {
        return;
      }
      stageEditorPatch(`hsl:${color}:${channel}`, {
        adjustments: {
          ...currentAdjustments,
          hsl: {
            ...currentAdjustments.hsl,
            [color]: {
              ...currentAdjustments.hsl[color],
              [channel]: value,
            },
          },
        },
      });
    },
    [resolveCurrentAdjustments, selectedAsset, stageEditorPatch]
  );

  const updateHslValue = useCallback(
    (color: HslColorKey, channel: "hue" | "saturation" | "luminance", value: number) => {
      const currentAdjustments = resolveCurrentAdjustments();
      if (!selectedAsset || !currentAdjustments) {
        return;
      }
      void commitEditorPatch(`hsl:${color}:${channel}`, {
        adjustments: {
          ...currentAdjustments,
          hsl: {
            ...currentAdjustments.hsl,
            [color]: {
              ...currentAdjustments.hsl[color],
              [channel]: value,
            },
          },
        },
      });
    },
    [commitEditorPatch, resolveCurrentAdjustments, selectedAsset]
  );

  const previewColorGradingZone = useCallback(
    (
      zone: "shadows" | "midtones" | "highlights",
      value: EditingAdjustments["colorGrading"]["shadows"]
    ) => {
      const currentAdjustments = resolveCurrentAdjustments();
      if (!selectedAsset || !currentAdjustments) {
        return;
      }
      stageEditorPatch(`grading:${zone}`, {
        adjustments: {
          ...currentAdjustments,
          colorGrading: {
            ...currentAdjustments.colorGrading,
            [zone]: value,
          },
        },
      });
    },
    [resolveCurrentAdjustments, selectedAsset, stageEditorPatch]
  );

  const updateColorGradingZone = useCallback(
    (
      zone: "shadows" | "midtones" | "highlights",
      value: EditingAdjustments["colorGrading"]["shadows"]
    ) => {
      const currentAdjustments = resolveCurrentAdjustments();
      if (!selectedAsset || !currentAdjustments) {
        return;
      }
      void commitEditorPatch(`grading:${zone}`, {
        adjustments: {
          ...currentAdjustments,
          colorGrading: {
            ...currentAdjustments.colorGrading,
            [zone]: value,
          },
        },
      });
    },
    [commitEditorPatch, resolveCurrentAdjustments, selectedAsset]
  );

  const previewColorGradingValue = useCallback(
    (key: "blend" | "balance", value: number) => {
      const currentAdjustments = resolveCurrentAdjustments();
      if (!selectedAsset || !currentAdjustments) {
        return;
      }
      stageEditorPatch(`grading:${key}`, {
        adjustments: {
          ...currentAdjustments,
          colorGrading: {
            ...currentAdjustments.colorGrading,
            [key]: value,
          },
        },
      });
    },
    [resolveCurrentAdjustments, selectedAsset, stageEditorPatch]
  );

  const updateColorGradingValue = useCallback(
    (key: "blend" | "balance", value: number) => {
      const currentAdjustments = resolveCurrentAdjustments();
      if (!selectedAsset || !currentAdjustments) {
        return;
      }
      void commitEditorPatch(`grading:${key}`, {
        adjustments: {
          ...currentAdjustments,
          colorGrading: {
            ...currentAdjustments.colorGrading,
            [key]: value,
          },
        },
      });
    },
    [commitEditorPatch, resolveCurrentAdjustments, selectedAsset]
  );

  const resetColorGrading = useCallback(() => {
    const currentAdjustments = resolveCurrentAdjustments();
    if (!selectedAsset || !currentAdjustments) {
      return false;
    }
    const defaults = createDefaultAdjustments().colorGrading;
    return applyEditorPatch({
      adjustments: {
        ...currentAdjustments,
        colorGrading: {
          shadows: { ...defaults.shadows },
          midtones: { ...defaults.midtones },
          highlights: { ...defaults.highlights },
          blend: defaults.blend,
          balance: defaults.balance,
        },
      },
    });
  }, [applyEditorPatch, resolveCurrentAdjustments, selectedAsset]);

  const startPointColorPick = useCallback(
    (target: PointColorPickTarget = "hsl") => {
      setPointColorPickTarget(target);
      setPointColorPicking(true);
    },
    [setPointColorPickTarget, setPointColorPicking]
  );

  const cancelPointColorPick = useCallback(() => {
    setPointColorPicking(false);
    setPointColorPickTarget("hsl");
  }, [setPointColorPickTarget, setPointColorPicking]);

  const commitPointColorSample = useCallback(
    (sample: { red: number; green: number; blue: number }) => {
      const hue = rgbToHue(sample.red, sample.green, sample.blue);
      const mappedColor = mapHueToHslColor(hue);
      const hex = `#${toHex(sample.red)}${toHex(sample.green)}${toHex(sample.blue)}`;
      setActiveHslColor(mappedColor);
      setLastPointColorSample({
        red: sample.red,
        green: sample.green,
        blue: sample.blue,
        hue,
        hex,
        mappedColor,
      });
      setPointColorPicking(false);
      setPointColorPickTarget("hsl");
      return mappedColor;
    },
    [setActiveHslColor, setLastPointColorSample, setPointColorPickTarget, setPointColorPicking]
  );

  return {
    activeHslColor,
    pointColorPicking,
    pointColorPickTarget,
    lastPointColorSample,
    setActiveHslColor,
    previewHslValue,
    updateHslValue,
    previewColorGradingZone,
    updateColorGradingZone,
    previewColorGradingValue,
    updateColorGradingValue,
    resetColorGrading,
    startPointColorPick,
    cancelPointColorPick,
    commitPointColorSample,
  };
}
