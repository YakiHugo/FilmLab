import type { CanvasTextElement, CanvasTextFontSizeTier } from "@/types";

export interface CanvasTextColorOption {
  id: string;
  label: string;
  value: string;
}

export interface CanvasTextOption<TValue extends string> {
  label: string;
  value: TValue;
}

export interface CanvasTextContentSize {
  width: number;
  height: number;
}

export const CANVAS_TEXT_LINE_HEIGHT_MULTIPLIER = 1.2;
export const DEFAULT_CANVAS_TEXT_FONT_FAMILY = "Georgia";
export const DEFAULT_CANVAS_TEXT_FONT_SIZE_TIER: CanvasTextFontSizeTier = "medium";
export const CANVAS_TEXT_EDITOR_PLACEHOLDER = "Add Text";
export const CANVAS_TEXT_MENU_ITEM_HEIGHT = 38;
export const CANVAS_TEXT_MENU_PADDING = 8;
export const CANVAS_TEXT_MENU_WIDTHS = {
  color: 180,
  font: 160,
  size: 160,
} as const;

export const CANVAS_TEXT_FONT_OPTIONS: CanvasTextOption<string>[] = [
  { label: "Manrope", value: "Manrope" },
  { label: "Syne", value: "Syne" },
  { label: "Georgia", value: "Georgia" },
];

export const CANVAS_TEXT_SIZE_TIER_OPTIONS: CanvasTextOption<CanvasTextFontSizeTier>[] = [
  { label: "Small", value: "small" },
  { label: "Medium", value: "medium" },
  { label: "Large", value: "large" },
  { label: "XL", value: "xl" },
];

export const CANVAS_TEXT_TIER_BASE_FONT_SIZES: Record<CanvasTextFontSizeTier, number> = {
  small: 24,
  medium: 36,
  large: 48,
  xl: 64,
};

export const CANVAS_TEXT_COLOR_OPTIONS: CanvasTextColorOption[] = [
  { id: "white", label: "White", value: "#ffffff" },
  { id: "grey", label: "Grey", value: "#b3b3b3" },
  { id: "red", label: "Red", value: "#e8b4b2" },
  { id: "orange", label: "Orange", value: "#f4d29c" },
  { id: "yellow", label: "Yellow", value: "#f8e58e" },
  { id: "green", label: "Green", value: "#b7ddb0" },
  { id: "blue", label: "Blue", value: "#99d1ff" },
  { id: "purple", label: "Purple", value: "#cf9de8" },
  { id: "black", label: "Black", value: "#000000" },
];

export const DEFAULT_CANVAS_TEXT_COLOR = CANVAS_TEXT_COLOR_OPTIONS[0]!.value;
export const DEFAULT_CANVAS_TEXT_FONT_SIZE =
  CANVAS_TEXT_TIER_BASE_FONT_SIZES[DEFAULT_CANVAS_TEXT_FONT_SIZE_TIER];

const roundFontSize = (value: number) => Math.round(Math.max(8, value) * 1000) / 1000;
const TEXT_WIDTH_PADDING = 2;
const FALLBACK_TEXT_WIDTH_RATIO = 0.6;

let canvasTextMeasurementContext: CanvasRenderingContext2D | null | undefined;

const getCanvasTextMeasurementContext = () => {
  if (canvasTextMeasurementContext !== undefined) {
    return canvasTextMeasurementContext;
  }
  if (typeof document === "undefined") {
    canvasTextMeasurementContext = null;
    return canvasTextMeasurementContext;
  }

  const canvas = document.createElement("canvas");
  canvasTextMeasurementContext = canvas.getContext("2d");
  return canvasTextMeasurementContext;
};

const getCanvasTextMinimumWidth = (fontSize: number) =>
  Math.max(1, Math.ceil(fontSize * FALLBACK_TEXT_WIDTH_RATIO));

export const splitCanvasTextLines = (content: string) => content.split(/\r?\n/);

export const measureCanvasTextContentSize = (
  element: Pick<CanvasTextElement, "content" | "fontFamily" | "fontSize">,
  options?: {
    measureText?: (line: string, font: { fontFamily: string; fontSize: number }) => number;
  }
): CanvasTextContentSize => {
  const lines = splitCanvasTextLines(element.content);
  const lineHeight = Math.max(1, Math.ceil(element.fontSize * CANVAS_TEXT_LINE_HEIGHT_MULTIPLIER));
  const context = getCanvasTextMeasurementContext();

  const measureLineWidth = (line: string) => {
    if (options?.measureText) {
      return options.measureText(line, {
        fontFamily: element.fontFamily,
        fontSize: element.fontSize,
      });
    }
    if (context) {
      context.font = `${element.fontSize}px ${element.fontFamily}`;
      return context.measureText(line).width;
    }
    return line.length * element.fontSize * FALLBACK_TEXT_WIDTH_RATIO;
  };

  const maxLineWidth = lines.reduce((width, line) => Math.max(width, measureLineWidth(line)), 0);

  return {
    width: Math.max(
      getCanvasTextMinimumWidth(element.fontSize),
      Math.ceil(maxLineWidth + TEXT_WIDTH_PADDING)
    ),
    height: Math.max(lineHeight, lineHeight * Math.max(lines.length, 1)),
  };
};

