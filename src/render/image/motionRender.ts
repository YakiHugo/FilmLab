import { renderSingleImageToCanvas } from "./renderSingleImage";
import type { RenderQualityTier } from "./qualityTier";
import {
  createImageRenderDocument,
  type ImageRenderDocument,
  type ImageRenderTargetSize,
  type MotionProgram,
  type SignalDamageNode,
  type SignalDriftMotionProgram,
} from "./types";

export interface MotionFrameContext {
  frameIndex: number;
  timeMs: number;
  normalizedTime: number;
  totalFrames: number;
}

export interface MotionFrameResult {
  frameIndex: number;
  canvas: HTMLCanvasElement;
}

export const computeMotionFrameCount = (program: MotionProgram): number =>
  Math.max(1, Math.ceil((program.durationMs / 1000) * program.fps));

export const createMotionFrameContext = (
  program: MotionProgram,
  frameIndex: number
): MotionFrameContext => {
  const totalFrames = computeMotionFrameCount(program);
  return {
    frameIndex,
    timeMs: (frameIndex / program.fps) * 1000,
    normalizedTime:
      totalFrames <= 1 ? 0 : frameIndex / (program.loop ? totalFrames : totalFrames - 1),
    totalFrames,
  };
};

const applySignalDriftToDocument = (
  program: SignalDriftMotionProgram,
  baseDocument: ImageRenderDocument,
  frame: MotionFrameContext
): ImageRenderDocument => {
  const { driftAmplitude, intensity } = program.params;
  const t = frame.normalizedTime * 2 * Math.PI;

  const driftNode: SignalDamageNode = {
    id: `motion-drift-${program.id}`,
    type: "channel-drift",
    enabled: true,
    params: {
      redOffsetX: Math.sin(t) * driftAmplitude * intensity,
      redOffsetY: Math.cos(t * 0.7) * driftAmplitude * intensity * 0.3,
      greenOffsetX: 0,
      greenOffsetY: 0,
      blueOffsetX: Math.sin(t + Math.PI) * driftAmplitude * intensity,
      blueOffsetY: Math.cos(t * 0.7 + Math.PI) * driftAmplitude * intensity * 0.3,
      intensity,
    },
  };

  return createImageRenderDocument({
    ...baseDocument,
    signalDamage: [...baseDocument.signalDamage, driftNode],
  });
};

export const applyMotionProgramToDocument = (
  program: MotionProgram,
  baseDocument: ImageRenderDocument,
  frame: MotionFrameContext
): ImageRenderDocument => {
  switch (program.type) {
    case "signal-drift":
      return applySignalDriftToDocument(program, baseDocument, frame);
  }
};

export const renderMotionSequence = async ({
  program,
  baseDocument,
  targetSize,
  qualityTier,
  signal,
  onFrame,
}: {
  program: MotionProgram;
  baseDocument: ImageRenderDocument;
  targetSize: ImageRenderTargetSize;
  qualityTier: RenderQualityTier;
  signal?: AbortSignal;
  onFrame?: (result: MotionFrameResult) => void;
}): Promise<MotionFrameResult[]> => {
  const totalFrames = computeMotionFrameCount(program);
  const results: MotionFrameResult[] = [];

  for (let i = 0; i < totalFrames; i++) {
    if (signal?.aborted) break;

    const frame = createMotionFrameContext(program, i);
    const frameDocument = applyMotionProgramToDocument(program, baseDocument, frame);

    const canvas = document.createElement("canvas");
    canvas.width = targetSize.width;
    canvas.height = targetSize.height;

    await renderSingleImageToCanvas({
      canvas,
      document: frameDocument,
      request: { qualityTier, targetSize, signal },
    });

    if (signal?.aborted) break;

    const result: MotionFrameResult = { frameIndex: i, canvas };
    results.push(result);
    onFrame?.(result);
  }

  return results;
};
