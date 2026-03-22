import { describe, expect, it } from "vitest";
import {
  applyCanvasTextFontSizeTier,
  fitCanvasTextElementToContent,
  getClosestCanvasTextFontSizeTier,
  getCanvasTextColorOption,
  measureCanvasTextEditorSize,
  measureCanvasTextContentSize,
  normalizeCanvasTextElement,
} from "./textStyle";

const createTextElement = (
  overrides: Partial<Parameters<typeof normalizeCanvasTextElement>[0]> = {}
) => {
  const x = overrides.x ?? 0;
  const y = overrides.y ?? 0;
  const width = overrides.width ?? 240;
  const height = overrides.height ?? 96;
  const rotation = overrides.rotation ?? 0;

  return {
    id: overrides.id ?? "text-1",
    type: "text" as const,
    parentId: overrides.parentId ?? null,
    content: overrides.content ?? "Hello",
    fontFamily: overrides.fontFamily ?? "Georgia",
    fontSize: overrides.fontSize ?? 50,
    fontSizeTier: overrides.fontSizeTier,
    color: overrides.color ?? "#ffffff",
    textAlign: overrides.textAlign ?? "left",
    x,
    y,
    width,
    height,
    rotation,
    transform: overrides.transform ?? {
      x,
      y,
      width,
      height,
      rotation,
    },
    opacity: overrides.opacity ?? 1,
    locked: overrides.locked ?? false,
    visible: overrides.visible ?? true,
  };
};

describe("canvas text style helpers", () => {
  it("normalizes missing tiers from the closest base font size", () => {
    const normalized = normalizeCanvasTextElement(createTextElement());

    expect(normalized.fontSizeTier).toBe("large");
    expect(getClosestCanvasTextFontSizeTier(50)).toBe("large");
  });

  it("preserves text scale when switching tiers", () => {
    const next = applyCanvasTextFontSizeTier(
      normalizeCanvasTextElement(
        createTextElement({
          fontSize: 54,
          fontSizeTier: "medium",
        })
      ),
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
      normalizeCanvasTextElement(
        createTextElement({
          content: "abc",
          fontSize: 18,
          fontSizeTier: "small",
          width: 320,
          height: 120,
        })
      ),
      {
        measureText: (line) => line.length * 9,
      }
    );

    expect(fitted.width).toBe(29);
    expect(fitted.height).toBe(22);
  });

  it("keeps the editor wide enough to show the placeholder for empty text", () => {
    const contentSize = measureCanvasTextContentSize(
      {
        content: "",
        fontFamily: "Georgia",
        fontSize: 18,
      },
      {
        measureText: (line) => line.length * 9,
      }
    );
    const editorSize = measureCanvasTextEditorSize(
      {
        content: "",
        fontFamily: "Georgia",
        fontSize: 18,
      },
      {
        measureText: (line) => line.length * 9,
      }
    );

    expect(contentSize.width).toBe(11);
    expect(editorSize.width).toBe(74);
    expect(editorSize.height).toBe(contentSize.height);
  });
});
