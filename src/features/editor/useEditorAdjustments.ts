import { useCallback, useEffect, useRef } from "react";
import { normalizeAdjustments } from "@/lib/adjustments";
import { useProjectStore } from "@/stores/projectStore";
import type { Asset, AssetUpdate, EditingAdjustments } from "@/types";
import type { NumericAdjustmentKey } from "./types";

interface EditorPatchActions {
  applyEditorPatch: (patch: AssetUpdate) => boolean;
  stageEditorPatch: (historyKey: string, patch: AssetUpdate) => void;
  commitEditorPatch: (historyKey: string, patch: AssetUpdate) => boolean;
}

export function useEditorAdjustments(selectedAsset: Asset | null, actions: EditorPatchActions) {
  const { applyEditorPatch, stageEditorPatch, commitEditorPatch } = actions;

  const pendingAdjustmentPreviewRef = useRef<{
    key: NumericAdjustmentKey;
    value: number;
  } | null>(null);
  const adjustmentPreviewFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (adjustmentPreviewFrameRef.current !== null) {
        cancelAnimationFrame(adjustmentPreviewFrameRef.current);
      }
    };
  }, []);

  const updateAdjustments = useCallback(
    (partial: Partial<EditingAdjustments>) => {
      if (!selectedAsset) {
        return;
      }
      const nextAdjustments = {
        ...normalizeAdjustments(selectedAsset.adjustments),
        ...partial,
      };
      void applyEditorPatch({ adjustments: nextAdjustments });
    },
    [applyEditorPatch, selectedAsset]
  );

  const flushAdjustmentPreview = useCallback(() => {
    adjustmentPreviewFrameRef.current = null;
    const pending = pendingAdjustmentPreviewRef.current;
    pendingAdjustmentPreviewRef.current = null;
    if (!pending || !selectedAsset) {
      return;
    }
    const nextAdjustments = {
      ...normalizeAdjustments(selectedAsset.adjustments),
      [pending.key]: pending.value,
    };
    stageEditorPatch(`adjustment:${pending.key}`, {
      adjustments: nextAdjustments,
    });
  }, [selectedAsset, stageEditorPatch]);

  const previewAdjustmentValue = useCallback(
    (key: NumericAdjustmentKey, value: number) => {
      if (!selectedAsset) {
        return;
      }
      pendingAdjustmentPreviewRef.current = { key, value };
      if (adjustmentPreviewFrameRef.current === null) {
        adjustmentPreviewFrameRef.current = requestAnimationFrame(flushAdjustmentPreview);
      }
    },
    [selectedAsset, flushAdjustmentPreview]
  );

  const updateAdjustmentValue = useCallback(
    (key: NumericAdjustmentKey, value: number) => {
      if (!selectedAsset) {
        return;
      }
      if (adjustmentPreviewFrameRef.current !== null) {
        cancelAnimationFrame(adjustmentPreviewFrameRef.current);
        adjustmentPreviewFrameRef.current = null;
      }
      pendingAdjustmentPreviewRef.current = null;
      const nextAdjustments = {
        ...normalizeAdjustments(selectedAsset.adjustments),
        [key]: value,
      };
      void commitEditorPatch(`adjustment:${key}`, {
        adjustments: nextAdjustments,
      });
    },
    [commitEditorPatch, selectedAsset]
  );

  const previewCropAdjustments = useCallback(
    (
      partial: Partial<
        Pick<EditingAdjustments, "horizontal" | "vertical" | "scale" | "customAspectRatio">
      >
    ) => {
      const assetId = selectedAsset?.id;
      if (!assetId) {
        return;
      }
      const liveAsset =
        useProjectStore.getState().assets.find((asset) => asset.id === assetId) ?? selectedAsset;
      if (!liveAsset) {
        return;
      }
      const nextAdjustments = {
        ...normalizeAdjustments(liveAsset.adjustments),
        ...partial,
      };
      stageEditorPatch("crop:interaction", {
        adjustments: nextAdjustments,
      });
    },
    [selectedAsset, stageEditorPatch]
  );

  const commitCropAdjustments = useCallback(
    (
      partial: Partial<
        Pick<EditingAdjustments, "horizontal" | "vertical" | "scale" | "customAspectRatio">
      >
    ) => {
      const assetId = selectedAsset?.id;
      if (!assetId) {
        return false;
      }
      const liveAsset =
        useProjectStore.getState().assets.find((asset) => asset.id === assetId) ?? selectedAsset;
      if (!liveAsset) {
        return false;
      }
      const nextAdjustments = {
        ...normalizeAdjustments(liveAsset.adjustments),
        ...partial,
      };
      return commitEditorPatch("crop:interaction", {
        adjustments: nextAdjustments,
      });
    },
    [commitEditorPatch, selectedAsset]
  );

  const toggleFlip = useCallback(
    (axis: "flipHorizontal" | "flipVertical") => {
      if (!selectedAsset) {
        return;
      }
      const currentAdjustments = normalizeAdjustments(selectedAsset.adjustments);
      void applyEditorPatch({
        adjustments: {
          ...currentAdjustments,
          [axis]: !currentAdjustments[axis],
        },
      });
    },
    [applyEditorPatch, selectedAsset]
  );

  return {
    updateAdjustments,
    previewAdjustmentValue,
    updateAdjustmentValue,
    previewCropAdjustments,
    commitCropAdjustments,
    toggleFlip,
  };
}
