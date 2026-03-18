import type {
  CanvasDocument,
  CanvasGuideSettings,
  CanvasImageElement,
  CanvasPresetId,
  CanvasSafeArea,
  CanvasTextElement,
  CanvasTextFontSizeTier,
} from "@/types";
import { normalizeCanvasTextElement } from "./textStyle";

interface LegacyCanvasShapeElement {
  id: string;
  type: "shape";
}

type LegacyCanvasTextElement = Omit<CanvasTextElement, "fontSizeTier"> & {
  type: "text";
  fontSizeTier?: CanvasTextFontSizeTier;
};

type NormalizableCanvasElement =
  | CanvasImageElement
  | LegacyCanvasTextElement
  | LegacyCanvasShapeElement;

type NormalizableCanvasDocument = Omit<
  CanvasDocument,
  "elements" | "presetId" | "slices" | "guides" | "safeArea"
> & {
  elements?: NormalizableCanvasElement[];
} & Partial<Pick<CanvasDocument, "presetId" | "slices" | "guides" | "safeArea">>;

export interface NormalizedCanvasDocumentResult {
  document: CanvasDocument;
  removedLegacyShapeIds: string[];
}

export interface StudioCanvasPreset {
  id: CanvasPresetId;
  label: string;
  shortLabel: string;
  description: string;
  width: number;
  height: number;
}

export const DEFAULT_CANVAS_GUIDES: CanvasGuideSettings = {
  showCenter: false,
  showThirds: true,
  showSafeArea: true,
};

export const DEFAULT_CANVAS_SAFE_AREA: CanvasSafeArea = {
  top: 72,
  right: 72,
  bottom: 72,
  left: 72,
};

export const STUDIO_CANVAS_PRESETS: StudioCanvasPreset[] = [
  {
    id: "social-portrait",
    label: "Portrait 4:5",
    shortLabel: "4:5",
    description: "Best for cover images and carousel hero frames.",
    width: 1080,
    height: 1350,
  },
  {
    id: "social-square",
    label: "Square 1:1",
    shortLabel: "1:1",
    description: "Balanced, compact posts for feed-first sharing.",
    width: 1080,
    height: 1080,
  },
  {
    id: "social-story",
    label: "Story 9:16",
    shortLabel: "9:16",
    description: "Full-height story or reel cover compositions.",
    width: 1080,
    height: 1920,
  },
  {
    id: "social-landscape",
    label: "Landscape 16:9",
    shortLabel: "16:9",
    description: "Wide-format recaps, headers, and editorial boards.",
    width: 1600,
    height: 900,
  },
];

const presetMap = new Map(STUDIO_CANVAS_PRESETS.map((preset) => [preset.id, preset]));

export const getStudioCanvasPreset = (presetId: CanvasPresetId | undefined | null) =>
  (presetId ? presetMap.get(presetId) : undefined) ??
  STUDIO_CANVAS_PRESETS.find((preset) => preset.id === "social-portrait")!;

export const createDefaultCanvasDocumentFields = () => {
  const preset = getStudioCanvasPreset("social-portrait");
  return {
    width: preset.width,
    height: preset.height,
    presetId: preset.id,
    slices: [],
    guides: { ...DEFAULT_CANVAS_GUIDES },
    safeArea: { ...DEFAULT_CANVAS_SAFE_AREA },
  } satisfies Pick<
    CanvasDocument,
    "width" | "height" | "presetId" | "slices" | "guides" | "safeArea"
  >;
};

export const applyCanvasPresetToDocument = (
  document: CanvasDocument,
  presetId: CanvasPresetId
): CanvasDocument => {
  const preset = getStudioCanvasPreset(presetId);
  const orderedSlices = document.slices.slice().sort((left, right) => left.order - right.order);
  const hasSlices = orderedSlices.length > 0;
  return {
    ...document,
    presetId,
    width: hasSlices ? preset.width * orderedSlices.length : preset.width,
    height: preset.height,
    slices: hasSlices
      ? orderedSlices.map((slice, index) => ({
          ...slice,
          x: index * preset.width,
          y: 0,
          width: preset.width,
          height: preset.height,
          order: index + 1,
        }))
      : document.slices,
    updatedAt: new Date().toISOString(),
  };
};

const normalizeCanvasElements = (
  elements: NormalizableCanvasElement[] | undefined
): { elements: CanvasDocument["elements"]; removedLegacyShapeIds: string[] } => {
  const removedLegacyShapeIds: string[] = [];
  const normalizedElements: CanvasDocument["elements"] = [];

  for (const element of elements ?? []) {
    if (element.type === "shape") {
      removedLegacyShapeIds.push(element.id);
      continue;
    }

    if (element.type === "text") {
      normalizedElements.push(normalizeCanvasTextElement(element));
      continue;
    }

    normalizedElements.push(element);
  }

  return {
    elements: normalizedElements,
    removedLegacyShapeIds,
  };
};

export const normalizeCanvasDocumentWithCleanup = (
  document: NormalizableCanvasDocument
): NormalizedCanvasDocumentResult => {
  const preset = getStudioCanvasPreset(document.presetId);
  const { elements, removedLegacyShapeIds } = normalizeCanvasElements(document.elements);

  return {
    document: {
      ...document,
      elements,
      width: document.width || preset.width,
      height: document.height || preset.height,
      presetId: document.presetId ?? preset.id,
      slices: Array.isArray(document.slices)
        ? document.slices
            .map((slice, index) => ({
              ...slice,
              order: Number.isFinite(slice.order) ? slice.order : index + 1,
            }))
            .sort((left, right) => left.order - right.order)
        : [],
      guides: {
        ...DEFAULT_CANVAS_GUIDES,
        ...(document.guides ?? {}),
      },
      safeArea: {
        ...DEFAULT_CANVAS_SAFE_AREA,
        ...(document.safeArea ?? {}),
      },
    },
    removedLegacyShapeIds,
  };
};

export const normalizeCanvasDocument = (document: NormalizableCanvasDocument): CanvasDocument =>
  normalizeCanvasDocumentWithCleanup(document).document;
