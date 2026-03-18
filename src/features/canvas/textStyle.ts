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

export const CANVAS_TEXT_LINE_HEIGHT_MULTIPLIER = 1.2;
export const DEFAULT_CANVAS_TEXT_FONT_FAMILY = "Georgia";
export const DEFAULT_CANVAS_TEXT_FONT_SIZE_TIER: CanvasTextFontSizeTier = "medium";

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
