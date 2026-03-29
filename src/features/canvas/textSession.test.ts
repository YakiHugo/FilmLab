import { describe, expect, it } from "vitest";
import {
  resolveTextCancelKind,
  resolveTextCommitKind,
  shouldMaterializeCreatedText,
  shouldSelectMaterializedCreatedText,
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

  it("keeps empty unmaterialized create-mode text as a noop", () => {
    expect(
      resolveTextCommitKind({
        hasCreatedElement: false,
        mode: "create",
        value: "   ",
      })
    ).toBe("noop");
  });

  it("deletes a materialized create-mode text when the content ends empty", () => {
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

  it("re-selects a materialized create-mode text only on the owning workbench", () => {
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
  });
});
