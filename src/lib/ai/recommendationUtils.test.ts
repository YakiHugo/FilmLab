import { describe, expect, it } from "vitest";
import type { Preset } from "@/types";
import {
  applySelectionLimit,
  findAutoApplyPreset,
  prioritizePresetsByRecommendation,
  sanitizeTopPresetRecommendations,
  toggleSelectionWithLimit,
} from "./recommendationUtils";

const createPreset = (id: string): Preset => ({
  id,
  name: id,
  tags: ["portrait"],
  intensity: 60,
  description: id,
  adjustments: {},
});

describe("sanitizeTopPresetRecommendations", () => {
  it("deduplicates and filters invalid entries without fallback filling", () => {
    const result = sanitizeTopPresetRecommendations(
      [
        { presetId: "p2", reason: "first", confidence: 1.2 },
        { presetId: "p2", reason: "duplicate", confidence: 0.1 },
        { presetId: "unknown", reason: "invalid", confidence: 0.1 },
        { presetId: "p1", confidence: -2 },
      ],
      ["p1", "p2", "p3", "p4"],
      4
    );

    expect(result).toHaveLength(2);
    expect(result[0]?.presetId).toBe("p2");
    expect(result[0]?.confidence).toBe(1);
    expect(result[1]?.presetId).toBe("p1");
    expect(result[1]?.confidence).toBe(0);
  });

  it("returns empty array when no valid matches", () => {
    const result = sanitizeTopPresetRecommendations(
      [{ presetId: "unknown", reason: "bad", confidence: 0.5 }],
      ["p1", "p2"],
      3
    );
    expect(result).toHaveLength(0);
  });
});

describe("prioritizePresetsByRecommendation", () => {
  it("moves recommended presets to the front in recommendation order", () => {
    const presets = ["p1", "p2", "p3", "p4"].map(createPreset);
    const sorted = prioritizePresetsByRecommendation(presets, [
      { presetId: "p3", reason: "3", confidence: 0.9 },
      { presetId: "p1", reason: "1", confidence: 0.7 },
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["p3", "p1", "p2", "p4"]);
  });
});

describe("findAutoApplyPreset", () => {
  it("returns the first valid recommended preset", () => {
    const presets = ["p1", "p2"].map(createPreset);
    const resolved = findAutoApplyPreset(presets, [
      { presetId: "p2", reason: "best", confidence: 0.8 },
    ]);
    expect(resolved?.id).toBe("p2");
  });
});

describe("selection limit helpers", () => {
  it("limits selection size and preserves first selected IDs", () => {
    const result = applySelectionLimit(["a", "b", "a", "c"], 2);
    expect(result.ids).toEqual(["a", "b"]);
    expect(result.limited).toBe(true);
  });

  it("prevents adding when toggle reaches cap", () => {
    const result = toggleSelectionWithLimit(["a", "b"], "c", 2);
    expect(result.ids).toEqual(["a", "b"]);
    expect(result.limited).toBe(true);
  });

  it("removes selected asset when toggled", () => {
    const result = toggleSelectionWithLimit(["a", "b"], "a", 2);
    expect(result.ids).toEqual(["b"]);
    expect(result.limited).toBe(false);
  });
});
