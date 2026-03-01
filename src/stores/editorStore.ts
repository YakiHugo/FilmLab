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
import type { EditingAdjustments, HslColorKey, Preset, EditorLayerBlendMode } from "@/types";

type PresetUpdater = Preset[] | ((current: Preset[]) => Preset[]);
const OPEN_SECTIONS_STORAGE_KEY = "filmlab.editor.openSections";
const LAYER_STATE_STORAGE_KEY = "filmlab.editor.layerState.v1";

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

interface StoredLayerState {
  layerOrder: string[];
  layerVisibilityByAssetId: Record<string, boolean>;
  layerOpacityByAssetId: Record<string, number>;
  layerBlendModeByAssetId: Record<string, EditorLayerBlendMode>;
}

const isEditorLayerBlendMode = (value: unknown): value is EditorLayerBlendMode =>
  value === "normal" ||
  value === "multiply" ||
  value === "screen" ||
  value === "overlay" ||
  value === "softLight";

const loadLayerState = (): StoredLayerState => {
  const fallback: StoredLayerState = {
    layerOrder: [],
    layerVisibilityByAssetId: {},
    layerOpacityByAssetId: {},
    layerBlendModeByAssetId: {},
  };
  if (typeof window === "undefined") {
    return fallback;
  }
  const raw = window.localStorage.getItem(LAYER_STATE_STORAGE_KEY);
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredLayerState> | null;
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }
    const order = Array.isArray(parsed.layerOrder)
      ? parsed.layerOrder
          .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
          .map((id) => id.trim())
      : [];
    const visibility = Object.fromEntries(
      Object.entries(parsed.layerVisibilityByAssetId ?? {}).filter(
        (entry): entry is [string, boolean] =>
          typeof entry[0] === "string" && typeof entry[1] === "boolean"
      )
    );
    const opacity = Object.fromEntries(
      Object.entries(parsed.layerOpacityByAssetId ?? {})
        .filter((entry): entry is [string, number] => typeof entry[0] === "string")
        .map(([key, value]) => [
          key,
          typeof value === "number" ? Math.max(0, Math.min(100, Math.round(value))) : 100,
        ])
    );
    const blendMode = Object.fromEntries(
      Object.entries(parsed.layerBlendModeByAssetId ?? {}).filter(
        (entry): entry is [string, EditorLayerBlendMode] =>
          typeof entry[0] === "string" && isEditorLayerBlendMode(entry[1])
      )
    );
    return {
      layerOrder: Array.from(new Set(order)),
      layerVisibilityByAssetId: visibility,
      layerOpacityByAssetId: opacity,
      layerBlendModeByAssetId: blendMode,
    };
  } catch {
    return fallback;
  }
};

const SAVE_LAYER_STATE_DEBOUNCE_MS = 300;
let _saveLayerStateTimer: ReturnType<typeof setTimeout> | null = null;

const saveLayerState = (state: StoredLayerState) => {
  if (typeof window === "undefined") {
    return;
  }
  if (_saveLayerStateTimer) {
    clearTimeout(_saveLayerStateTimer);
  }
  _saveLayerStateTimer = setTimeout(() => {
    _saveLayerStateTimer = null;
    window.localStorage.setItem(LAYER_STATE_STORAGE_KEY, JSON.stringify(state));
  }, SAVE_LAYER_STATE_DEBOUNCE_MS);
};

