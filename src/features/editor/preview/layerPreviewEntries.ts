import type { EditingAdjustments } from "@/types";
import type { LayerPreviewEntry } from "./contracts";

export const applySelectedLayerPreviewAdjustments = (
  layerEntries: LayerPreviewEntry[],
  selectedLayerId: string | null,
  adjustments: EditingAdjustments | null
) => {
  if (!selectedLayerId || !adjustments) {
    return layerEntries;
  }

  let changed = false;
  const nextEntries = layerEntries.map((entry) => {
    if (entry.layer.id !== selectedLayerId) {
      return entry;
    }
    changed = true;
    return {
      ...entry,
      adjustments,
    };
  });

  return changed ? nextEntries : layerEntries;
};
