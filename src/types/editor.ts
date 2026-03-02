export type EditorSurfacePanel = "preset" | "edit" | "crop" | "mask" | "remove" | "export" | "ai";
export type EditorLayerBlendMode = "normal" | "multiply" | "screen" | "overlay" | "softLight";
export type EditorLayerType = "base" | "adjustment" | "duplicate" | "texture";
export type EditorLayerMaskMode = "brush" | "radial" | "linear" | "luminosity";

export interface EditorUiState {
  activePanel: EditorSurfacePanel;
  mobilePanelExpanded: boolean;
  showOriginal: boolean;
  pointColorPicking: boolean;
}

export interface LuminosityMaskData {
  thresholdMin: number; // [0, 1]
  thresholdMax: number; // [0, 1]
  feather: number; // [0, 1]
}

export interface EditorLayerMask {
  mode: EditorLayerMaskMode;
  inverted: boolean;
  data?: unknown;
}

export interface EditorLayerDefinition {
  id: string;
  type: EditorLayerType;
  name: string;
  visible: boolean;
  opacity: number; // [0, 100]
  blendMode: EditorLayerBlendMode;
  adjustments?: Record<string, unknown>;
  textureAssetId?: string;
  mask?: EditorLayerMask;
}
