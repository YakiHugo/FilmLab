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

export interface LayerBrushMaskPoint {
  x: number; // normalized [0, 1]
  y: number; // normalized [0, 1]
  pressure?: number; // normalized (0, 1]
}

export interface LayerBrushMaskData {
  mode: "brush";
  points: LayerBrushMaskPoint[];
  brushSize: number; // normalized [0.005, 0.25]
  feather: number; // [0, 1]
  flow: number; // [0, 1]
}

export interface LayerRadialMaskData {
  mode: "radial";
  centerX: number; // normalized [0, 1]
  centerY: number; // normalized [0, 1]
  radiusX: number; // normalized [0, 1]
  radiusY: number; // normalized [0, 1]
  feather: number; // [0, 1]
}

export interface LayerLinearMaskData {
  mode: "linear";
  startX: number; // normalized [0, 1]
  startY: number; // normalized [0, 1]
  endX: number; // normalized [0, 1]
  endY: number; // normalized [0, 1]
  feather: number; // [0, 1]
}

export type EditorLayerMaskData =
  | LayerBrushMaskData
  | LayerRadialMaskData
  | LayerLinearMaskData
  | LuminosityMaskData;

export interface EditorLayerMask {
  mode: EditorLayerMaskMode;
  inverted: boolean;
  data?: EditorLayerMaskData;
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
