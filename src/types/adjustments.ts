export interface GlowAdjustments {
  glowIntensity: number;
  glowMidtoneFocus: number;
  glowBias: number;
  glowRadius: number;
}

export type ExportFormat = "jpeg" | "png" | "webp" | "tiff";
export type ExportResolutionPreset = "original" | "half" | "quarter" | "custom";
export type ExportColorSpace = "srgb" | "display-p3" | "adobe-rgb";
export type ExportMetadataMode = "strip" | "preserve";

export interface ExportSettings {
  format: ExportFormat;
  quality: number;
  pngCompression: number;
  resolutionPreset: ExportResolutionPreset;
  customWidth?: number;
  customHeight?: number;
  colorSpace: ExportColorSpace;
  metadataMode: ExportMetadataMode;
}

