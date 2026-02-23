import { describe, expect, it } from "vitest";
import type { AssetAiRecommendation, Preset } from "@/types";
import { buildPresetDisplayLists } from "./presetListUtils";

const createPreset = (id: string, name: string): Preset => ({
  id,
  name,
  tags: ["portrait"],
  intensity: 100,
  description: "",
  adjustments: {},
});

const createAiRecommendation = (
  topPresets: AssetAiRecommendation["topPresets"]
): AssetAiRecommendation => ({
  version: 1,
  model: "gpt-4.1-mini",
  matchedAt: "2026-01-01T00:00:00.000Z",
  attempts: 1,
  topPresets,
  status: "succeeded",
});

describe("buildPresetDisplayLists", () => {
  it("keeps AI recommendations on top in original order", () => {
    const presets = [
      createPreset("preset-a", "Beta"),
      createPreset("preset-b", "Alpha"),
      createPreset("preset-c", "Gamma"),
    ];
    const ai = createAiRecommendation([
      { presetId: "preset-c", reason: "fit", confidence: 0.9 },
      { presetId: "preset-a", reason: "mood", confidence: 0.7 },
    ]);

    const result = buildPresetDisplayLists(presets, ai);
    expect(result.aiRecommendations.map((item) => item.id)).toEqual(["preset-c", "preset-a"]);
  });

  it("deduplicates presets between AI and normal list, and sorts normal list", () => {
    const presets = [
      createPreset("preset-a", "鑳剁墖 10"),
      createPreset("preset-b", "鑳剁墖 2"),
      createPreset("preset-c", "鑳剁墖 1"),
    ];
    const ai = createAiRecommendation([
      { presetId: "preset-b", reason: "fit", confidence: 0.9 },
      { presetId: "preset-b", reason: "duplicate", confidence: 0.8 },
    ]);

    const result = buildPresetDisplayLists(presets, ai);
    expect(result.aiRecommendations.map((item) => item.id)).toEqual(["preset-b"]);
    expect(result.sortedPresets.map((item) => item.id)).toEqual(["preset-c", "preset-a"]);
  });
});
