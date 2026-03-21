import { describe, expect, it } from "vitest";
import {
  resolveTextCommitKind,
  shouldMaterializeCreatedText,
  shouldPersistTextSessionOnWorkbenchSwitch,
  shouldRenderEditingTextOnActiveWorkbench,
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
