import { useCallback, useEffect, useRef } from "react";
import { normalizeAdjustments } from "@/lib/adjustments";
import type { Asset, AssetUpdate, EditingAdjustments } from "@/types";
import type { NumericAdjustmentKey } from "./types";

interface EditorPatchActions {
  applyEditorPatch: (patch: AssetUpdate) => boolean;
  stageEditorPatch: (historyKey: string, patch: AssetUpdate) => void;
  commitEditorPatch: (historyKey: string, patch: AssetUpdate) => boolean;
}

export function useEditorAdjustments(
  selectedAsset: Asset | null,
  adjustments: EditingAdjustments | null,
  actions: EditorPatchActions
) {
  const { applyEditorPatch, stageEditorPatch, commitEditorPatch } = actions;

  const pendingAdjustmentPreviewRef = useRef<{
    key: NumericAdjustmentKey;
    value: number;
  } | null>(null);
  const adjustmentPreviewFrameRef = useRef<number | null>(null);
  const latestAdjustmentsRef = useRef(adjustments);

  useEffect(() => {
    latestAdjustmentsRef.current = adjustments;
  }, [adjustments]);

  useEffect(() => {
    return () => {
      if (adjustmentPreviewFrameRef.current !== null) {
        cancelAnimationFrame(adjustmentPreviewFrameRef.current);
      }
    };
  }, []);

  const resolveLiveAdjustments = useCallback(() => {
    const currentAdjustments = latestAdjustmentsRef.current;
    if (!currentAdjustments) {
      return null;
    }
    return normalizeAdjustments(currentAdjustments);
  }, []);

  const updateAdjustments = useCallback(
    (partial: Partial<EditingAdjustments>) => {
      const currentAdjustments = resolveLiveAdjustments();
      if (!selectedAsset || !currentAdjustments) {
        return;
      }
      const nextAdjustments = {
        ...currentAdjustments,
        ...partial,
      };
      void applyEditorPatch({ adjustments: nextAdjustments });
    },
    [applyEditorPatch, resolveLiveAdjustments, selectedAsset]
  );

  const resolveLiveAsset = useCallback(() => selectedAsset, [selectedAsset]);

  const flushAdjustmentPreview = useCallback(() => {
    adjustmentPreviewFrameRef.current = null;
    const pending = pendingAdjustmentPreviewRef.current;
    pendingAdjustmentPreviewRef.current = null;
    const liveAsset = resolveLiveAsset();
    const liveAdjustments = resolveLiveAdjustments();
    if (!pending || !liveAsset || !liveAdjustments) {
      return;
    }
    const nextAdjustments = {
      ...liveAdjustments,
      [pending.key]: pending.value,
    };
    stageEditorPatch(`adjustment:${pending.key}`, {
      adjustments: nextAdjustments,
    });
  }, [resolveLiveAdjustments, resolveLiveAsset, stageEditorPatch]);

  const previewAdjustmentValue = useCallback(
    (key: NumericAdjustmentKey, value: number) => {
      if (!selectedAsset || !latestAdjustmentsRef.current) {
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
      const liveAsset = resolveLiveAsset();
      const liveAdjustments = resolveLiveAdjustments();
      if (!liveAsset || !liveAdjustments) {
        return;
      }
      if (adjustmentPreviewFrameRef.current !== null) {
        cancelAnimationFrame(adjustmentPreviewFrameRef.current);
        adjustmentPreviewFrameRef.current = null;
      }
      pendingAdjustmentPreviewRef.current = null;
      const nextAdjustments = {
        ...liveAdjustments,
        [key]: value,
      };
      void commitEditorPatch(`adjustment:${key}`, {
        adjustments: nextAdjustments,
      });
    },
    [commitEditorPatch, resolveLiveAdjustments, resolveLiveAsset]
  );

  const previewCropAdjustments = useCallback(
    (
      partial: Partial<
        Pick<EditingAdjustments, "horizontal" | "vertical" | "scale" | "customAspectRatio">
      >
    ) => {
      const liveAsset = resolveLiveAsset();
      const liveAdjustments = resolveLiveAdjustments();
      if (!liveAsset || !liveAdjustments) {
        return;
      }
      const nextAdjustments = {
        ...liveAdjustments,
        ...partial,
      };
      stageEditorPatch("crop:interaction", {
        adjustments: nextAdjustments,
      });
    },
    [resolveLiveAdjustments, resolveLiveAsset, stageEditorPatch]
  );

  const commitCropAdjustments = useCallback(
    (
      partial: Partial<
        Pick<EditingAdjustments, "horizontal" | "vertical" | "scale" | "customAspectRatio">
      >
    ) => {
      const liveAsset = resolveLiveAsset();
      const liveAdjustments = resolveLiveAdjustments();
      if (!liveAsset || !liveAdjustments) {
        return false;
      }
      const nextAdjustments = {
        ...liveAdjustments,
        ...partial,
      };
      return commitEditorPatch("crop:interaction", {
        adjustments: nextAdjustments,
      });
    },
    [commitEditorPatch, resolveLiveAdjustments, resolveLiveAsset]
  );

  const previewAdjustmentPatch = useCallback(
    (historyKey: string, partial: Partial<EditingAdjustments>) => {
      const liveAsset = resolveLiveAsset();
      const liveAdjustments = resolveLiveAdjustments();
      if (!liveAsset || !liveAdjustments) {
        return;
      }
      const nextAdjustments = {
        ...liveAdjustments,
        ...partial,
      };
      stageEditorPatch(`patch:${historyKey}`, {
        adjustments: nextAdjustments,
      });
    },
    [resolveLiveAdjustments, resolveLiveAsset, stageEditorPatch]
  );

  const commitAdjustmentPatch = useCallback(
    (historyKey: string, partial: Partial<EditingAdjustments>) => {
      const liveAsset = resolveLiveAsset();
      const liveAdjustments = resolveLiveAdjustments();
      if (!liveAsset || !liveAdjustments) {
        return false;
      }
      const nextAdjustments = {
        ...liveAdjustments,
        ...partial,
      };
      return commitEditorPatch(`patch:${historyKey}`, {
        adjustments: nextAdjustments,
      });
    },
    [commitEditorPatch, resolveLiveAdjustments, resolveLiveAsset]
  );

  const toggleFlip = useCallback(
    (axis: "flipHorizontal" | "flipVertical") => {
      const currentAdjustments = resolveLiveAdjustments();
      if (!selectedAsset || !currentAdjustments) {
        return;
      }
      void applyEditorPatch({
        adjustments: {
          ...currentAdjustments,
          [axis]: !currentAdjustments[axis],
        },
      });
    },
    [applyEditorPatch, resolveLiveAdjustments, selectedAsset]
  );

  const previewPointCurve = useCallback(
    (points: EditingAdjustments["pointCurve"]["rgb"]) => {
      const liveAsset = resolveLiveAsset();
      const currentAdjustments = resolveLiveAdjustments();
      if (!liveAsset || !currentAdjustments) {
        return;
      }
      const nextAdjustments = {
        ...currentAdjustments,
        pointCurve: {
          ...currentAdjustments.pointCurve,
          rgb: points.map((point) => ({
            x: point.x,
            y: point.y,
          })),
        },
      };
      stageEditorPatch("curve:point", {
        adjustments: nextAdjustments,
      });
    },
    [resolveLiveAdjustments, resolveLiveAsset, stageEditorPatch]
  );

  const commitPointCurve = useCallback(
    (points: EditingAdjustments["pointCurve"]["rgb"]) => {
      const liveAsset = resolveLiveAsset();
      const currentAdjustments = resolveLiveAdjustments();
      if (!liveAsset || !currentAdjustments) {
        return false;
      }
      const nextAdjustments = {
        ...currentAdjustments,
        pointCurve: {
          ...currentAdjustments.pointCurve,
          rgb: points.map((point) => ({
            x: point.x,
            y: point.y,
          })),
        },
      };
      return commitEditorPatch("curve:point", {
        adjustments: nextAdjustments,
      });
    },
    [commitEditorPatch, resolveLiveAdjustments, resolveLiveAsset]
  );

  return {
    updateAdjustments,
    previewAdjustmentValue,
    updateAdjustmentValue,
    previewCropAdjustments,
    commitCropAdjustments,
    previewAdjustmentPatch,
    commitAdjustmentPatch,
    toggleFlip,
    previewPointCurve,
    commitPointCurve,
  };
}
