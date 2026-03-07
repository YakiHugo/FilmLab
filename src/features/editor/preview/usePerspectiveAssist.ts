import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clamp } from "@/lib/math";
import type { AutoPerspectiveMode } from "@/stores/editorStore";
import type { EditingAdjustments } from "@/types";
import type { GuidedLine } from "./contracts";
import { resolvePreviewPointerPosition } from "./contracts";

const RAD_TO_DEG = 180 / Math.PI;

const normalizeLineAngleDeg = (deg: number) => {
  let angle = deg;
  while (angle >= 90) {
    angle -= 180;
  }
  while (angle < -90) {
    angle += 180;
  }
  return angle;
};

const clampPerspectiveAmount = (value: number) => clamp(Number(value.toFixed(2)), -100, 100);

const resolveVerticalDeviation = (angleDeg: number) =>
  angleDeg >= 0 ? angleDeg - 90 : angleDeg + 90;

const resolveGuidedLineAngle = (line: GuidedLine) =>
  normalizeLineAngleDeg(Math.atan2(line.end.y - line.start.y, line.end.x - line.start.x) * RAD_TO_DEG);

const resolveGuidedPerspectivePatch = (
  lines: GuidedLine[],
  adjustments: EditingAdjustments
): Partial<EditingAdjustments> | null => {
  if (lines.length === 0) {
    return null;
  }

  const lineData = lines.map((line) => {
    const angle = resolveGuidedLineAngle(line);
    const absAngle = Math.abs(angle);
    const midpoint = {
      x: (line.start.x + line.end.x) * 0.5,
      y: (line.start.y + line.end.y) * 0.5,
    };
    return {
      angle,
      absAngle,
      midpoint,
      verticalDeviation: resolveVerticalDeviation(angle),
    };
  });

  const horizontalLines = lineData.filter((line) => line.absAngle <= 45);
  const verticalLines = lineData.filter((line) => line.absAngle > 45);

  let rollDeg = 0;
  if (horizontalLines.length > 0) {
    rollDeg =
      horizontalLines.reduce((sum, line) => sum + line.angle, 0) /
      Math.max(1, horizontalLines.length);
  } else if (verticalLines.length > 0) {
    rollDeg =
      verticalLines.reduce((sum, line) => sum + line.verticalDeviation, 0) /
      Math.max(1, verticalLines.length);
  }

  let perspectiveHorizontal = adjustments.perspectiveHorizontal ?? 0;
  let perspectiveVertical = adjustments.perspectiveVertical ?? 0;
  let hasPerspective = false;

  if (verticalLines.length >= 2) {
    const [left, right] = [...verticalLines].sort((a, b) => a.midpoint.x - b.midpoint.x).slice(0, 2);
    if (left && right) {
      perspectiveHorizontal = clampPerspectiveAmount(
        (left.verticalDeviation - right.verticalDeviation) * -120
      );
      hasPerspective = true;
    }
  }

  if (horizontalLines.length >= 2) {
    const [top, bottom] = [...horizontalLines].sort((a, b) => a.midpoint.y - b.midpoint.y).slice(0, 2);
    if (top && bottom) {
      perspectiveVertical = clampPerspectiveAmount((top.angle - bottom.angle) * -120);
      hasPerspective = true;
    }
  }

  const nextRotate = clamp(adjustments.rotate - rollDeg, -45, 45);
  const patch: Partial<EditingAdjustments> = {};
  if (Math.abs(nextRotate - adjustments.rotate) > 0.02) {
    patch.rotate = Number(nextRotate.toFixed(2));
  }
  if (hasPerspective) {
    if (Math.abs(perspectiveHorizontal - (adjustments.perspectiveHorizontal ?? 0)) > 0.1) {
      patch.perspectiveHorizontal = perspectiveHorizontal;
    }
    if (Math.abs(perspectiveVertical - (adjustments.perspectiveVertical ?? 0)) > 0.1) {
      patch.perspectiveVertical = perspectiveVertical;
    }
    if (
      patch.perspectiveHorizontal !== undefined ||
      patch.perspectiveVertical !== undefined
    ) {
      patch.perspectiveEnabled = true;
    }
  }
  return Object.keys(patch).length > 0 ? patch : null;
};

