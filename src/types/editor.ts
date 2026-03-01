export type EditorSurfacePanel = "preset" | "edit" | "crop" | "mask" | "remove" | "export" | "ai";
export type EditorLayerBlendMode = "normal" | "multiply" | "screen" | "overlay" | "softLight";
export type EditorLayerType = "asset" | "adjustment";

export interface EditorUiState {
  activePanel: EditorSurfacePanel;
  mobilePanelExpanded: boolean;
  showOriginal: boolean;
  pointColorPicking: boolean;
}

export interface EditorLayerDefinition {
  id: string;
  type: EditorLayerType;
  name: string;
  visible: boolean;
  opacity: number; // [0, 100]
  blendMode: EditorLayerBlendMode;
  assetId?: string;
}
