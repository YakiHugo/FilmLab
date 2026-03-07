import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildCropImagePolygon,
  clampRange,
  CROP_RECT_MIN_SIZE,
  fitCenteredRectToPolygon,
  getCropHandlePoint,
  isCropRectInsidePolygon,
  toCenteredRect,
  type CropDragMode,
  type CropRect,
} from "@/features/editor/cropGeometry";
import { clamp } from "@/lib/math";
import type { EditingAdjustments } from "@/types";
import type { PreviewCropPatch, PreviewFrameSize } from "./contracts";
import type { PreviewInteractionSampler } from "./interactionPerformance";

export interface UseCropInteractionInput {
  adjustments: EditingAdjustments | null;
  enabled: boolean;
  frameSize: PreviewFrameSize;
  cropTargetRatio: number;
  renderedRotate: number;
  commitCropAdjustments: (partial: PreviewCropPatch) => boolean;
  performanceSampler: PreviewInteractionSampler;
}

export interface UseCropInteractionOutput {
  activeCropDragMode: CropDragMode | null;
  cropRect: CropRect | null;
  handleCropPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  handleCropPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  handleCropPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  previewPatch: PreviewCropPatch | null;
}

interface CropDragSession {
  mode: CropDragMode;
  startX: number;
  startY: number;
  startRect: CropRect;
  startHorizontal: number;
  startVertical: number;
  startScale: number;
  startCustomAspectRatio: number;
  startTime: number;
  moveArmed: boolean;
}

