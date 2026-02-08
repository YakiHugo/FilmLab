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
const OPEN_SECTIONS_STORAGE_KEY = "filmlab.editor.openSections";

const loadOpenSections = (): Record<SectionId, boolean> => {
  if (typeof window === "undefined") {
    return { ...DEFAULT_OPEN_SECTIONS };
  }
  const raw = window.localStorage.getItem(OPEN_SECTIONS_STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_OPEN_SECTIONS };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_OPEN_SECTIONS };
    }
    const merged = { ...DEFAULT_OPEN_SECTIONS };
    (Object.keys(DEFAULT_OPEN_SECTIONS) as SectionId[]).forEach((id) => {
      const value = (parsed as Record<string, unknown>)[id];
      if (typeof value === "boolean") {
        merged[id] = value;
      }
    });
    return merged;
  } catch {
    return { ...DEFAULT_OPEN_SECTIONS };
  }
};

const saveOpenSections = (sections: Record<SectionId, boolean>) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(OPEN_SECTIONS_STORAGE_KEY, JSON.stringify(sections));
};

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
  openSections: loadOpenSections(),
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
    set((state) => {
      const nextSections = {
        ...state.openSections,
        [id]: !state.openSections[id],
      };
      saveOpenSections(nextSections);
      return {
        openSections: nextSections,
      };
    }),
  setPreviewHistogram: (previewHistogram) => set({ previewHistogram }),
}));
