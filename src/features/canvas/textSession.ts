export type EditingTextMode = "existing" | "create";

export type TextCommitKind = "upsert" | "delete" | "noop";

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

export const shouldRenderEditingTextOnActiveWorkbench = ({
  activeTextElementIsEditable,
  activeTextElementType,
  activeWorkbenchId,
  editingTextId,
  sessionWorkbenchId,
}: {
  activeTextElementIsEditable: boolean;
  activeTextElementType: string | null | undefined;
  activeWorkbenchId: string | null;
  editingTextId: string | null;
  sessionWorkbenchId: string | null;
}) =>
  (!editingTextId || sessionWorkbenchId === activeWorkbenchId) &&
  activeTextElementIsEditable &&
  activeTextElementType === "text";

export const shouldPersistTextSessionOnWorkbenchSwitch = ({
  activeWorkbenchId,
  sessionWorkbenchId,
}: {
  activeWorkbenchId: string | null;
  sessionWorkbenchId: string | null;
}) => sessionWorkbenchId !== null && sessionWorkbenchId !== activeWorkbenchId;
