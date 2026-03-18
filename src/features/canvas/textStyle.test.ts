import { describe, expect, it } from "vitest";
import {
  applyCanvasTextFontSizeTier,
  fitCanvasTextElementToContent,
  getClosestCanvasTextFontSizeTier,
  getCanvasTextColorOption,
  measureCanvasTextContentSize,
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

  it("sizes text from explicit line breaks instead of wrapping to a stored width", () => {
    const size = measureCanvasTextContentSize(
      {
        content: "wide line\nx",
        fontFamily: "Georgia",
        fontSize: 20,
      },
      {
        measureText: (line) => line.length * 10,
      }
    );

    expect(size.width).toBe(92);
    expect(size.height).toBe(48);
  });

  it("fits text elements back to their content width and height", () => {
    const fitted = fitCanvasTextElementToContent(
      {
        id: "text-1",
        type: "text",
        content: "abc",
        fontFamily: "Georgia",
        fontSize: 18,
        fontSizeTier: "small",
        color: "#ffffff",
        textAlign: "left",
        x: 0,
        y: 0,
        width: 320,
        height: 120,
        rotation: 0,
        opacity: 1,
        locked: false,
        visible: true,
        zIndex: 1,
      },
      {
        measureText: (line) => line.length * 9,
      }
    );

    expect(fitted.width).toBe(29);
    expect(fitted.height).toBe(22);
  });
});