export const measureCanvasTextEditorSize = (
  element: Pick<CanvasTextElement, "content" | "fontFamily" | "fontSize">,
  options?: {
    measureText?: (line: string, font: { fontFamily: string; fontSize: number }) => number;
  }
): CanvasTextContentSize => {
  const contentSize = measureCanvasTextContentSize(element, options);
  if (element.content.length > 0) {
    return contentSize;
  }

  const placeholderSize = measureCanvasTextContentSize(
    {
      ...element,
      content: CANVAS_TEXT_EDITOR_PLACEHOLDER,
    },
    options
  );

  return {
    width: Math.max(contentSize.width, placeholderSize.width),
    height: Math.max(contentSize.height, placeholderSize.height),
  };
};

export const getCanvasTextBaseFontSize = (tier: CanvasTextFontSizeTier) =>
  CANVAS_TEXT_TIER_BASE_FONT_SIZES[tier];

export const getClosestCanvasTextFontSizeTier = (fontSize: number): CanvasTextFontSizeTier => {
  const fallback: CanvasTextFontSizeTier = DEFAULT_CANVAS_TEXT_FONT_SIZE_TIER;
  if (!Number.isFinite(fontSize) || fontSize <= 0) {
    return fallback;
  }

  let closestTier: CanvasTextFontSizeTier = fallback;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const [tier, baseSize] of Object.entries(CANVAS_TEXT_TIER_BASE_FONT_SIZES) as Array<
    [CanvasTextFontSizeTier, number]
  >) {
    const distance = Math.abs(fontSize - baseSize);
    if (distance < closestDistance) {
      closestTier = tier;
      closestDistance = distance;
    }
  }

  return closestTier;
};

export const getCanvasTextFontScale = (fontSize: number, tier: CanvasTextFontSizeTier) => {
  const baseSize = getCanvasTextBaseFontSize(tier);
  if (!Number.isFinite(fontSize) || fontSize <= 0 || baseSize <= 0) {
    return 1;
  }
  return fontSize / baseSize;
};

export const normalizeCanvasTextElement = (
  element: Omit<CanvasTextElement, "fontSizeTier"> &
    Partial<Pick<CanvasTextElement, "fontSizeTier">>
): CanvasTextElement => {
  const fontSizeTier = element.fontSizeTier ?? getClosestCanvasTextFontSizeTier(element.fontSize);
  const fontSize = Number.isFinite(element.fontSize)
    ? roundFontSize(element.fontSize)
    : getCanvasTextBaseFontSize(fontSizeTier);

  return {
    ...element,
    color: element.color || DEFAULT_CANVAS_TEXT_COLOR,
    fontFamily: element.fontFamily || DEFAULT_CANVAS_TEXT_FONT_FAMILY,
    fontSize,
    fontSizeTier,
  };
};

export const applyCanvasTextFontSizeTier = (
  element: CanvasTextElement,
  nextTier: CanvasTextFontSizeTier
): CanvasTextElement => {
  const currentTier = element.fontSizeTier ?? getClosestCanvasTextFontSizeTier(element.fontSize);
  const currentScale = getCanvasTextFontScale(element.fontSize, currentTier);

  return {
    ...element,
    fontSize: roundFontSize(getCanvasTextBaseFontSize(nextTier) * currentScale),
    fontSizeTier: nextTier,
  };
};

export const scaleCanvasTextFontSize = (fontSize: number, scale: number) => {
  if (!Number.isFinite(scale) || scale <= 0) {
    return roundFontSize(fontSize);
  }
  return roundFontSize(fontSize * scale);
};

export const fitCanvasTextElementToContent = <TElement extends CanvasTextElement>(
  element: TElement,
  options?: {
    measureText?: (line: string, font: { fontFamily: string; fontSize: number }) => number;
  }
): TElement => {
  const size = measureCanvasTextContentSize(element, options);
  return {
    ...element,
    width: size.width,
    height: size.height,
  };
};

export const getCanvasTextColorOption = (value: string) =>
  CANVAS_TEXT_COLOR_OPTIONS.find(
    (option) => option.value.toLowerCase() === value.toLowerCase()
  ) ?? {
    id: value,
    label: "Custom",
    value,
  };

export const getCanvasTextFontOption = (value: string) =>
  CANVAS_TEXT_FONT_OPTIONS.find((option) => option.value === value) ?? {
    label: value,
    value,
  };

export const getCanvasTextSizeTierOption = (tier: CanvasTextFontSizeTier) =>
  CANVAS_TEXT_SIZE_TIER_OPTIONS.find((option) => option.value === tier) ??
  CANVAS_TEXT_SIZE_TIER_OPTIONS[0]!;
