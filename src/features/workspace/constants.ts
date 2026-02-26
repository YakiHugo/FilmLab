import { Download, Sparkles, Upload } from "lucide-react";
import type { PresetAdjustmentKey } from "@/types";
import {
  isSupportedImportFile as isSupportedProjectImportFile,
  MAX_IMPORT_BATCH_SIZE as PROJECT_MAX_IMPORT_BATCH_SIZE,
  MAX_IMPORT_FILE_SIZE as PROJECT_MAX_IMPORT_FILE_SIZE,
} from "@/stores/project/constants";
import type { WorkspaceStepItem } from "./types";

export const CUSTOM_PRESETS_KEY = "filmlab.customPresets";

export const WORKSPACE_STEPS: WorkspaceStepItem[] = [
  {
    id: "library",
    label: "绱犳潗",
    description: "瀵煎叆涓庨€夋嫨",
    icon: Upload,
  },
  {
    id: "style",
    label: "椋庢牸",
    description: "涓€閿粺涓€",
    icon: Sparkles,
  },
  {
    id: "export",
    label: "瀵煎嚭",
    description: "浜や粯杈撳嚭",
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

export const isSupportedImportFile = isSupportedProjectImportFile;

/** 50 MB per file */
export const MAX_IMPORT_FILE_SIZE = PROJECT_MAX_IMPORT_FILE_SIZE;

/** Max files per single import batch */
export const MAX_IMPORT_BATCH_SIZE = PROJECT_MAX_IMPORT_BATCH_SIZE;

