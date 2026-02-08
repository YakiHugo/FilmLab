import { buildPresetAdjustments, filmStockDefinitions, toFilmProfileId } from "@/data/filmStockDefinitions";
import type { Preset } from "@/types";

export const presets: Preset[] = filmStockDefinitions.map((stock) => ({
  id: `preset-${stock.id}`,
  filmProfileId: toFilmProfileId(stock.id),
  name: stock.name,
  tags: [stock.tag],
  intensity: stock.intensity,
  description: stock.description,
  adjustments: buildPresetAdjustments(stock),
}));
