import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PreviewRoi } from "@/lib/previewRoi";
import { mapPreviewPointToImageCoordinates } from "@/lib/previewRoi";
import type { EditingAdjustments, LocalAdjustment, LocalBrushMask } from "@/types";
import type { BrushStrokePoint } from "./contracts";
import type { PreviewInteractionSampler } from "./interactionPerformance";
import { resolvePreviewPointerPosition } from "./contracts";

type BrushLocalAdjustment = LocalAdjustment & { mask: LocalBrushMask };

export interface BrushMaskPreviewState {
  maskId: string;
  points: BrushStrokePoint[];
}

export interface UseBrushMaskPaintingInput {
  adjustments: EditingAdjustments | null;
  activeToolPanelId: string | null | undefined;
  selectedLocalAdjustmentId: string | null;
  pointColorPicking: boolean;
  isCropMode: boolean;
  previewRoi: PreviewRoi | null;
  showOriginal: boolean;
  commitAdjustmentPatch: (historyKey: string, partial: Partial<EditingAdjustments>) => boolean;
  performanceSampler: PreviewInteractionSampler;
}

export interface UseBrushMaskPaintingOutput {
  activeBrushMaskId: string | null;
  brushPaintEnabled: boolean;
  handleBrushPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  handleBrushPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  handleBrushPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  previewState: BrushMaskPreviewState | null;
}

const cloneBrushPoints = (points: BrushStrokePoint[]) =>
  points.map((point) => ({
    x: point.x,
    y: point.y,
    pressure: point.pressure,
  }));

export const applyBrushPreviewToAdjustments = (
  adjustments: EditingAdjustments,
  previewState: BrushMaskPreviewState | null
) => {
  if (!previewState) {
    return adjustments;
  }
  const localAdjustments = adjustments.localAdjustments ?? [];
  return {
    ...adjustments,
    localAdjustments: localAdjustments.map((item) =>
      item.id === previewState.maskId && item.mask.mode === "brush"
        ? {
            ...item,
            mask: {
              ...item.mask,
              points: cloneBrushPoints(previewState.points),
            },
          }
        : item
    ),
  };
};

