import { describe, expect, it } from "vitest";
import {
  resolveTextCancelKind,
  resolveTextCommitKind,
  shouldMaterializeCreatedText,
  shouldPersistTextSessionOnWorkbenchSwitch,
  shouldRenderEditingTextOnActiveWorkbench,
  shouldSelectMaterializedCreatedText,
  shouldShowTextToolbar,
} from "./textSession";

describe("text session helpers", () => {
  it("commits existing text with non-empty content as an upsert", () => {
    expect(
      resolveTextCommitKind({
        hasCreatedElement: true,
        mode: "existing",
        value: "Hello world",
      })
    ).toBe("upsert");
  });

  it("does not delete an unmaterialized created text when the content stays empty", () => {
    expect(
      resolveTextCommitKind({
        hasCreatedElement: false,
        mode: "create",
        value: "   ",
      })
    ).toBe("noop");
  });

  it("deletes a materialized created text when the content ends empty", () => {
    expect(
      resolveTextCommitKind({
        hasCreatedElement: true,
        mode: "create",
        value: "   ",
      })
    ).toBe("delete");
  });

  it("keeps cancel behavior as a pure reset until create-mode has materialized a node", () => {
    expect(
      resolveTextCancelKind({
        hasCreatedElement: false,
        mode: "create",
      })
    ).toBe("reset");

    expect(
      resolveTextCancelKind({
        hasCreatedElement: true,
        mode: "create",
      })
    ).toBe("rollback-delete");

    expect(
      resolveTextCancelKind({
        hasCreatedElement: true,
        mode: "existing",
      })
    ).toBe("reset");
  });

  it("materializes created text only after the first non-empty input on the active workbench", () => {
    expect(
      shouldMaterializeCreatedText({
        activeWorkbenchId: "workbench-1",
        hasCreatedElement: false,
        mode: "create",
        nextValue: "Hello",
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe(true);

    expect(
      shouldMaterializeCreatedText({
        activeWorkbenchId: "workbench-1",
        hasCreatedElement: true,
        mode: "create",
        nextValue: "Hello again",
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe(false);

    expect(
      shouldMaterializeCreatedText({
        activeWorkbenchId: "workbench-1",
        hasCreatedElement: false,
        mode: "create",
        nextValue: "Hello",
        sessionWorkbenchId: "workbench-2",
      })
    ).toBe(false);
  });

  it("shows the text toolbar whenever a text render element has an overlay anchor", () => {
    expect(
      shouldShowTextToolbar({
        hasEditingTextRenderElement: true,
        hasSelectionOverlay: true,
      })
    ).toBe(true);

    expect(
      shouldShowTextToolbar({
        hasEditingTextRenderElement: true,
        hasSelectionOverlay: false,
      })
    ).toBe(false);

    expect(
      shouldShowTextToolbar({
        hasEditingTextRenderElement: false,
        hasSelectionOverlay: true,
      })
    ).toBe(false);
  });

  it("re-selects a created text node only after it materializes on the active workbench", () => {
    expect(
      shouldSelectMaterializedCreatedText({
        activeWorkbenchId: "workbench-1",
        editingTextId: "text-1",
        hasEditingTextElement: true,
        isEditingTextSelected: false,
        mode: "create",
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe(true);

    expect(
      shouldSelectMaterializedCreatedText({
        activeWorkbenchId: "workbench-1",
        editingTextId: "text-1",
        hasEditingTextElement: false,
        isEditingTextSelected: false,
        mode: "create",
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe(false);

    expect(
      shouldSelectMaterializedCreatedText({
        activeWorkbenchId: "workbench-1",
        editingTextId: "text-1",
        hasEditingTextElement: true,
        isEditingTextSelected: true,
        mode: "create",
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe(false);

    expect(
      shouldSelectMaterializedCreatedText({
        activeWorkbenchId: "workbench-1",
        editingTextId: "text-1",
        hasEditingTextElement: true,
        isEditingTextSelected: false,
        mode: "existing",
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe(false);
  });

  it("persists a text session only when its source workbench no longer matches the active workbench", () => {
    expect(
      shouldPersistTextSessionOnWorkbenchSwitch({
        activeWorkbenchId: "workbench-2",
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe(true);

    expect(
      shouldPersistTextSessionOnWorkbenchSwitch({
        activeWorkbenchId: "workbench-1",
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe(false);
  });

  it("keeps commit, cancel, and workbench-switch decisions on separate branches", () => {
    expect(
      resolveTextCommitKind({
        hasCreatedElement: false,
        mode: "create",
        value: "Hello",
      })
    ).toBe("upsert");
    expect(
      resolveTextCancelKind({
        hasCreatedElement: false,
        mode: "create",
      })
    ).toBe("reset");
    expect(
      shouldPersistTextSessionOnWorkbenchSwitch({
        activeWorkbenchId: "workbench-1",
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe(false);

    expect(
      resolveTextCommitKind({
        hasCreatedElement: true,
        mode: "create",
        value: "   ",
      })
    ).toBe("delete");
    expect(
      resolveTextCancelKind({
        hasCreatedElement: true,
        mode: "create",
      })
    ).toBe("rollback-delete");
    expect(
      shouldPersistTextSessionOnWorkbenchSwitch({
        activeWorkbenchId: "workbench-2",
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe(true);
  });

  it("renders the editing text only when the active workbench still owns the editable text node", () => {
    expect(
      shouldRenderEditingTextOnActiveWorkbench({
        activeTextElementIsEditable: true,
        activeTextElementType: "text",
        activeWorkbenchId: "workbench-1",
        editingTextId: "text-1",
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe(true);

    expect(
      shouldRenderEditingTextOnActiveWorkbench({
        activeTextElementIsEditable: true,
        activeTextElementType: "text",
        activeWorkbenchId: "workbench-2",
        editingTextId: "text-1",
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe(false);

    expect(
      shouldRenderEditingTextOnActiveWorkbench({
        activeTextElementIsEditable: false,
        activeTextElementType: "text",
        activeWorkbenchId: "workbench-1",
        editingTextId: "text-1",
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe(false);
  });
});
