import { describe, expect, it, vi } from "vitest";

vi.mock("react-konva", () => ({
  Text: () => null,
}));

import { isCanvasTextElementEditable } from "./textElementEditability";

describe("TextElement", () => {
  it("treats inherited hidden or locked text as non-editable", () => {
    expect(
      isCanvasTextElementEditable({ effectiveLocked: false, effectiveVisible: true })
    ).toBe(true);
    expect(
      isCanvasTextElementEditable({ effectiveLocked: true, effectiveVisible: true })
    ).toBe(false);
    expect(
      isCanvasTextElementEditable({ effectiveLocked: false, effectiveVisible: false })
    ).toBe(false);
  });
});