export function useBrushMaskPainting({
  adjustments,
  activeToolPanelId,
  selectedLocalAdjustmentId,
  pointColorPicking,
  isCropMode,
  previewRoi,
  showOriginal,
  commitAdjustmentPatch,
  performanceSampler,
}: UseBrushMaskPaintingInput): UseBrushMaskPaintingOutput {
  const brushPreviewFrameRef = useRef<number | null>(null);
  const latestAdjustmentsRef = useRef(adjustments);
  const previewStateRef = useRef<BrushMaskPreviewState | null>(null);
  const brushPaintSessionRef = useRef<{
    pointerId: number;
    maskId: string;
    points: BrushStrokePoint[];
  } | null>(null);
  const [previewState, setPreviewStateValue] = useState<BrushMaskPreviewState | null>(null);

  latestAdjustmentsRef.current = adjustments;

  const activeBrushMask = useMemo<BrushLocalAdjustment | null>(() => {
    if (!adjustments || activeToolPanelId !== "mask") {
      return null;
    }
    const localAdjustments = adjustments.localAdjustments ?? [];
    if (localAdjustments.length === 0) {
      return null;
    }
    const selected =
      (selectedLocalAdjustmentId
        ? localAdjustments.find((item) => item.id === selectedLocalAdjustmentId)
        : null) ?? localAdjustments[0];
    if (!selected || !selected.enabled || selected.mask.mode !== "brush") {
      return null;
    }
    return selected as BrushLocalAdjustment;
  }, [activeToolPanelId, adjustments, selectedLocalAdjustmentId]);

  const brushPaintEnabled =
    Boolean(activeBrushMask) &&
    !pointColorPicking &&
    !isCropMode &&
    !showOriginal &&
    Boolean(adjustments);

  const setPreviewState = useCallback((next: BrushMaskPreviewState | null) => {
    previewStateRef.current = next;
    setPreviewStateValue(next);
  }, []);

  const flushBrushPreview = useCallback(() => {
    const frameStartedAt = performance.now();
    brushPreviewFrameRef.current = null;
    const pending = previewStateRef.current;
    if (!pending) {
      return;
    }
    setPreviewState({
      maskId: pending.maskId,
      points: cloneBrushPoints(pending.points),
    });
    performanceSampler.recordFrame(frameStartedAt);
  }, [performanceSampler, setPreviewState]);

  const stopPainting = useCallback(() => {
    if (brushPreviewFrameRef.current !== null) {
      cancelAnimationFrame(brushPreviewFrameRef.current);
      brushPreviewFrameRef.current = null;
    }
    brushPaintSessionRef.current = null;
    setPreviewState(null);
    performanceSampler.finish();
  }, [performanceSampler, setPreviewState]);

  useEffect(() => {
    return () => {
      if (brushPreviewFrameRef.current !== null) {
        cancelAnimationFrame(brushPreviewFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (brushPaintEnabled) {
      return;
    }
    stopPainting();
  }, [brushPaintEnabled, stopPainting]);

  const handleBrushPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!brushPaintEnabled || !activeBrushMask || event.button !== 0) {
        return;
      }
      const pointer = resolvePreviewPointerPosition(event, event.currentTarget);
      if (!pointer) {
        return;
      }
      const mappedPointer = mapPreviewPointToImageCoordinates(pointer, previewRoi);
      performanceSampler.start();
      const basePoints = activeBrushMask.mask.points.map((point) => ({
        x: point.x,
        y: point.y,
        pressure: point.pressure ?? 1,
      }));
      const nextPoints = [
        ...basePoints,
        {
          x: mappedPointer.x,
          y: mappedPointer.y,
          pressure: mappedPointer.pressure,
        },
      ];
      brushPaintSessionRef.current = {
        pointerId: event.pointerId,
        maskId: activeBrushMask.id,
        points: nextPoints,
      };
      setPreviewState({
        maskId: activeBrushMask.id,
        points: cloneBrushPoints(nextPoints),
      });
      if (brushPreviewFrameRef.current === null) {
        brushPreviewFrameRef.current = requestAnimationFrame(flushBrushPreview);
      }
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [
      activeBrushMask,
      brushPaintEnabled,
      flushBrushPreview,
      performanceSampler,
      previewRoi,
      setPreviewState,
    ]
  );

  const handleBrushPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const session = brushPaintSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }
      const pointer = resolvePreviewPointerPosition(event, event.currentTarget);
      if (!pointer) {
        return;
      }
      const mappedPointer = mapPreviewPointToImageCoordinates(pointer, previewRoi);
      const lastPoint = session.points[session.points.length - 1];
      if (!lastPoint) {
        return;
      }
      const dx = mappedPointer.x - lastPoint.x;
      const dy = mappedPointer.y - lastPoint.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.0018) {
        return;
      }
      const steps = Math.max(1, Math.ceil(distance / 0.0075));
      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps;
        session.points.push({
          x: lastPoint.x + dx * t,
          y: lastPoint.y + dy * t,
          pressure: mappedPointer.pressure,
        });
      }
      setPreviewState({
        maskId: session.maskId,
        points: cloneBrushPoints(session.points),
      });
      if (brushPreviewFrameRef.current === null) {
        brushPreviewFrameRef.current = requestAnimationFrame(flushBrushPreview);
      }
      event.preventDefault();
      event.stopPropagation();
    },
    [flushBrushPreview, previewRoi, setPreviewState]
  );

  const handleBrushPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const session = brushPaintSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }
      if (brushPreviewFrameRef.current !== null) {
        cancelAnimationFrame(brushPreviewFrameRef.current);
        brushPreviewFrameRef.current = null;
      }
      const currentAdjustments = latestAdjustmentsRef.current;
      if (currentAdjustments) {
        const nextAdjustments = applyBrushPreviewToAdjustments(currentAdjustments, {
          maskId: session.maskId,
          points: session.points,
        });
        commitAdjustmentPatch(`local:${session.maskId}:paint`, {
          localAdjustments: nextAdjustments.localAdjustments,
        });
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      event.preventDefault();
      event.stopPropagation();
      stopPainting();
    },
    [commitAdjustmentPatch, stopPainting]
  );

  return {
    activeBrushMaskId: activeBrushMask?.id ?? null,
    brushPaintEnabled,
    handleBrushPointerDown,
    handleBrushPointerMove,
    handleBrushPointerUp,
    previewState,
  };
}
