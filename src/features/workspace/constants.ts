import { Download, Sparkles, Upload } from "lucide-react";
import type { PresetAdjustmentKey } from "@/types";
import type { WorkspaceStepItem } from "./types";

export const CUSTOM_PRESETS_KEY = "filmlab.customPresets";

export const WORKSPACE_STEPS: WorkspaceStepItem[] = [
  {
    id: "library",
    label: "素材",
    description: "导入与选择",
    icon: Upload,
  },
  {
    id: "style",
    label: "风格",
    description: "一键统一",
    icon: Sparkles,
  },
  {
    id: "export",
    label: "导出",
    description: "交付输出",
    icon: Download,
  },
];

export const PRESET_ADJUSTMENT_KEYS: PresetAdjustmentKey[] = [
  "exposure",
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
  "temperature",
  "tint",
  "vibrance",
  "saturation",
  "clarity",
  "dehaze",
  "vignette",
  "grain",
];

const SUPPORTED_IMPORT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SUPPORTED_IMPORT_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

export const isSupportedImportFile = (file: File) => {
  if (SUPPORTED_IMPORT_TYPES.has(file.type)) {
    return true;
  }
  return SUPPORTED_IMPORT_EXTENSIONS.test(file.name);
};

/** 50 MB per file */
export const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024;

/** Max files per single import batch */
export const MAX_IMPORT_BATCH_SIZE = 200;
