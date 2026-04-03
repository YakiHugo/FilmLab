import { describe, expect, it, vi } from "vitest";
import type { LocalAdjustmentMask } from "@/types";
import { PipelineRenderer } from "./PipelineRenderer";

type MockPass = {
  id: string;
  programInfo: unknown;
  uniforms: Record<string, unknown>;
  outputFormat: "RGBA8" | "RGBA16F";
  enabled: boolean;
};

const renderLocalMaskShape = PipelineRenderer.prototype.renderLocalMaskShape;

const createRendererStub = () => {
  const viewport = vi.fn();
  const runToCanvas = vi.fn();
  const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
  const programs = {
    passthrough: { program: "passthrough" },
    brushMaskStamp: { program: "brush-mask-stamp" },
    maskInvert: { program: "mask-invert" },
    linearGradientMask: { program: "linear-gradient" },
    radialGradientMask: { program: "radial-gradient" },
  };
  const renderer = {
    destroyed: false,
    contextLost: false,
    canvasElement: canvas,
    gl: { viewport },
    filterPipeline: { runToCanvas },
    programs,
    emptyMaskTexture: { id: "empty-mask" },
    fullMaskTexture: { id: "full-mask" },
    lastTargetWidth: 0,
    lastTargetHeight: 0,
  } as unknown as PipelineRenderer;

  return {
    renderer,
    viewport,
    runToCanvas,
    programs,
  };
};

describe("PipelineRenderer.renderLocalMaskShape", () => {
  it("renders brush masks as GPU dab passes with ROI-aware coordinates", () => {
    const { renderer, viewport, runToCanvas, programs } = createRendererStub();
    const mask: LocalAdjustmentMask = {
      mode: "brush",
      brushSize: 0.1,
      feather: 0.25,
      flow: 0.6,
      invert: true,
      points: [
        { x: 0.25, y: 0.25, pressure: 0.5 },
        { x: 0.75, y: 0.5, pressure: 1 },
      ],
    };

    const rendered = renderLocalMaskShape.call(renderer, mask, 100, 80, {
      fullWidth: 200,
      fullHeight: 160,
      offsetX: 20,
      offsetY: 10,
    });

    expect(rendered).toBe(true);
    expect(viewport).toHaveBeenCalledWith(0, 0, 100, 80);
    expect(runToCanvas).toHaveBeenCalledTimes(1);
    const call = runToCanvas.mock.calls[0]?.[0] as {
      passes: MockPass[];
      input: { texture: unknown };
      canvasOutput: { width: number; height: number };
    };
    expect(call.input.texture).toBe((renderer as unknown as { emptyMaskTexture: unknown }).emptyMaskTexture);
    expect(call.canvasOutput).toEqual({ width: 100, height: 80 });
    expect(call.passes).toHaveLength(3);
    expect(call.passes[0]?.programInfo).toBe(programs.brushMaskStamp);
    expect(call.passes[1]?.programInfo).toBe(programs.brushMaskStamp);
    expect(call.passes[2]?.programInfo).toBe(programs.maskInvert);

    const firstUniforms = call.passes[0]?.uniforms as {
      u_centerPx: Float32Array;
      u_radiusPx: number;
      u_innerRadiusPx: number;
      u_flow: number;
      u_canvasSize: Float32Array;
    };
    expect(Array.from(firstUniforms.u_centerPx)).toEqual([30, 30]);
    expect(firstUniforms.u_radiusPx).toBeCloseTo(8);
    expect(firstUniforms.u_innerRadiusPx).toBeCloseTo(6);
    expect(firstUniforms.u_flow).toBeCloseTo(0.6);
    expect(Array.from(firstUniforms.u_canvasSize)).toEqual([100, 80]);
  });

  it("renders an inverted empty brush mask as a single invert pass", () => {
    const { renderer, runToCanvas, programs } = createRendererStub();
    const mask: LocalAdjustmentMask = {
      mode: "brush",
      brushSize: 0.05,
      feather: 0.2,
      flow: 0.5,
      invert: true,
      points: [],
    };

    const rendered = renderLocalMaskShape.call(renderer, mask, 64, 64);

    expect(rendered).toBe(true);
    const call = runToCanvas.mock.calls[0]?.[0] as { passes: MockPass[] };
    expect(call.passes).toHaveLength(1);
    expect(call.passes[0]?.programInfo).toBe(programs.maskInvert);
  });

  it("fails safe for very large brush point sets so callers can fall back to CPU", () => {
    const { renderer, runToCanvas } = createRendererStub();
    const mask: LocalAdjustmentMask = {
      mode: "brush",
      brushSize: 0.05,
      feather: 0.1,
      flow: 0.75,
      points: Array.from({ length: 513 }, (_, index) => ({
        x: (index % 32) / 31,
        y: (index % 16) / 15,
        pressure: 1,
      })),
    };

    const rendered = renderLocalMaskShape.call(renderer, mask, 64, 64);

    expect(rendered).toBe(false);
    expect(runToCanvas).not.toHaveBeenCalled();
  });
});
