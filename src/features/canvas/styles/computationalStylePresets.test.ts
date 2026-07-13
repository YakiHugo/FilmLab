import { describe, expect, it } from "vitest";
import { createNeutralCanvasImageRenderState } from "@/render/image";
import {
  applyComputationalStylePreset,
  clearComputationalStyle,
  COMPUTATIONAL_STYLE_PRESETS,
  resolveComputationalStyleIntensity,
  resolveComputationalStylePresetId,
} from "./computationalStylePresets";

describe("computational style presets", () => {
  it.each(COMPUTATIONAL_STYLE_PRESETS)("applies and resolves $id", ({ id }) => {
    const source = createNeutralCanvasImageRenderState();
    source.semanticOverlays = [
      {
        id: "caption-1",
        type: "caption",
        enabled: true,
        params: {
          text: "PRESERVE ME",
          position: "bottom",
          alignment: "center",
          fontSize: 24,
          color: "#ffffff",
          backgroundColor: "#000000",
          backgroundOpacity: 0.4,
          padding: 12,
          opacity: 1,
        },
      },
    ];

    const styled = applyComputationalStylePreset(source, id, 0.64);

    expect(resolveComputationalStylePresetId(styled)).toBe(id);
    expect(resolveComputationalStyleIntensity(styled, id)).toBeCloseTo(0.64, 1);
    expect(styled.semanticOverlays).toEqual(source.semanticOverlays);
    expect(styled.geometry).toEqual(source.geometry);
  });

  it("replaces the previous computational carrier and supports bypass", () => {
    const mosaic = applyComputationalStylePreset(
      createNeutralCanvasImageRenderState(),
      "data-mosaic",
      0.8
    );
    const print = applyComputationalStylePreset(mosaic, "print-screen", 0.5);

    expect(resolveComputationalStylePresetId(print)).toBe("print-screen");
    expect(print.carrierTransforms.find((transform) => transform.type === "ascii")?.enabled).toBe(
      false
    );
    expect(print.signalDamage.find((node) => node.type === "channel-drift")?.enabled).toBe(false);

    const bypassed = clearComputationalStyle(print);
    expect(resolveComputationalStylePresetId(bypassed)).toBeNull();
  });
});