export function useCropInteraction({
  adjustments,
  enabled,
  frameSize,
  cropTargetRatio,
  renderedRotate,
  commitCropAdjustments,
  performanceSampler,
}: UseCropInteractionInput): UseCropInteractionOutput {
  const latestAdjustmentsRef = useRef(adjustments);
  const cropDragRef = useRef<CropDragSession | null>(null);
  const cropMovePreviewFrameRef = useRef<number | null>(null);
  const cropResizeFrameRef = useRef<number | null>(null);
  const cropResizePendingRectRef = useRef<CropRect | null>(null);
  const cropPreviewPatchRef = useRef<PreviewCropPatch | null>(null);
  const prevRightAngleRef = useRef(adjustments?.rightAngleRotation ?? 0);

  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [activeCropDragMode, setActiveCropDragMode] = useState<CropDragMode | null>(null);
  const [previewPatch, setPreviewPatch] = useState<PreviewCropPatch | null>(null);

  latestAdjustmentsRef.current = adjustments;

  const clearPendingFrames = useCallback(() => {
    if (cropMovePreviewFrameRef.current !== null) {
      cancelAnimationFrame(cropMovePreviewFrameRef.current);
      cropMovePreviewFrameRef.current = null;
    }
    if (cropResizeFrameRef.current !== null) {
      cancelAnimationFrame(cropResizeFrameRef.current);
      cropResizeFrameRef.current = null;
    }
    cropResizePendingRectRef.current = null;
  }, []);

  const buildRectFromAdjustments = useCallback(
    (nextAdjustments: EditingAdjustments) => {
      const frameWidth = frameSize.width;
      const frameHeight = frameSize.height;
      const frameRatio = frameWidth / frameHeight;
      const targetRatio =
        nextAdjustments.aspectRatio === "free"
          ? clamp(nextAdjustments.customAspectRatio, 0.5, 2.5)
          : nextAdjustments.aspectRatio === "original"
            ? frameRatio
            : cropTargetRatio;

      let fitWidth = frameWidth;
      let fitHeight = fitWidth / targetRatio;
      if (fitHeight > frameHeight) {
        fitHeight = frameHeight;
        fitWidth = fitHeight * targetRatio;
      }

      const scaleFactor = clamp(nextAdjustments.scale / 100, 0.7, 1.3);
      const width = clamp(fitWidth / scaleFactor, CROP_RECT_MIN_SIZE, frameWidth);
      const height = clamp(fitHeight / scaleFactor, CROP_RECT_MIN_SIZE, frameHeight);
      const centerX = frameWidth / 2;
      const centerY = frameHeight / 2;
      const rect: CropRect = {
        x: centerX - width / 2,
        y: centerY - height / 2,
        width,
        height,
      };
      const imagePolygon = buildCropImagePolygon(
        frameWidth,
        frameHeight,
        nextAdjustments.rotate,
        nextAdjustments.horizontal,
        nextAdjustments.vertical
      );
      if (!isCropRectInsidePolygon(rect, imagePolygon)) {
        const fitted = fitCenteredRectToPolygon(
          centerX,
          centerY,
          0,
          0,
          width / 2,
          height / 2,
          imagePolygon
        );
        return toCenteredRect(centerX, centerY, fitted.halfWidth, fitted.halfHeight);
      }
      return rect;
    },
    [cropTargetRatio, frameSize.height, frameSize.width]
  );

  const toCropPatch = useCallback(
    (rect: CropRect): PreviewCropPatch => {
      if (!adjustments || frameSize.width <= 0 || frameSize.height <= 0) {
        return {};
      }

      const ratio =
        adjustments.aspectRatio === "free"
          ? clamp(rect.width / Math.max(1, rect.height), 0.5, 2.5)
          : cropTargetRatio;
      let fitWidth = frameSize.width;
      let fitHeight = fitWidth / ratio;
      if (fitHeight > frameSize.height) {
        fitHeight = frameSize.height;
        fitWidth = fitHeight * ratio;
      }
      const scale = clamp((fitWidth / Math.max(rect.width, 1)) * 100, 80, 120);
      return {
        horizontal: adjustments.horizontal,
        vertical: adjustments.vertical,
        scale,
        customAspectRatio:
          adjustments.aspectRatio === "free"
            ? clamp(ratio, 0.5, 2.5)
            : adjustments.customAspectRatio,
      };
    },
    [adjustments, cropTargetRatio, frameSize.height, frameSize.width]
  );

  const resetInteraction = useCallback(() => {
    clearPendingFrames();
    cropDragRef.current = null;
    cropPreviewPatchRef.current = null;
    setActiveCropDragMode(null);
    setPreviewPatch(null);
    performanceSampler.finish();
  }, [clearPendingFrames, performanceSampler]);

  useEffect(() => {
    return () => {
      clearPendingFrames();
    };
  }, [clearPendingFrames]);

  useEffect(() => {
    if (enabled) {
      return;
    }
    setCropRect(null);
    resetInteraction();
  }, [enabled, resetInteraction]);

  useEffect(() => {
    if (!enabled || !adjustments || frameSize.width <= 0 || frameSize.height <= 0) {
      setCropRect(null);
      return;
    }
    if (cropDragRef.current) {
      return;
    }
    const syncedAdjustments = {
      ...adjustments,
      rotate: renderedRotate,
    };
    const imagePolygon = buildCropImagePolygon(
      frameSize.width,
      frameSize.height,
      renderedRotate,
      syncedAdjustments.horizontal,
      syncedAdjustments.vertical
    );
    const currentRightAngle = adjustments.rightAngleRotation;
    const rightAngleChanged = currentRightAngle !== prevRightAngleRef.current;
    prevRightAngleRef.current = currentRightAngle;
    setCropRect((currentRect) => {
      if (rightAngleChanged) {
        return buildRectFromAdjustments(syncedAdjustments);
      }
      if (currentRect) {
        if (isCropRectInsidePolygon(currentRect, imagePolygon)) {
          return currentRect;
        }
        const centerX = frameSize.width / 2;
        const centerY = frameSize.height / 2;
        const fitted = fitCenteredRectToPolygon(
          centerX,
          centerY,
          0,
          0,
          currentRect.width / 2,
          currentRect.height / 2,
          imagePolygon
        );
        const shrunk = toCenteredRect(centerX, centerY, fitted.halfWidth, fitted.halfHeight);
        if (shrunk.width >= CROP_RECT_MIN_SIZE && shrunk.height >= CROP_RECT_MIN_SIZE) {
          return shrunk;
        }
      }
      return buildRectFromAdjustments(syncedAdjustments);
    });
  }, [
    adjustments,
    buildRectFromAdjustments,
    enabled,
    frameSize.height,
    frameSize.width,
    renderedRotate,
  ]);

  const handleCropPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled || !cropRect || !adjustments) {
        return;
      }
      const target = event.target as HTMLElement;
      const handle = target
        .closest("[data-crop-handle]")
        ?.getAttribute("data-crop-handle") as CropDragMode | null;
      const isBody = Boolean(target.closest("[data-crop-body]"));
      const mode: CropDragMode | null = handle ?? (isBody ? "move" : null);
      if (!mode) {
        return;
      }
      performanceSampler.start();
      const startPatch = toCropPatch(cropRect);
      cropDragRef.current = {
        mode,
        startX: event.clientX,
        startY: event.clientY,
        startRect: cropRect,
        startHorizontal: adjustments.horizontal,
        startVertical: adjustments.vertical,
        startScale: startPatch.scale ?? adjustments.scale,
        startCustomAspectRatio: startPatch.customAspectRatio ?? adjustments.customAspectRatio,
        startTime: performance.now(),
        moveArmed: mode !== "move",
      };
      cropPreviewPatchRef.current = null;
      setPreviewPatch(null);
      setActiveCropDragMode(mode === "move" ? null : mode);
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [adjustments, cropRect, enabled, performanceSampler, toCropPatch]
  );

  const handleCropPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled || !adjustments || !cropDragRef.current) {
        return;
      }
      const drag = cropDragRef.current;
      const frameWidth = frameSize.width;
      const frameHeight = frameSize.height;
      if (frameWidth <= 0 || frameHeight <= 0) {
        return;
      }
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const startRect = drag.startRect;
      const mode = drag.mode;

      if (mode === "move") {
        if (!drag.moveArmed) {
          const elapsed = performance.now() - drag.startTime;
          if (elapsed < 140) {
            return;
          }
          drag.moveArmed = true;
          drag.startX = event.clientX;
          drag.startY = event.clientY;
          drag.startHorizontal = adjustments.horizontal;
          drag.startVertical = adjustments.vertical;
          return;
        }
        const targetHorizontal = clamp(
          drag.startHorizontal + ((event.clientX - drag.startX) / Math.max(frameWidth, 1)) * 500,
          -100,
          100
        );
        const targetVertical = clamp(
          drag.startVertical + ((event.clientY - drag.startY) / Math.max(frameHeight, 1)) * 500,
          -100,
          100
        );
        let nextHorizontal = targetHorizontal;
        let nextVertical = targetVertical;
        const canContainCropRect = (horizontal: number, vertical: number) =>
          isCropRectInsidePolygon(
            startRect,
            buildCropImagePolygon(frameWidth, frameHeight, adjustments.rotate, horizontal, vertical)
          );

        if (!canContainCropRect(nextHorizontal, nextVertical)) {
          let lo = 0;
          let hi = 1;
          for (let index = 0; index < 18; index += 1) {
            const mid = (lo + hi) / 2;
            const testHorizontal =
              drag.startHorizontal + (targetHorizontal - drag.startHorizontal) * mid;
            const testVertical = drag.startVertical + (targetVertical - drag.startVertical) * mid;
            if (canContainCropRect(testHorizontal, testVertical)) {
              lo = mid;
            } else {
              hi = mid;
            }
          }
          nextHorizontal = drag.startHorizontal + (targetHorizontal - drag.startHorizontal) * lo;
          nextVertical = drag.startVertical + (targetVertical - drag.startVertical) * lo;
        }

        cropPreviewPatchRef.current = {
          horizontal: nextHorizontal,
          vertical: nextVertical,
          scale: drag.startScale,
          customAspectRatio: drag.startCustomAspectRatio,
        };
        if (cropMovePreviewFrameRef.current === null) {
          cropMovePreviewFrameRef.current = requestAnimationFrame(() => {
            const frameStartedAt = performance.now();
            cropMovePreviewFrameRef.current = null;
            const nextPatch = cropPreviewPatchRef.current;
            if (nextPatch) {
              setPreviewPatch(nextPatch);
            }
            performanceSampler.recordFrame(frameStartedAt);
          });
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const startHandle = getCropHandlePoint(startRect, mode);
      const pointerX = startHandle.x + dx;
      const pointerY = startHandle.y + dy;
      const isCorner = mode === "nw" || mode === "ne" || mode === "sw" || mode === "se";
      const isVerticalEdge = mode === "n" || mode === "s";
      const isHorizontalEdge = mode === "w" || mode === "e";
      const lockAspect = adjustments.aspectRatio !== "free";
      const centerX = frameWidth / 2;
      const centerY = frameHeight / 2;
      const maxHalfWidth = frameWidth / 2;
      const maxHalfHeight = frameHeight / 2;
      const minHalfWidth = Math.min(CROP_RECT_MIN_SIZE / 2, maxHalfWidth);
      const minHalfHeight = Math.min(CROP_RECT_MIN_SIZE / 2, maxHalfHeight);

      let halfWidth = startRect.width / 2;
      let halfHeight = startRect.height / 2;

      if (lockAspect) {
        const ratio = Math.max(0.001, cropTargetRatio);
        const minHalfWidthByRatio = Math.max(minHalfWidth, minHalfHeight * ratio);
        const maxHalfWidthByRatio = Math.min(maxHalfWidth, maxHalfHeight * ratio);
        const widthRangeMin = Math.min(minHalfWidthByRatio, maxHalfWidthByRatio);
        const widthRangeMax = Math.max(minHalfWidthByRatio, maxHalfWidthByRatio);
        let halfWidthCandidate = halfWidth;
        if (isVerticalEdge) {
          halfWidthCandidate = Math.abs(pointerY - centerY) * ratio;
        } else if (isHorizontalEdge) {
          halfWidthCandidate = Math.abs(pointerX - centerX);
        } else if (isCorner) {
          const widthFromX = Math.abs(pointerX - centerX);
          const widthFromY = Math.abs(pointerY - centerY) * ratio;
          halfWidthCandidate = Math.abs(dx) >= Math.abs(dy) ? widthFromX : widthFromY;
        }
        halfWidth = clampRange(halfWidthCandidate, widthRangeMin, widthRangeMax);
        halfHeight = halfWidth / ratio;
      } else {
        if (isCorner || isHorizontalEdge) {
          halfWidth = clamp(Math.abs(pointerX - centerX), minHalfWidth, maxHalfWidth);
        }
        if (isCorner || isVerticalEdge) {
          halfHeight = clamp(Math.abs(pointerY - centerY), minHalfHeight, maxHalfHeight);
        }
      }

      let nextRect: CropRect = {
        x: centerX - halfWidth,
        y: centerY - halfHeight,
        width: halfWidth * 2,
        height: halfHeight * 2,
      };
      const currentImagePolygon = buildCropImagePolygon(
        frameWidth,
        frameHeight,
        adjustments.rotate,
        adjustments.horizontal,
        adjustments.vertical
      );
      if (!isCropRectInsidePolygon(nextRect, currentImagePolygon)) {
        const fittedHalf = fitCenteredRectToPolygon(
          centerX,
          centerY,
          startRect.width / 2,
          startRect.height / 2,
          halfWidth,
          halfHeight,
          currentImagePolygon
        );
        nextRect = {
          x: centerX - fittedHalf.halfWidth,
          y: centerY - fittedHalf.halfHeight,
          width: fittedHalf.halfWidth * 2,
          height: fittedHalf.halfHeight * 2,
        };
      }

      cropPreviewPatchRef.current = toCropPatch(nextRect);
      cropResizePendingRectRef.current = nextRect;
      if (cropResizeFrameRef.current === null) {
        cropResizeFrameRef.current = requestAnimationFrame(() => {
          const frameStartedAt = performance.now();
          cropResizeFrameRef.current = null;
          const pendingRect = cropResizePendingRectRef.current;
          if (pendingRect) {
            setCropRect(pendingRect);
            cropResizePendingRectRef.current = null;
          }
          performanceSampler.recordFrame(frameStartedAt);
        });
      }
      event.preventDefault();
      event.stopPropagation();
    },
    [
      adjustments,
      cropTargetRatio,
      enabled,
      frameSize.height,
      frameSize.width,
      performanceSampler,
      toCropPatch,
    ]
  );

  const handleCropPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled || !cropDragRef.current) {
        return;
      }
      if (cropResizePendingRectRef.current) {
        setCropRect(cropResizePendingRectRef.current);
        cropResizePendingRectRef.current = null;
      }
      const patch = cropPreviewPatchRef.current;
      if (patch && Object.keys(patch).length > 0) {
        void commitCropAdjustments(patch);
      }
      cropDragRef.current = null;
      cropPreviewPatchRef.current = null;
      setPreviewPatch(null);
      setActiveCropDragMode(null);
      clearPendingFrames();
      performanceSampler.finish();
      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [clearPendingFrames, commitCropAdjustments, enabled, performanceSampler]
  );

  return {
    activeCropDragMode,
    cropRect,
    handleCropPointerDown,
    handleCropPointerMove,
    handleCropPointerUp,
    previewPatch,
  };
}
