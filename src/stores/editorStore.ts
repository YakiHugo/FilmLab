import { create } from "zustand";
import {
  DEFAULT_OPEN_SECTIONS,
  type CurveChannel,
  type SectionId,
} from "@/pages/editor/editorPanelConfig";
import type { HistogramData } from "@/pages/editor/histogram";
import { loadCustomPresets, saveCustomPresets } from "@/pages/editor/presetUtils";
import type { EditingAdjustments, HslColorKey, Preset } from "@/types";

type PresetUpdater = Preset[] | ((current: Preset[]) => Preset[]);

interface EditorState {
  selectedAssetId: string | null;
  showOriginal: boolean;
  copiedAdjustments: EditingAdjustments | null;
  customPresetName: string;
  customPresets: Preset[];
  activeHslColor: HslColorKey;
  curveChannel: CurveChannel;
  openSections: Record<SectionId, boolean>;
  previewHistogram: HistogramData | null;
  setSelectedAssetId: (assetId: string | null) => void;
  setShowOriginal: (showOriginal: boolean) => void;
  setCopiedAdjustments: (adjustments: EditingAdjustments | null) => void;
  setCustomPresetName: (name: string) => void;
  setCustomPresets: (updater: PresetUpdater) => void;
  setActiveHslColor: (color: HslColorKey) => void;
  setCurveChannel: (channel: CurveChannel) => void;
  toggleOriginal: () => void;
  toggleSection: (id: SectionId) => void;
  setPreviewHistogram: (histogram: HistogramData | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  selectedAssetId: null,
  showOriginal: false,
  copiedAdjustments: null,
  customPresetName: "",
  customPresets: loadCustomPresets(),
  activeHslColor: "red",
  curveChannel: "rgb",
  openSections: { ...DEFAULT_OPEN_SECTIONS },
  previewHistogram: null,
  setSelectedAssetId: (selectedAssetId) => set({ selectedAssetId }),
  setShowOriginal: (showOriginal) => set({ showOriginal }),
  setCopiedAdjustments: (copiedAdjustments) => set({ copiedAdjustments }),
  setCustomPresetName: (customPresetName) => set({ customPresetName }),
  setCustomPresets: (updater) =>
    set((state) => {
      const next =
        typeof updater === "function" ? updater(state.customPresets) : updater;
      saveCustomPresets(next);
      return { customPresets: next };
    }),
  setActiveHslColor: (activeHslColor) => set({ activeHslColor }),
  setCurveChannel: (curveChannel) => set({ curveChannel }),
  toggleOriginal: () => set((state) => ({ showOriginal: !state.showOriginal })),
  toggleSection: (id) =>
    set((state) => ({
      openSections: {
        ...state.openSections,
        [id]: !state.openSections[id],
      },
    })),
  setPreviewHistogram: (previewHistogram) => set({ previewHistogram }),
}));
