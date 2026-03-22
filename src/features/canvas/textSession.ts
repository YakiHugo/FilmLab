export type EditingTextMode = "existing" | "create";

export type TextCommitKind = "upsert" | "delete" | "noop";
export type TextCancelKind = "reset" | "rollback-delete";
export type TextSessionWorkbenchTransition = "noop" | "persist-source" | "reset" | "wait";

export const resolveTextCommitKind = ({
  hasCreatedElement,
  mode,
  value,
}: {
  hasCreatedElement: boolean;
  mode: EditingTextMode | null;
  value: string;
}): TextCommitKind => {
  if (value.trim().length > 0) {
    return "upsert";
  }

  if (mode === "create" && hasCreatedElement) {
    return "delete";
  }

  return "noop";
};

export const resolveTextCancelKind = ({
  hasCreatedElement,
  mode,
}: {
  hasCreatedElement: boolean;
  mode: EditingTextMode | null;
}): TextCancelKind =>
  mode === "create" && hasCreatedElement ? "rollback-delete" : "reset";

export const shouldMaterializeCreatedText = ({
  activeWorkbenchId,
  hasCreatedElement,
  mode,
  nextValue,
  sessionWorkbenchId,
}: {
  activeWorkbenchId: string | null;
  hasCreatedElement: boolean;
  mode: EditingTextMode | null;
  nextValue: string;
  sessionWorkbenchId: string | null;
}) =>
  mode === "create" &&
  !hasCreatedElement &&
  nextValue.trim().length > 0 &&
  activeWorkbenchId !== null &&
  sessionWorkbenchId === activeWorkbenchId;

export const shouldSelectMaterializedCreatedText = ({
  activeWorkbenchId,
  editingTextId,
  hasEditingTextElement,
  isEditingTextSelected,
  mode,
  sessionWorkbenchId,
}: {
  activeWorkbenchId: string | null;
  editingTextId: string | null;
  hasEditingTextElement: boolean;
  isEditingTextSelected: boolean;
  mode: EditingTextMode | null;
  sessionWorkbenchId: string | null;
}) =>
  mode === "create" &&
  editingTextId !== null &&
  hasEditingTextElement &&
  !isEditingTextSelected &&
  activeWorkbenchId !== null &&
  sessionWorkbenchId === activeWorkbenchId;

export const resolveTextSessionWorkbenchTransition = ({
  activeWorkbenchId,
  hasActiveWorkbench,
  hasSessionWorkbench,
  sessionWorkbenchId,
}: {
  activeWorkbenchId: string | null;
  hasActiveWorkbench: boolean;
  hasSessionWorkbench: boolean;
  sessionWorkbenchId: string | null;
}): TextSessionWorkbenchTransition => {
  if (!sessionWorkbenchId || !hasSessionWorkbench) {
    return "reset";
  }

  if (!activeWorkbenchId || !hasActiveWorkbench) {
    return "wait";
  }

  if (sessionWorkbenchId === activeWorkbenchId) {
    return "noop";
  }

  return "persist-source";
};
