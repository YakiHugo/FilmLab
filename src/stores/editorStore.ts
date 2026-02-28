import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  DEFAULT_EDITOR_TOOL_PANEL_ID,
  DEFAULT_OPEN_SECTIONS,
  type EditorToolPanelId,
  type CurveChannel,
  type SectionId,
} from "@/features/editor/editorPanelConfig";
import {
  MAX_HISTORY_PER_ASSET,
  cloneEditorAssetSnapshot,
  isEditorAssetSnapshotEqual,
  type EditorAssetSnapshot,
} from "@/features/editor/history";

/** Maximum number of assets to keep history for simultaneously. */
const MAX_HISTORY_ASSETS = 20;
import type { HistogramData } from "@/features/editor/histogram";
import { loadCustomPresets, saveCustomPresets } from "@/features/editor/presetUtils";
import { on } from "@/lib/storeEvents";
import type { EditingAdjustments, HslColorKey, Preset } from "@/types";

type PresetUpdater = Preset[] | ((current: Preset[]) => Preset[]);
const OPEN_SECTIONS_STORAGE_KEY = "filmlab.editor.openSections";

interface AssetHistoryState {
  past: EditorAssetSnapshot[];
  future: EditorAssetSnapshot[];
}

type HistoryByAssetId = Record<string, AssetHistoryState>;

export interface PointColorSample {
  red: number;
  green: number;
  blue: number;
  hex: string;
  hue: number;
  mappedColor: HslColorKey;
}

export type PointColorPickTarget = "hsl" | "localMask";
export type AutoPerspectiveMode = "auto" | "level" | "vertical" | "full" | "guided";

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

const SAVE_SECTIONS_DEBOUNCE_MS = 300;
let _saveOpenSectionsTimer: ReturnType<typeof setTimeout> | null = null;

const saveOpenSections = (sections: Record<SectionId, boolean>) => {
  if (typeof window === "undefined") {
    return;
  }
  if (_saveOpenSectionsTimer) {
    clearTimeout(_saveOpenSectionsTimer);
  }
  _saveOpenSectionsTimer = setTimeout(() => {
    _saveOpenSectionsTimer = null;
    window.localStorage.setItem(OPEN_SECTIONS_STORAGE_KEY, JSON.stringify(sections));
  }, SAVE_SECTIONS_DEBOUNCE_MS);
};

interface EditorState {
  selectedAssetId: string | null;
  showOriginal: boolean;
  activeToolPanelId: EditorToolPanelId;
  mobilePanelExpanded: boolean;
  copiedAdjustments: EditingAdjustments | null;
  customPresetName: string;
  customPresets: Preset[];
  activeHslColor: HslColorKey;
  curveChannel: CurveChannel;
  openSections: Record<SectionId, boolean>;
  previewHistogram: HistogramData | null;
  pointColorPicking: boolean;
  pointColorPickTarget: PointColorPickTarget;
  lastPointColorSample: PointColorSample | null;
  autoPerspectiveRequestId: number;
  autoPerspectiveMode: AutoPerspectiveMode;
  selectedLocalAdjustmentId: string | null;
  historyByAssetId: HistoryByAssetId;
  setSelectedAssetId: (assetId: string | null) => void;
  setShowOriginal: (showOriginal: boolean) => void;
  setActiveToolPanelId: (panelId: EditorToolPanelId) => void;
  setMobilePanelExpanded: (expanded: boolean) => void;
  setCopiedAdjustments: (adjustments: EditingAdjustments | null) => void;
  setCustomPresetName: (name: string) => void;
  setCustomPresets: (updater: PresetUpdater) => void;
  setActiveHslColor: (color: HslColorKey) => void;
  setCurveChannel: (channel: CurveChannel) => void;
  setPointColorPicking: (picking: boolean) => void;
  setPointColorPickTarget: (target: PointColorPickTarget) => void;
  setLastPointColorSample: (sample: PointColorSample | null) => void;
  requestAutoPerspective: (mode: AutoPerspectiveMode) => void;
  setSelectedLocalAdjustmentId: (id: string | null) => void;
  toggleOriginal: () => void;
  toggleSection: (id: SectionId) => void;
  setPreviewHistogram: (histogram: HistogramData | null) => void;
  canUndo: (assetId: string) => boolean;
  canRedo: (assetId: string) => boolean;
  pushHistory: (assetId: string, before: EditorAssetSnapshot) => void;
  undoSnapshot: (assetId: string, current: EditorAssetSnapshot) => EditorAssetSnapshot | null;
  redoSnapshot: (assetId: string, current: EditorAssetSnapshot) => EditorAssetSnapshot | null;
  clearHistory: (assetId: string) => void;
  clearAllHistory: () => void;
}