const estimatePerspectiveFromCanvas = (
  sourceCanvas: HTMLCanvasElement,
  scratchCanvas: HTMLCanvasElement
) => {
  if (sourceCanvas.width < 8 || sourceCanvas.height < 8) {
    return null;
  }

  const maxDimension = 220;
  const scale = maxDimension / Math.max(sourceCanvas.width, sourceCanvas.height);
  const sampleWidth = Math.max(64, Math.round(sourceCanvas.width * Math.min(1, scale)));
  const sampleHeight = Math.max(64, Math.round(sourceCanvas.height * Math.min(1, scale)));
  scratchCanvas.width = sampleWidth;
  scratchCanvas.height = sampleHeight;
  const scratchContext = scratchCanvas.getContext("2d", { willReadFrequently: true });
  if (!scratchContext) {
    return null;
  }
  scratchContext.clearRect(0, 0, sampleWidth, sampleHeight);
  scratchContext.drawImage(sourceCanvas, 0, 0, sampleWidth, sampleHeight);
  const image = scratchContext.getImageData(0, 0, sampleWidth, sampleHeight);
  const pixels = image.data;
  const luminance = new Float32Array(sampleWidth * sampleHeight);
  for (let index = 0, pixelIndex = 0; index < luminance.length; index += 1, pixelIndex += 4) {
    const r = (pixels[pixelIndex] ?? 0) / 255;
    const g = (pixels[pixelIndex + 1] ?? 0) / 255;
    const b = (pixels[pixelIndex + 2] ?? 0) / 255;
    luminance[index] = r * 0.2126 + g * 0.7152 + b * 0.0722;
  }

  let horizontalWeight = 0;
  let horizontalAngleSum = 0;
  let horizontalLeftWeight = 0;
  let horizontalLeftAngleSum = 0;
  let horizontalRightWeight = 0;
  let horizontalRightAngleSum = 0;
  let verticalWeight = 0;
  let verticalDeviationSum = 0;
  let verticalTopWeight = 0;
  let verticalTopDeviationSum = 0;
  let verticalBottomWeight = 0;
  let verticalBottomDeviationSum = 0;

  const sampleIndex = (x: number, y: number) => y * sampleWidth + x;

  for (let y = 1; y < sampleHeight - 1; y += 1) {
    for (let x = 1; x < sampleWidth - 1; x += 1) {
      const gx =
        luminance[sampleIndex(x + 1, y - 1)] +
        2 * luminance[sampleIndex(x + 1, y)] +
        luminance[sampleIndex(x + 1, y + 1)] -
        luminance[sampleIndex(x - 1, y - 1)] -
        2 * luminance[sampleIndex(x - 1, y)] -
        luminance[sampleIndex(x - 1, y + 1)];
      const gy =
        luminance[sampleIndex(x - 1, y + 1)] +
        2 * luminance[sampleIndex(x, y + 1)] +
        luminance[sampleIndex(x + 1, y + 1)] -
        luminance[sampleIndex(x - 1, y - 1)] -
        2 * luminance[sampleIndex(x, y - 1)] -
        luminance[sampleIndex(x + 1, y - 1)];
      const magnitude = Math.hypot(gx, gy);
      if (magnitude < 0.16) {
        continue;
      }

      const lineAngle = normalizeLineAngleDeg((Math.atan2(gy, gx) + Math.PI * 0.5) * RAD_TO_DEG);
      const absAngle = Math.abs(lineAngle);
      if (absAngle <= 35) {
        horizontalWeight += magnitude;
        horizontalAngleSum += lineAngle * magnitude;
        if (x < sampleWidth * 0.5) {
          horizontalLeftWeight += magnitude;
          horizontalLeftAngleSum += lineAngle * magnitude;
        } else {
          horizontalRightWeight += magnitude;
          horizontalRightAngleSum += lineAngle * magnitude;
        }
        continue;
      }

      if (absAngle >= 55) {
        const verticalDeviation = lineAngle >= 0 ? lineAngle - 90 : lineAngle + 90;
        verticalWeight += magnitude;
        verticalDeviationSum += verticalDeviation * magnitude;
        if (y < sampleHeight * 0.5) {
          verticalTopWeight += magnitude;
          verticalTopDeviationSum += verticalDeviation * magnitude;
        } else {
          verticalBottomWeight += magnitude;
          verticalBottomDeviationSum += verticalDeviation * magnitude;
        }
      }
    }
  }

  const averageHorizontalAngle =
    horizontalWeight > 1e-5 ? horizontalAngleSum / horizontalWeight : null;
  const averageVerticalDeviation =
    verticalWeight > 1e-5 ? verticalDeviationSum / verticalWeight : null;
  const averageHorizontalLeft =
    horizontalLeftWeight > 1e-5 ? horizontalLeftAngleSum / horizontalLeftWeight : null;
  const averageHorizontalRight =
    horizontalRightWeight > 1e-5 ? horizontalRightAngleSum / horizontalRightWeight : null;
  const averageVerticalTop =
    verticalTopWeight > 1e-5 ? verticalTopDeviationSum / verticalTopWeight : null;
  const averageVerticalBottom =
    verticalBottomWeight > 1e-5 ? verticalBottomDeviationSum / verticalBottomWeight : null;

  if (
    averageHorizontalAngle === null &&
    averageVerticalDeviation === null &&
    averageHorizontalLeft === null &&
    averageHorizontalRight === null &&
    averageVerticalTop === null &&
    averageVerticalBottom === null
  ) {
    return null;
  }

  const horizontalConvergence =
    averageHorizontalLeft !== null && averageHorizontalRight !== null
      ? averageHorizontalLeft - averageHorizontalRight
      : 0;
  const verticalConvergence =
    averageVerticalTop !== null && averageVerticalBottom !== null
      ? averageVerticalTop - averageVerticalBottom
      : 0;

  return {
    rollDeg: averageHorizontalAngle ?? averageVerticalDeviation ?? 0,
    perspectiveHorizontal: clampPerspectiveAmount(horizontalConvergence * -2.4),
    perspectiveVertical: clampPerspectiveAmount(verticalConvergence * -3.2),
  };
};