const clearLayerState = () => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(LAYER_STATE_STORAGE_KEY);
  }
  if (_saveLayerStateTimer) {
    clearTimeout(_saveLayerStateTimer);
    _saveLayerStateTimer = null;
  }
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
  layerOrder: string[];
  layerVisibilityByAssetId: Record<string, boolean>;
  layerOpacityByAssetId: Record<string, number>;
  layerBlendModeByAssetId: Record<string, EditorLayerBlendMode>;
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
  syncLayerState: (assetIds: string[]) => void;
  setLayerOrder: (assetIds: string[]) => void;
  moveLayer: (assetId: string, direction: "up" | "down") => void;
  setLayerVisibility: (assetId: string, visible: boolean) => void;
  setLayerOpacity: (assetId: string, opacity: number) => void;
  setLayerBlendMode: (assetId: string, blendMode: EditorLayerBlendMode) => void;
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
      ...loadLayerState(),
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
      syncLayerState: (assetIds) =>
        set((state) => {
          const normalizedIds = Array.from(
            new Set(assetIds.map((id) => id.trim()).filter((id) => id.length > 0))
          );

          const retainedOrder = state.layerOrder.filter((id) => normalizedIds.includes(id));
          const missingOrder = normalizedIds.filter((id) => !retainedOrder.includes(id));
          const nextOrder = [...retainedOrder, ...missingOrder];

          const nextVisibilityByAssetId: Record<string, boolean> = {};
          const nextOpacityByAssetId: Record<string, number> = {};
          const nextBlendModeByAssetId: Record<string, EditorLayerBlendMode> = {};
          for (const id of nextOrder) {
            nextVisibilityByAssetId[id] = state.layerVisibilityByAssetId[id] ?? true;
            nextOpacityByAssetId[id] = state.layerOpacityByAssetId[id] ?? 100;
            nextBlendModeByAssetId[id] = state.layerBlendModeByAssetId[id] ?? "normal";
          }

          const orderChanged =
            state.layerOrder.length !== nextOrder.length ||
            state.layerOrder.some((id, index) => id !== nextOrder[index]);
          const visibilityChanged =
            JSON.stringify(state.layerVisibilityByAssetId) !==
            JSON.stringify(nextVisibilityByAssetId);
          const opacityChanged =
            JSON.stringify(state.layerOpacityByAssetId) !== JSON.stringify(nextOpacityByAssetId);
          const blendModeChanged =
            JSON.stringify(state.layerBlendModeByAssetId) !==
            JSON.stringify(nextBlendModeByAssetId);

          if (!orderChanged && !visibilityChanged && !opacityChanged && !blendModeChanged) {
            return state;
          }

          saveLayerState({
            layerOrder: nextOrder,
            layerVisibilityByAssetId: nextVisibilityByAssetId,
            layerOpacityByAssetId: nextOpacityByAssetId,
            layerBlendModeByAssetId: nextBlendModeByAssetId,
          });

          return {
            layerOrder: nextOrder,
            layerVisibilityByAssetId: nextVisibilityByAssetId,
            layerOpacityByAssetId: nextOpacityByAssetId,
            layerBlendModeByAssetId: nextBlendModeByAssetId,
          };
        }),
      setLayerOrder: (assetIds) =>
        set((state) => {
          if (state.layerOrder.length === 0) {
            return state;
          }
          const known = new Set(state.layerOrder);
          const nextSeed = Array.from(
            new Set(assetIds.map((id) => id.trim()).filter((id) => id.length > 0))
          ).filter((id) => known.has(id));
          const missing = state.layerOrder.filter((id) => !nextSeed.includes(id));
          const nextOrder = [...nextSeed, ...missing];
          if (
            nextOrder.length === state.layerOrder.length &&
            nextOrder.every((id, index) => id === state.layerOrder[index])
          ) {
            return state;
          }
          saveLayerState({
            layerOrder: nextOrder,
            layerVisibilityByAssetId: state.layerVisibilityByAssetId,
            layerOpacityByAssetId: state.layerOpacityByAssetId,
            layerBlendModeByAssetId: state.layerBlendModeByAssetId,
          });
          return {
            layerOrder: nextOrder,
          };
        }),
      moveLayer: (assetId, direction) =>
        set((state) => {
          const index = state.layerOrder.indexOf(assetId);
          if (index < 0) {
            return state;
          }
          const targetIndex = direction === "up" ? index - 1 : index + 1;
          if (targetIndex < 0 || targetIndex >= state.layerOrder.length) {
            return state;
          }
          const nextOrder = [...state.layerOrder];
          const temp = nextOrder[targetIndex];
          nextOrder[targetIndex] = nextOrder[index]!;
          nextOrder[index] = temp!;
          saveLayerState({
            layerOrder: nextOrder,
            layerVisibilityByAssetId: state.layerVisibilityByAssetId,
            layerOpacityByAssetId: state.layerOpacityByAssetId,
            layerBlendModeByAssetId: state.layerBlendModeByAssetId,
          });
          return {
            layerOrder: nextOrder,
          };
        }),
      setLayerVisibility: (assetId, visible) =>
        set((state) => {
          const current = state.layerVisibilityByAssetId[assetId];
          if (current === visible) {
            return state;
          }
          const nextVisibilityByAssetId = {
            ...state.layerVisibilityByAssetId,
            [assetId]: visible,
          };
          saveLayerState({
            layerOrder: state.layerOrder,
            layerVisibilityByAssetId: nextVisibilityByAssetId,
            layerOpacityByAssetId: state.layerOpacityByAssetId,
            layerBlendModeByAssetId: state.layerBlendModeByAssetId,
          });
          return {
            layerVisibilityByAssetId: nextVisibilityByAssetId,
          };
        }),
      setLayerOpacity: (assetId, opacity) =>
        set((state) => {
          const nextOpacity = Math.max(0, Math.min(100, Math.round(opacity)));
          const current = state.layerOpacityByAssetId[assetId];
          if (current === nextOpacity) {
            return state;
          }
          const nextOpacityByAssetId = {
            ...state.layerOpacityByAssetId,
            [assetId]: nextOpacity,
          };
          saveLayerState({
            layerOrder: state.layerOrder,
            layerVisibilityByAssetId: state.layerVisibilityByAssetId,
            layerOpacityByAssetId: nextOpacityByAssetId,
            layerBlendModeByAssetId: state.layerBlendModeByAssetId,
          });
          return {
            layerOpacityByAssetId: nextOpacityByAssetId,
          };
        }),
      setLayerBlendMode: (assetId, blendMode) =>
        set((state) => {
          if (state.layerBlendModeByAssetId[assetId] === blendMode) {
            return state;
          }
          const nextBlendModeByAssetId = {
            ...state.layerBlendModeByAssetId,
            [assetId]: blendMode,
          };
          saveLayerState({
            layerOrder: state.layerOrder,
            layerVisibilityByAssetId: state.layerVisibilityByAssetId,
            layerOpacityByAssetId: state.layerOpacityByAssetId,
            layerBlendModeByAssetId: nextBlendModeByAssetId,
          });
          return {
            layerBlendModeByAssetId: nextBlendModeByAssetId,
          };
        }),
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
  clearLayerState();
  useEditorStore.setState({
    layerOrder: [],
    layerVisibilityByAssetId: {},
    layerOpacityByAssetId: {},
    layerBlendModeByAssetId: {},
  });
  useEditorStore.getState().clearAllHistory();
});
