import { describe, expect, it } from "vitest";
import { DEFAULT_EDITOR_RETURN_STEP, isWorkspaceStep, resolveEditorReturnStep } from "./navigation";

describe("isWorkspaceStep", () => {
  it("returns true for supported steps", () => {
    expect(isWorkspaceStep("library")).toBe(true);
    expect(isWorkspaceStep("style")).toBe(true);
    expect(isWorkspaceStep("export")).toBe(true);
  });

  it("returns false for unsupported values", () => {
    expect(isWorkspaceStep("")).toBe(false);
    expect(isWorkspaceStep("abc")).toBe(false);
    expect(isWorkspaceStep(undefined)).toBe(false);
  });
});

describe("resolveEditorReturnStep", () => {
  it("returns valid returnStep directly", () => {
    expect(resolveEditorReturnStep("style")).toBe("style");
    expect(resolveEditorReturnStep("library")).toBe("library");
    expect(resolveEditorReturnStep("export")).toBe("export");
  });

  it("falls back to default for invalid values", () => {
    expect(resolveEditorReturnStep("abc")).toBe(DEFAULT_EDITOR_RETURN_STEP);
    expect(resolveEditorReturnStep(undefined)).toBe(DEFAULT_EDITOR_RETURN_STEP);
    expect(resolveEditorReturnStep(123)).toBe(DEFAULT_EDITOR_RETURN_STEP);
  });
});