export interface UsePerspectiveAssistInput {
  adjustments: EditingAdjustments | null;
  autoPerspectiveMode: AutoPerspectiveMode;
  autoPerspectiveRequestId: number;
  enabled: boolean;
  previewCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  showOriginal: boolean;
  updateAdjustments: (partial: Partial<EditingAdjustments>) => void;
}

export interface UsePerspectiveAssistOutput {
  applyGuidedPerspective: (lines: GuidedLine[]) => void;
  cancelGuidedPerspective: () => void;
  guidedDraftLine: GuidedLine | null;
  guidedOverlayLines: GuidedLine[];
  guidedOverlayVisible: boolean;
  guidedPerspectiveActive: boolean;
  handleGuidedPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  handleGuidedPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  handleGuidedPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  resetGuidedLines: () => void;
}

export function usePerspectiveAssist({
  adjustments,
  autoPerspectiveMode,
  autoPerspectiveRequestId,
  enabled,
  previewCanvasRef,
  showOriginal,
  updateAdjustments,
}: UsePerspectiveAssistInput): UsePerspectiveAssistOutput {
  const latestAdjustmentsRef = useRef(adjustments);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const guidedPointerRef = useRef<number | null>(null);
  const lastAutoPerspectiveRequestRef = useRef(0);
  const [guidedPerspectiveActive, setGuidedPerspectiveActive] = useState(false);
  const [guidedLines, setGuidedLines] = useState<GuidedLine[]>([]);
  const [guidedDraftLine, setGuidedDraftLine] = useState<GuidedLine | null>(null);

  latestAdjustmentsRef.current = adjustments;

  const cancelGuidedPerspective = useCallback(() => {
    guidedPointerRef.current = null;
    setGuidedPerspectiveActive(false);
    setGuidedLines([]);
    setGuidedDraftLine(null);
  }, []);

  const applyGuidedPerspective = useCallback(
    (lines: GuidedLine[]) => {
      const currentAdjustments = latestAdjustmentsRef.current;
      if (!currentAdjustments) {
        cancelGuidedPerspective();
        return;
      }
      const patch = resolveGuidedPerspectivePatch(lines, currentAdjustments);
      if (patch) {
        updateAdjustments(patch);
      }
      cancelGuidedPerspective();
    },
    [cancelGuidedPerspective, updateAdjustments]
  );

  const resetGuidedLines = useCallback(() => {
    guidedPointerRef.current = null;
    setGuidedLines([]);
    setGuidedDraftLine(null);
  }, []);

  useEffect(() => {
    if (enabled) {
      return;
    }
    cancelGuidedPerspective();
  }, [cancelGuidedPerspective, enabled]);

  useEffect(() => {
    if (autoPerspectiveRequestId <= 0 || !enabled) {
      return;
    }
    if (lastAutoPerspectiveRequestRef.current === autoPerspectiveRequestId) {
      return;
    }
    lastAutoPerspectiveRequestRef.current = autoPerspectiveRequestId;
    if (!adjustments || showOriginal) {
      return;
    }
    if (autoPerspectiveMode === "guided") {
      resetGuidedLines();
      setGuidedPerspectiveActive(true);
      return;
    }
    if (guidedPerspectiveActive) {
      cancelGuidedPerspective();
    }
    const previewCanvas = previewCanvasRef.current;
    if (!previewCanvas || previewCanvas.width < 8 || previewCanvas.height < 8) {
      return;
    }
    const scratchCanvas = scratchCanvasRef.current ?? document.createElement("canvas");
    scratchCanvasRef.current = scratchCanvas;
    const estimate = estimatePerspectiveFromCanvas(previewCanvas, scratchCanvas);
    if (!estimate) {
      return;
    }
    const nextPatch: Partial<EditingAdjustments> = {};
    const shouldApplyRotate =
      autoPerspectiveMode === "auto" ||
      autoPerspectiveMode === "level" ||
      autoPerspectiveMode === "full";
    if (shouldApplyRotate) {
      const nextRotate = clamp(adjustments.rotate - estimate.rollDeg, -45, 45);
      if (Math.abs(nextRotate - adjustments.rotate) > 0.05) {
        nextPatch.rotate = Number(nextRotate.toFixed(2));
      }
    }
    if (autoPerspectiveMode === "auto" || autoPerspectiveMode === "full") {
      const current = adjustments.perspectiveHorizontal ?? 0;
      if (Math.abs(estimate.perspectiveHorizontal - current) > 0.1) {
        nextPatch.perspectiveHorizontal = estimate.perspectiveHorizontal;
      }
    }
    if (
      autoPerspectiveMode === "auto" ||
      autoPerspectiveMode === "vertical" ||
      autoPerspectiveMode === "full"
    ) {
      const current = adjustments.perspectiveVertical ?? 0;
      if (Math.abs(estimate.perspectiveVertical - current) > 0.1) {
        nextPatch.perspectiveVertical = estimate.perspectiveVertical;
      }
    }
    if (
      nextPatch.perspectiveHorizontal !== undefined ||
      nextPatch.perspectiveVertical !== undefined
    ) {
      nextPatch.perspectiveEnabled = true;
    }
    if (Object.keys(nextPatch).length > 0) {
      updateAdjustments(nextPatch);
    }
  }, [
    adjustments,
    autoPerspectiveMode,
    autoPerspectiveRequestId,
    cancelGuidedPerspective,
    enabled,
    guidedPerspectiveActive,
    previewCanvasRef,
    resetGuidedLines,
    showOriginal,
    updateAdjustments,
  ]);

  const handleGuidedPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!guidedPerspectiveActive || event.button !== 0) {
        return;
      }
      const pointer = resolvePreviewPointerPosition(event, event.currentTarget);
      if (!pointer) {
        return;
      }
      guidedPointerRef.current = event.pointerId;
      setGuidedDraftLine({
        start: { x: pointer.x, y: pointer.y },
        end: { x: pointer.x, y: pointer.y },
      });
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [guidedPerspectiveActive]
  );

  const handleGuidedPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!guidedPerspectiveActive || guidedPointerRef.current !== event.pointerId) {
        return;
      }
      const pointer = resolvePreviewPointerPosition(event, event.currentTarget);
      if (!pointer) {
        return;
      }
      setGuidedDraftLine((current) =>
        current
          ? {
              ...current,
              end: { x: pointer.x, y: pointer.y },
            }
          : current
      );
      event.preventDefault();
      event.stopPropagation();
    },
    [guidedPerspectiveActive]
  );

  const handleGuidedPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!guidedPerspectiveActive || guidedPointerRef.current !== event.pointerId) {
        return;
      }
      guidedPointerRef.current = null;
      const draft = guidedDraftLine;
      setGuidedDraftLine(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (!draft) {
        return;
      }
      const length = Math.hypot(draft.end.x - draft.start.x, draft.end.y - draft.start.y);
      if (length < 0.015) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const nextLines = [...guidedLines, draft].slice(-2);
      setGuidedLines(nextLines);
      if (nextLines.length >= 2) {
        applyGuidedPerspective(nextLines);
      }
      event.preventDefault();
      event.stopPropagation();
    },
    [applyGuidedPerspective, guidedDraftLine, guidedLines, guidedPerspectiveActive]
  );

  const guidedOverlayLines = useMemo(
    () => (guidedDraftLine ? [...guidedLines, guidedDraftLine] : guidedLines),
    [guidedDraftLine, guidedLines]
  );

  return {
    applyGuidedPerspective,
    cancelGuidedPerspective,
    guidedDraftLine,
    guidedOverlayLines,
    guidedOverlayVisible: guidedPerspectiveActive || guidedOverlayLines.length > 0,
    guidedPerspectiveActive,
    handleGuidedPointerDown,
    handleGuidedPointerMove,
    handleGuidedPointerUp,
    resetGuidedLines,
  };
}
