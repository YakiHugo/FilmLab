import { getRendererRuntimeConfig } from "@/lib/renderer/config";

export type PreviewInteractionKind = "crop-drag" | "brush-paint";

export interface PreviewInteractionBaselineThreshold {
  maxAverageFrameIntervalMs: number;
  maxAverageMainThreadMs: number;
  minSampleCount: number;
}

export interface PreviewInteractionSummary {
  kind: PreviewInteractionKind;
  sampleCount: number;
  averageFrameIntervalMs: number;
  averageMainThreadMs: number;
  maxFrameIntervalMs: number;
  maxMainThreadMs: number;
  meetsBaseline: boolean;
  baseline: PreviewInteractionBaselineThreshold;
  recordedAt: string;
}

export const PREVIEW_INTERACTION_BASELINES: Record<
  PreviewInteractionKind,
  PreviewInteractionBaselineThreshold
> = {
  "crop-drag": {
    maxAverageFrameIntervalMs: 22,
    maxAverageMainThreadMs: 10,
    minSampleCount: 6,
  },
  "brush-paint": {
    maxAverageFrameIntervalMs: 20,
    maxAverageMainThreadMs: 8,
    minSampleCount: 6,
  },
};

const STORAGE_KEY = "filmlab:previewInteractionTiming";
const HISTORY_LIMIT = 20;

interface ActiveInteractionSample {
  sampleCount: number;
  frameIntervalSumMs: number;
  mainThreadSumMs: number;
  maxFrameIntervalMs: number;
  maxMainThreadMs: number;
  lastFrameAt: number | null;
}

declare global {
  interface Window {
    __FILMLAB_PREVIEW_INTERACTION_SUMMARIES__?: Partial<
      Record<PreviewInteractionKind, PreviewInteractionSummary[]>
    >;
  }
}

const createActiveSample = (): ActiveInteractionSample => ({
  sampleCount: 0,
  frameIntervalSumMs: 0,
  mainThreadSumMs: 0,
  maxFrameIntervalMs: 0,
  maxMainThreadMs: 0,
  lastFrameAt: null,
});

export const shouldMeasurePreviewInteractionTimings = () => {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const override = window.localStorage.getItem(STORAGE_KEY);
    if (override?.trim() === "1") {
      return true;
    }
  } catch {
    return getRendererRuntimeConfig().diagnostics.renderTimings;
  }
  return getRendererRuntimeConfig().diagnostics.renderTimings;
};

const appendSummaryToWindow = (summary: PreviewInteractionSummary) => {
  if (typeof window === "undefined") {
    return;
  }
  const bucket = window.__FILMLAB_PREVIEW_INTERACTION_SUMMARIES__ ?? {};
  const history = [...(bucket[summary.kind] ?? []), summary];
  bucket[summary.kind] = history.slice(-HISTORY_LIMIT);
  window.__FILMLAB_PREVIEW_INTERACTION_SUMMARIES__ = bucket;
};

export const logPreviewInteractionSummary = (summary: PreviewInteractionSummary) => {
  if (!shouldMeasurePreviewInteractionTimings()) {
    return;
  }
  appendSummaryToWindow(summary);
  console.info(
    `[FilmLab][${summary.kind}] avgFrame=${summary.averageFrameIntervalMs.toFixed(2)}ms ` +
      `avgMain=${summary.averageMainThreadMs.toFixed(2)}ms samples=${summary.sampleCount} ` +
      `baseline(frame<=${summary.baseline.maxAverageFrameIntervalMs.toFixed(2)}ms,main<=${summary.baseline.maxAverageMainThreadMs.toFixed(2)}ms) ` +
      `status=${summary.meetsBaseline ? "pass" : "fail"}`
  );
};

export interface PreviewInteractionSampler {
  finish: (finishedAt?: number) => PreviewInteractionSummary | null;
  recordFrame: (frameStartedAt: number, frameFinishedAt?: number) => void;
  start: (startedAt?: number) => void;
}

export const createPreviewInteractionSampler = (
  kind: PreviewInteractionKind
): PreviewInteractionSampler => {
  let activeSample: ActiveInteractionSample | null = null;

  const start = (startedAt = performance.now()) => {
    activeSample = {
      ...createActiveSample(),
      lastFrameAt: startedAt,
    };
  };

  const recordFrame = (frameStartedAt: number, frameFinishedAt = performance.now()) => {
    if (!activeSample) {
      return;
    }
    const frameIntervalMs =
      activeSample.lastFrameAt === null ? 0 : Math.max(0, frameFinishedAt - activeSample.lastFrameAt);
    const mainThreadMs = Math.max(0, frameFinishedAt - frameStartedAt);
    activeSample.sampleCount += 1;
    activeSample.frameIntervalSumMs += frameIntervalMs;
    activeSample.mainThreadSumMs += mainThreadMs;
    activeSample.maxFrameIntervalMs = Math.max(activeSample.maxFrameIntervalMs, frameIntervalMs);
    activeSample.maxMainThreadMs = Math.max(activeSample.maxMainThreadMs, mainThreadMs);
    activeSample.lastFrameAt = frameFinishedAt;
  };

  const finish = () => {
    if (!activeSample || activeSample.sampleCount === 0) {
      activeSample = null;
      return null;
    }
    const baseline = PREVIEW_INTERACTION_BASELINES[kind];
    const averageFrameIntervalMs = activeSample.frameIntervalSumMs / activeSample.sampleCount;
    const averageMainThreadMs = activeSample.mainThreadSumMs / activeSample.sampleCount;
    const summary: PreviewInteractionSummary = {
      kind,
      sampleCount: activeSample.sampleCount,
      averageFrameIntervalMs,
      averageMainThreadMs,
      maxFrameIntervalMs: activeSample.maxFrameIntervalMs,
      maxMainThreadMs: activeSample.maxMainThreadMs,
      meetsBaseline:
        activeSample.sampleCount >= baseline.minSampleCount &&
        averageFrameIntervalMs <= baseline.maxAverageFrameIntervalMs &&
        averageMainThreadMs <= baseline.maxAverageMainThreadMs,
      baseline,
      recordedAt: new Date().toISOString(),
    };
    activeSample = null;
    logPreviewInteractionSummary(summary);
    return summary;
  };

  return {
    finish,
    recordFrame,
    start,
  };
};
