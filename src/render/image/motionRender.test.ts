import { describe, expect, it } from "vitest";
import {
  applyMotionProgramToDocument,
  computeMotionFrameCount,
  createMotionFrameContext,
} from "./motionRender";
import type { ImageRenderDocument, MotionProgram, SignalDamageNode } from "./types";

const createSignalDriftProgram = (
  overrides?: Partial<MotionProgram>
): MotionProgram => ({
  id: "drift-1",
  type: "signal-drift",
  enabled: true,
  durationMs: 2000,
  fps: 10,
  loop: true,
  params: {
    driftAmplitude: 20,
    intensity: 0.8,
  },
  ...overrides,
});

const createMinimalDocument = (
  signalDamage: SignalDamageNode[] = []
): ImageRenderDocument =>
  ({
    id: "doc-1",
    source: { assetId: "a", objectUrl: "blob:", name: "test", mimeType: "image/jpeg" },
    revisionKey: "rev-1",
    geometry: {},
    develop: { tone: {}, color: {}, detail: {}, fx: {}, regions: [] },
    masks: { byId: {} },
    carrierTransforms: [],
    signalDamage,
    semanticOverlays: [],
    effects: [],
    motionPrograms: [],
    film: { profileId: null, profile: null },
    output: {},
  }) as unknown as ImageRenderDocument;

describe("motionRender", () => {
  describe("computeMotionFrameCount", () => {
    it("computes frames from duration and fps", () => {
      expect(computeMotionFrameCount(createSignalDriftProgram())).toBe(20);
    });

    it("returns at least 1 frame", () => {
      expect(
        computeMotionFrameCount(createSignalDriftProgram({ durationMs: 0 }))
      ).toBe(1);
    });

    it("rounds up partial frames", () => {
      expect(
        computeMotionFrameCount(createSignalDriftProgram({ durationMs: 150, fps: 10 }))
      ).toBe(2);
    });
  });

  describe("createMotionFrameContext", () => {
    it("creates context for first frame", () => {
      const program = createSignalDriftProgram();
      const ctx = createMotionFrameContext(program, 0);
      expect(ctx.frameIndex).toBe(0);
      expect(ctx.timeMs).toBe(0);
      expect(ctx.normalizedTime).toBe(0);
      expect(ctx.totalFrames).toBe(20);
    });

    it("creates context for middle frame", () => {
      const program = createSignalDriftProgram();
      const ctx = createMotionFrameContext(program, 10);
      expect(ctx.frameIndex).toBe(10);
      expect(ctx.timeMs).toBe(1000);
      expect(ctx.normalizedTime).toBe(0.5);
    });

    it("creates context for last frame of looping program", () => {
      const program = createSignalDriftProgram({ loop: true });
      const ctx = createMotionFrameContext(program, 19);
      expect(ctx.frameIndex).toBe(19);
      expect(ctx.normalizedTime).toBeCloseTo(0.95);
    });

    it("reaches normalizedTime 1.0 on last frame of non-looping program", () => {
      const program = createSignalDriftProgram({ loop: false });
      const ctx = createMotionFrameContext(program, 19);
      expect(ctx.normalizedTime).toBe(1);
    });

    it("handles single-frame program", () => {
      const program = createSignalDriftProgram({ durationMs: 50, fps: 10 });
      const ctx = createMotionFrameContext(program, 0);
      expect(ctx.normalizedTime).toBe(0);
      expect(ctx.totalFrames).toBe(1);
    });
  });

  describe("applyMotionProgramToDocument", () => {
    it("appends a channel-drift node for signal-drift program", () => {
      const program = createSignalDriftProgram();
      const baseDoc = createMinimalDocument();
      const frame = createMotionFrameContext(program, 0);
      const result = applyMotionProgramToDocument(program, baseDoc, frame);

      const driftNodes = result.signalDamage.filter(
        (n) => n.type === "channel-drift"
      );
      expect(driftNodes).toHaveLength(1);
      expect(driftNodes[0]!.id).toBe("motion-drift-drift-1");
      expect(driftNodes[0]!.enabled).toBe(true);
    });

    it("preserves existing signal damage", () => {
      const program = createSignalDriftProgram();
      const existing: SignalDamageNode = {
        id: "existing-drift",
        type: "channel-drift",
        enabled: true,
        params: {
          redOffsetX: 5,
          redOffsetY: 0,
          greenOffsetX: 0,
          greenOffsetY: 0,
          blueOffsetX: -5,
          blueOffsetY: 0,
          intensity: 1,
        },
      };
      const baseDoc = createMinimalDocument([existing]);
      const frame = createMotionFrameContext(program, 0);
      const result = applyMotionProgramToDocument(program, baseDoc, frame);

      expect(result.signalDamage).toHaveLength(2);
      expect(result.signalDamage[0]!.id).toBe("existing-drift");
    });

    it("varies drift offsets across frames", () => {
      const program = createSignalDriftProgram();
      const baseDoc = createMinimalDocument();

      const frame0 = createMotionFrameContext(program, 0);
      const frame5 = createMotionFrameContext(program, 5);
      const frame10 = createMotionFrameContext(program, 10);

      const doc0 = applyMotionProgramToDocument(program, baseDoc, frame0);
      const doc5 = applyMotionProgramToDocument(program, baseDoc, frame5);
      const doc10 = applyMotionProgramToDocument(program, baseDoc, frame10);

      const drift0 = doc0.signalDamage[0]!.params;
      const drift5 = doc5.signalDamage[0]!.params;
      const drift10 = doc10.signalDamage[0]!.params;

      expect(drift0.redOffsetX).not.toBe(drift5.redOffsetX);
      expect(drift5.redOffsetX).not.toBe(drift10.redOffsetX);
    });

    it("produces zero drift at frame 0 (sin(0) = 0)", () => {
      const program = createSignalDriftProgram();
      const baseDoc = createMinimalDocument();
      const frame = createMotionFrameContext(program, 0);
      const result = applyMotionProgramToDocument(program, baseDoc, frame);

      const drift = result.signalDamage[0]!.params;
      expect(drift.redOffsetX).toBeCloseTo(0);
      expect(drift.blueOffsetX).toBeCloseTo(0);
      expect(drift.greenOffsetX).toBe(0);
      expect(drift.greenOffsetY).toBe(0);
    });

    it("produces max drift at quarter cycle", () => {
      const program = createSignalDriftProgram({ durationMs: 4000, fps: 4 });
      const baseDoc = createMinimalDocument();
      const totalFrames = computeMotionFrameCount(program);
      const quarterFrame = Math.round(totalFrames / 4);
      const frame = createMotionFrameContext(program, quarterFrame);
      const result = applyMotionProgramToDocument(program, baseDoc, frame);

      const drift = result.signalDamage[0]!.params;
      const maxDrift = program.params.driftAmplitude;
      expect(Math.abs(drift.redOffsetX)).toBeGreaterThan(maxDrift * 0.9);
    });

    it("generates a fresh revision key per frame", () => {
      const program = createSignalDriftProgram();
      const baseDoc = createMinimalDocument();

      const doc0 = applyMotionProgramToDocument(
        program,
        baseDoc,
        createMotionFrameContext(program, 0)
      );
      const doc5 = applyMotionProgramToDocument(
        program,
        baseDoc,
        createMotionFrameContext(program, 5)
      );

      expect(doc0.revisionKey).not.toBe(doc5.revisionKey);
    });
  });
});
