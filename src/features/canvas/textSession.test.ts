import { describe, expect, it } from "vitest";
import {
  resolveTextCancelKind,
  resolveTextCommitKind,
  resolveTextSessionWorkbenchTransition,
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

  it("keeps the text session when the active workbench still owns it", () => {
    expect(
      resolveTextSessionWorkbenchTransition({
        activeWorkbenchId: "workbench-1",
        hasActiveWorkbench: true,
        hasSessionWorkbench: true,
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe("noop");
  });

  it("persists to the source workbench after switching away while the source still exists", () => {
    expect(
      resolveTextSessionWorkbenchTransition({
        activeWorkbenchId: "workbench-2",
        hasActiveWorkbench: true,
        hasSessionWorkbench: true,
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe("persist-source");
  });

  it("waits for route recovery while the source workbench still exists", () => {
    expect(
      resolveTextSessionWorkbenchTransition({
        activeWorkbenchId: null,
        hasActiveWorkbench: false,
        hasSessionWorkbench: true,
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe("wait");
  });

  it("resets when the source workbench disappears after the active workbench changes", () => {
    expect(
      resolveTextSessionWorkbenchTransition({
        activeWorkbenchId: "workbench-2",
        hasActiveWorkbench: true,
        hasSessionWorkbench: false,
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe("reset");
  });

  it("resets when the source workbench disappears before route recovery finishes", () => {
    expect(
      resolveTextSessionWorkbenchTransition({
        activeWorkbenchId: null,
        hasActiveWorkbench: false,
        hasSessionWorkbench: false,
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe("reset");
  });

  it("resets when the session no longer has a source workbench id", () => {
    expect(
      resolveTextSessionWorkbenchTransition({
        activeWorkbenchId: "workbench-1",
        hasActiveWorkbench: true,
        hasSessionWorkbench: false,
        sessionWorkbenchId: null,
      })
    ).toBe("reset");
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
      resolveTextSessionWorkbenchTransition({
        activeWorkbenchId: "workbench-1",
        hasActiveWorkbench: true,
        hasSessionWorkbench: true,
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe("noop");

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
      resolveTextSessionWorkbenchTransition({
        activeWorkbenchId: "workbench-2",
        hasActiveWorkbench: true,
        hasSessionWorkbench: true,
        sessionWorkbenchId: "workbench-1",
      })
    ).toBe("persist-source");
  });
});
