import { describe, expect, it } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import {
  applyAdjustmentGroupVisibility,
  hasAdjustmentGroupChanges,
  normalizeEditorAdjustmentGroupVisibility,
} from "./editorAdjustmentVisibility";

describe("editorAdjustmentVisibility", () => {
  it("defaults missing visibility flags to visible", () => {
    expect(normalizeEditorAdjustmentGroupVisibility(undefined)).toEqual({
      basic: true,
      effects: true,
      detail: true,
    });
  });

  it("resets only the hidden groups back to defaults", () => {
    const defaults = createDefaultAdjustments();
    const adjustments = {
      ...defaults,
      exposure: 24,
      temperatureKelvin: 7200,
      clarity: 30,
      customLut: {
        enabled: true,
        path: "/luts/demo.cube",
        size: 16 as const,
        intensity: 0.8,
      },
      sharpening: 70,
      hsl: {
        ...defaults.hsl,
        red: {
          ...defaults.hsl.red,
          hue: 12,
        },
      },
    };

    const next = applyAdjustmentGroupVisibility(adjustments, {
      basic: false,
      effects: false,
      detail: true,
    });

    expect(next.exposure).toBe(defaults.exposure);
    expect(next.temperatureKelvin).toBe(defaults.temperatureKelvin);
    expect(next.clarity).toBe(defaults.clarity);
    expect(next.customLut).toEqual(defaults.customLut);
    expect(next.sharpening).toBe(70);
    expect(next.hsl.red.hue).toBe(12);
    expect(next.pointCurve).toEqual(defaults.pointCurve);
  });

  it("detects grouped changes using the same field mapping as visibility", () => {
    const defaults = createDefaultAdjustments();

    expect(hasAdjustmentGroupChanges(defaults, "basic")).toBe(false);
    expect(hasAdjustmentGroupChanges(defaults, "effects")).toBe(false);
    expect(hasAdjustmentGroupChanges(defaults, "detail")).toBe(false);

    expect(
      hasAdjustmentGroupChanges(
        {
          ...defaults,
          temperatureKelvin: 7200,
        },
        "basic"
      )
    ).toBe(true);

    expect(
      hasAdjustmentGroupChanges(
        {
          ...defaults,
          customLut: {
            enabled: true,
            path: "/luts/demo.cube",
            size: 16,
            intensity: 0.8,
          },
        },
        "effects"
      )
    ).toBe(true);

    expect(
      hasAdjustmentGroupChanges(
        {
          ...defaults,
          sharpenRadius: 60,
        },
        "detail"
      )
    ).toBe(true);
  });
});
