import type { AssetAiRecommendation, Preset } from "@/types";

export interface DisplayPresetRecommendation {
  id: string;
  name: string;
  reason: string;
}

const presetCollator = new Intl.Collator("zh-Hans", {
  numeric: true,
  sensitivity: "base",
});

export const buildPresetDisplayLists = (
  presets: Preset[],
  aiRecommendation?: AssetAiRecommendation
) => {
  const byId = new Map(presets.map((preset) => [preset.id, preset]));
  const aiRecommendations: DisplayPresetRecommendation[] = [];
  const aiPresetIds = new Set<string>();

  aiRecommendation?.topPresets.forEach((item) => {
    const preset = byId.get(item.presetId);
    if (!preset || aiPresetIds.has(preset.id)) {
      return;
    }
    aiPresetIds.add(preset.id);
    aiRecommendations.push({
      id: preset.id,
      name: preset.name,
      reason: item.reason,
    });
  });

  const sortedPresets = [...presets]
    .filter((preset) => !aiPresetIds.has(preset.id))
    .sort((a: Preset, b: Preset) => presetCollator.compare(a.name, b.name));

  return {
    aiRecommendations,
    sortedPresets,
  };
};
