import { describe, expect, it } from "vitest";
import {
  PREVIEW_INTERACTION_BASELINES,
  createPreviewInteractionSampler,
} from "./interactionPerformance";

describe("createPreviewInteractionSampler", () => {
  it("returns null when an interaction finishes without samples", () => {
    const sampler = createPreviewInteractionSampler("crop-drag");
    sampler.start(100);
    expect(sampler.finish(200)).toBeNull();
  });

  it("computes averages and passes the baseline when samples stay under the threshold", () => {
    const sampler = createPreviewInteractionSampler("crop-drag");
    const baseline = PREVIEW_INTERACTION_BASELINES["crop-drag"];

    sampler.start(0);
    sampler.recordFrame(10, 18);
    sampler.recordFrame(32, 40);
    sampler.recordFrame(54, 62);
    sampler.recordFrame(76, 84);
    sampler.recordFrame(98, 106);
    sampler.recordFrame(120, 128);

    const summary = sampler.finish(140);
    expect(summary).not.toBeNull();
    expect(summary?.sampleCount).toBe(6);
    expect(summary?.averageFrameIntervalMs).toBeCloseTo(21.333, 2);
    expect(summary?.averageMainThreadMs).toBeCloseTo(8, 4);
    expect(summary?.meetsBaseline).toBe(true);
    expect(summary?.baseline).toEqual(baseline);
  });

  it("fails the baseline when the average frame interval regresses", () => {
    const sampler = createPreviewInteractionSampler("brush-paint");

    sampler.start(0);
    sampler.recordFrame(20, 32);
    sampler.recordFrame(52, 64);
    sampler.recordFrame(84, 96);
    sampler.recordFrame(116, 128);
    sampler.recordFrame(148, 160);
    sampler.recordFrame(180, 192);

    const summary = sampler.finish(210);
    expect(summary?.averageFrameIntervalMs).toBeGreaterThan(
      PREVIEW_INTERACTION_BASELINES["brush-paint"].maxAverageFrameIntervalMs
    );
    expect(summary?.meetsBaseline).toBe(false);
  });
});
