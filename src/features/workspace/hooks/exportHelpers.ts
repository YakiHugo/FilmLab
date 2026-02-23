import type { WorkspaceStep } from "../types";

const WORKSPACE_CONTEXT_KEY = "filmlab.workspace.context";

export interface PersistedWorkspaceContext {
  step: WorkspaceStep;
  selectedAssetIds: string[];
  activeAssetId: string | null;
  selectedPresetId: string;
  intensity: number;
}

export interface ExportFeedback {
  kind: "success" | "mixed" | "error";
  title: string;
  detail: string;
}

interface FileWritableLike {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
}

interface FileHandleLike {
  createWritable: () => Promise<FileWritableLike>;
}

export interface DirectoryHandleLike {
  getFileHandle: (name: string, options: { create: boolean }) => Promise<FileHandleLike>;
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: "downloads" | "documents" | "desktop" | "pictures";
  }) => Promise<DirectoryHandleLike>;
};

const EXPORT_DIRECTORY_PICKER_ID = "filmlab-export-directory";

export const clampIntensity = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export const loadWorkspaceContext = (): PersistedWorkspaceContext | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(WORKSPACE_CONTEXT_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PersistedWorkspaceContext>;
    const step = parsed.step;
    if (step !== "library" && step !== "style" && step !== "export") {
      return null;
    }
    return {
      step,
      selectedAssetIds: Array.isArray(parsed.selectedAssetIds)
        ? parsed.selectedAssetIds.filter((id): id is string => typeof id === "string")
        : [],
      activeAssetId: typeof parsed.activeAssetId === "string" ? parsed.activeAssetId : null,
      selectedPresetId: typeof parsed.selectedPresetId === "string" ? parsed.selectedPresetId : "",
      intensity: typeof parsed.intensity === "number" ? clampIntensity(parsed.intensity) : 60,
    };
  } catch {
    return null;
  }
};

let _persistContextTimer: ReturnType<typeof setTimeout> | null = null;

export const persistWorkspaceContext = (context: PersistedWorkspaceContext) => {
  if (typeof window === "undefined") {
    return;
  }
  if (_persistContextTimer) {
    clearTimeout(_persistContextTimer);
  }
  _persistContextTimer = setTimeout(() => {
    _persistContextTimer = null;
    try {
      window.localStorage.setItem(WORKSPACE_CONTEXT_KEY, JSON.stringify(context));
    } catch {
      // no-op
    }
  }, 300);
};

export const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

export const supportsDirectoryExport = () => {
  if (typeof window === "undefined") {
    return false;
  }
  const pickerWindow = window as DirectoryPickerWindow;
  return typeof pickerWindow.showDirectoryPicker === "function";
};

export const sanitizeFileName = (name: string) => {
  const sanitized = name
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  return sanitized.length > 0 ? sanitized : "exported-image.jpg";
};

export const toUniqueFileName = (name: string, usedNames: Set<string>) => {
  const safeName = sanitizeFileName(name);
  const dotIndex = safeName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName;
  const extension = dotIndex > 0 ? safeName.slice(dotIndex) : "";
  let candidate = safeName;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${baseName} (${suffix})${extension}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
};

export const openExportDirectory = async (): Promise<DirectoryHandleLike | null> => {
  if (!supportsDirectoryExport()) {
    return null;
  }
  const pickerWindow = window as DirectoryPickerWindow;
  if (!pickerWindow.showDirectoryPicker) {
    return null;
  }
  try {
    return await pickerWindow.showDirectoryPicker({
      id: EXPORT_DIRECTORY_PICKER_ID,
      mode: "readwrite",
      startIn: "downloads",
    });
  } catch (error) {
    if (isAbortError(error)) {
      return null;
    }
    throw error;
  }
};

export const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

export const writeBlobToDirectory = async (
  directoryHandle: DirectoryHandleLike,
  fileName: string,
  blob: Blob
) => {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
};
