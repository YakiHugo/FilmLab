import { create } from "zustand";
import {
  DEFAULT_OPEN_SECTIONS,
  type CurveChannel,
  type SectionId,
} from "@/pages/editor/editorPanelConfig";
import {
  MAX_HISTORY_PER_ASSET,
  cloneEditorAssetSnapshot,
  isEditorAssetSnapshotEqual,
  type EditorAssetSnapshot,
} from "@/pages/editor/history";
import type { HistogramData } from "@/pages/editor/histogram";
import { loadCustomPresets, saveCustomPresets } from "@/pages/editor/presetUtils";
import type { EditingAdjustments, HslColorKey, Preset } from "@/types";

type PresetUpdater = Preset[] | ((current: Preset[]) => Preset[]);
const OPEN_SECTIONS_STORAGE_KEY = "filmlab.editor.openSections";

interface AssetHistoryState {
  past: EditorAssetSnapshot[];
  future: EditorAssetSnapshot[];
}

type HistoryByAssetId = Record<string, AssetHistoryState>;

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
  historyByAssetId: HistoryByAssetId;
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
  canUndo: (assetId: string) => boolean;
  canRedo: (assetId: string) => boolean;
  pushHistory: (assetId: string, before: EditorAssetSnapshot) => void;
  undoSnapshot: (
    assetId: string,
    current: EditorAssetSnapshot
  ) => EditorAssetSnapshot | null;
  redoSnapshot: (
    assetId: string,
    current: EditorAssetSnapshot
  ) => EditorAssetSnapshot | null;
  clearHistory: (assetId: string) => void;
  clearAllHistory: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  selectedAssetId: null,
  showOriginal: false,
  copiedAdjustments: null,
  customPresetName: "",
  customPresets: loadCustomPresets(),
  activeHslColor: "red",
  curveChannel: "rgb",
  openSections: loadOpenSections(),
  previewHistogram: null,
  historyByAssetId: {},
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
  canUndo: (assetId) => {
    const history = get().historyByAssetId[assetId];
    return Boolean(history && history.past.length > 0);
  },
  canRedo: (assetId) => {
    const history = get().historyByAssetId[assetId];
    return Boolean(history && history.future.length > 0);
  },
  pushHistory: (assetId, before) =>
    set((state) => {
      const currentHistory = state.historyByAssetId[assetId] ?? {
        past: [],
        future: [],
      };
      const nextEntry = cloneEditorAssetSnapshot(before);
      const lastEntry = currentHistory.past[currentHistory.past.length - 1];
      const shouldAppend =
        !lastEntry || !isEditorAssetSnapshotEqual(lastEntry, nextEntry);
      if (!shouldAppend && currentHistory.future.length === 0) {
        return state;
      }
      const nextPast = shouldAppend
        ? [...currentHistory.past, nextEntry]
        : [...currentHistory.past];
      if (nextPast.length > MAX_HISTORY_PER_ASSET) {
        nextPast.splice(0, nextPast.length - MAX_HISTORY_PER_ASSET);
      }
      return {
        historyByAssetId: {
          ...state.historyByAssetId,
          [assetId]: {
            past: nextPast,
            future: [],
          },
        },
      };
    }),
  undoSnapshot: (assetId, current) => {
    let resolved: EditorAssetSnapshot | null = null;
    set((state) => {
      const currentHistory = state.historyByAssetId[assetId];
      if (!currentHistory || currentHistory.past.length === 0) {
        return state;
      }
      const nextPast = currentHistory.past.slice(0, -1);
      const previous = currentHistory.past[currentHistory.past.length - 1];
      if (!previous) {
        return state;
      }
      resolved = cloneEditorAssetSnapshot(previous);
      return {
        historyByAssetId: {
          ...state.historyByAssetId,
          [assetId]: {
            past: nextPast,
            future: [
              cloneEditorAssetSnapshot(current),
              ...currentHistory.future,
            ],
          },
        },
      };
    });
    return resolved;
  },
  redoSnapshot: (assetId, current) => {
    let resolved: EditorAssetSnapshot | null = null;
    set((state) => {
      const currentHistory = state.historyByAssetId[assetId];
      if (!currentHistory || currentHistory.future.length === 0) {
        return state;
      }
      const next = currentHistory.future[0];
      if (!next) {
        return state;
      }
      resolved = cloneEditorAssetSnapshot(next);
      const nextPast = [
        ...currentHistory.past,
        cloneEditorAssetSnapshot(current),
      ];
      if (nextPast.length > MAX_HISTORY_PER_ASSET) {
        nextPast.splice(0, nextPast.length - MAX_HISTORY_PER_ASSET);
      }
      return {
        historyByAssetId: {
          ...state.historyByAssetId,
          [assetId]: {
            past: nextPast,
            future: currentHistory.future.slice(1),
          },
        },
      };
    });
    return resolved;
  },
  clearHistory: (assetId) =>
    set((state) => {
      if (!state.historyByAssetId[assetId]) {
        return state;
      }
      const nextHistory = { ...state.historyByAssetId };
      delete nextHistory[assetId];
      return { historyByAssetId: nextHistory };
    }),
  clearAllHistory: () => set({ historyByAssetId: {} }),
}));