export const useEditorStore = create<EditorState>()(
  devtools(
    (set, get) => ({
      selectedAssetId: null,
      showOriginal: false,
      activeToolPanelId: DEFAULT_EDITOR_TOOL_PANEL_ID,
      mobilePanelExpanded: true,
      copiedAdjustments: null,
      customPresetName: "",
      customPresets: loadCustomPresets(),
      activeHslColor: "red",
      curveChannel: "rgb",
      openSections: loadOpenSections(),
      previewHistogram: null,
      pointColorPicking: false,
      pointColorPickTarget: "hsl",
      lastPointColorSample: null,
      autoPerspectiveRequestId: 0,
      autoPerspectiveMode: "auto",
      selectedLocalAdjustmentId: null,
      historyByAssetId: {},
      setSelectedAssetId: (selectedAssetId) => set({ selectedAssetId }),
      setShowOriginal: (showOriginal) => set({ showOriginal }),
      setActiveToolPanelId: (activeToolPanelId) => set({ activeToolPanelId }),
      setMobilePanelExpanded: (mobilePanelExpanded) => set({ mobilePanelExpanded }),
      setCopiedAdjustments: (copiedAdjustments) => set({ copiedAdjustments }),
      setCustomPresetName: (customPresetName) => set({ customPresetName }),
      setCustomPresets: (updater) =>
        set((state) => {
          const next = typeof updater === "function" ? updater(state.customPresets) : updater;
          saveCustomPresets(next);
          return { customPresets: next };
        }),
      setActiveHslColor: (activeHslColor) => set({ activeHslColor }),
      setCurveChannel: (curveChannel) => set({ curveChannel }),
      setPointColorPicking: (pointColorPicking) => set({ pointColorPicking }),
      setPointColorPickTarget: (pointColorPickTarget) => set({ pointColorPickTarget }),
      setLastPointColorSample: (lastPointColorSample) => set({ lastPointColorSample }),
      requestAutoPerspective: (autoPerspectiveMode) =>
        set((state) => ({
          autoPerspectiveMode,
          autoPerspectiveRequestId: state.autoPerspectiveRequestId + 1,
        })),
      setSelectedLocalAdjustmentId: (selectedLocalAdjustmentId) =>
        set({ selectedLocalAdjustmentId }),
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
          const shouldAppend = !lastEntry || !isEditorAssetSnapshotEqual(lastEntry, nextEntry);
          // If snapshot is duplicate AND there's no future to clear, skip entirely
          if (!shouldAppend && currentHistory.future.length === 0) {
            return state;
          }
          // Always clear future on new push; only append if snapshot is unique
          const nextPast = shouldAppend ? [...currentHistory.past, nextEntry] : currentHistory.past;
          const trimmedPast =
            nextPast.length > MAX_HISTORY_PER_ASSET
              ? nextPast.slice(nextPast.length - MAX_HISTORY_PER_ASSET)
              : nextPast;

          let nextHistoryByAssetId = {
            ...state.historyByAssetId,
            [assetId]: {
              past: trimmedPast,
              future: [],
            },
          };

          // LRU eviction: if we track too many assets, drop the one with the
          // smallest history (least recently active).
          const trackedIds = Object.keys(nextHistoryByAssetId);
          if (trackedIds.length > MAX_HISTORY_ASSETS) {
            let evictId = trackedIds[0];
            let evictSize = Infinity;
            for (const id of trackedIds) {
              if (id === assetId) continue; // never evict the one we just pushed to
              const h = nextHistoryByAssetId[id];
              const size = (h?.past.length ?? 0) + (h?.future.length ?? 0);
              if (size < evictSize) {
                evictSize = size;
                evictId = id;
              }
            }
            if (evictId && evictId !== assetId) {
              nextHistoryByAssetId = { ...nextHistoryByAssetId };
              delete nextHistoryByAssetId[evictId];
            }
          }

          return { historyByAssetId: nextHistoryByAssetId };
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
                future: [cloneEditorAssetSnapshot(current), ...currentHistory.future],
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
          let nextPast = [...currentHistory.past, cloneEditorAssetSnapshot(current)];
          if (nextPast.length > MAX_HISTORY_PER_ASSET) {
            nextPast = nextPast.slice(nextPast.length - MAX_HISTORY_PER_ASSET);
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
    }),
    { name: "EditorStore", enabled: process.env.NODE_ENV === "development" }
  )
);

// React to asset store events — keeps stores decoupled (no circular imports).
on("assets:deleted", (deletedIds) => {
  for (const id of deletedIds) {
    useEditorStore.getState().clearHistory(id);
  }
});

on("project:reset", () => {
  useEditorStore.getState().clearAllHistory();
});
