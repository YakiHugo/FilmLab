import type { WorkspaceStep } from "./types";

export const DEFAULT_EDITOR_RETURN_STEP: WorkspaceStep = "style";

export const isWorkspaceStep = (value: unknown): value is WorkspaceStep =>
  value === "library" || value === "style" || value === "export";

export const resolveEditorReturnStep = (value: unknown): WorkspaceStep => {
  if (isWorkspaceStep(value)) {
    return value;
  }
  return DEFAULT_EDITOR_RETURN_STEP;
};
