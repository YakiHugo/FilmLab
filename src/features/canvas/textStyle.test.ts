import { describe, expect, it } from "vitest";
import {
  applyCanvasTextFontSizeTier,
  getClosestCanvasTextFontSizeTier,
  getCanvasTextColorOption,
  normalizeCanvasTextElement,
} from "./textStyle";

describe("canvas text style helpers", () => {
  it("normalizes missing tiers from the closest base font size", () => {
    const normalized = normalizeCanvasTextElement({
      id: "text-1",
      type: "text",
      content: "Hello",
      fontFamily: "Georgia",
      fontSize: 50,
      color: "#ffffff",
      textAlign: "left",
      x: 0,
      y: 0,
      width: 240,
      height: 96,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      zIndex: 1,
    });

    expect(normalized.fontSizeTier).toBe("large");
    expect(getClosestCanvasTextFontSizeTier(50)).toBe("large");
  });

  it("preserves text scale when switching tiers", () => {
    const next = applyCanvasTextFontSizeTier(
      normalizeCanvasTextElement({
        id: "text-1",
        type: "text",
        content: "Hello",
        fontFamily: "Georgia",
        fontSize: 54,
        fontSizeTier: "medium",
        color: "#ffffff",
        textAlign: "left",
        x: 0,
        y: 0,
        width: 240,
        height: 96,
        rotation: 0,
        opacity: 1,
        locked: false,
        visible: true,
        zIndex: 1,
      }),
      "xl"
    );

    expect(next.fontSizeTier).toBe("xl");
    expect(next.fontSize).toBeCloseTo(96, 3);
  });

  it("keeps the fixed color order and labels", () => {
    expect(getCanvasTextColorOption("#f4d29c").label).toBe("Orange");
    expect(getCanvasTextColorOption("#000000").label).toBe("Black");
  });
});
