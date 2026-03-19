import { describe, expect, it } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import type { CanvasDocument } from "@/types";
import { normalizeCanvasDocument } from "./studioPresets";
import {
  createCanvasSelectionModel,
  hasSelectedImageElement,
  resolveDisplaySelectedElementIds,
  resolvePrimarySelectedElement,
  resolvePrimarySelectedImageElement,
  selectionIdsEqual,
} from "./selectionModel";

const createDocument = (): CanvasDocument =>
  normalizeCanvasDocument({
  id: "doc-1",
  version: 2,
  name: "Board",
  width: 1200,
  height: 800,
  presetId: "custom",
  backgroundColor: "#000000",
  elements: [
    {
      id: "image-1",
      type: "image",
      assetId: "asset-1",
      parentId: null,
      x: 10,
      y: 20,
      width: 300,
      height: 200,
      rotation: 0,
      transform: {
        x: 10,
        y: 20,
        width: 300,
        height: 200,
        rotation: 0,
      },
      opacity: 1,
      locked: false,
      visible: true,
      adjustments: createDefaultAdjustments(),
    },
    {
      id: "text-1",
      type: "text",
      parentId: null,
      content: "Hello",
      fontFamily: "Georgia",
      fontSize: 24,
      fontSizeTier: "small",
      color: "#ffffff",
      textAlign: "left",
      x: 40,
      y: 60,
      width: 180,
      height: 80,
      rotation: 0,
      transform: {
        x: 40,
        y: 60,
        width: 180,
        height: 80,
        rotation: 0,
      },
      opacity: 1,
      locked: false,
      visible: true,
    },
    {
      id: "image-2",
      type: "image",
      assetId: "asset-2",
      parentId: null,
      x: 80,
      y: 100,
      width: 360,
      height: 220,
      rotation: 0,
      transform: {
        x: 80,
        y: 100,
        width: 360,
        height: 220,
        rotation: 0,
      },
      opacity: 1,
      locked: false,
      visible: true,
      adjustments: createDefaultAdjustments(),
    },
  ],
  slices: [],
  guides: {
    showCenter: false,
    showThirds: false,
    showSafeArea: false,
  },
  safeArea: {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  createdAt: "2026-03-17T00:00:00.000Z",
  updatedAt: "2026-03-17T00:00:00.000Z",
});

describe("selection model", () => {
  it("prefers preview selection ids over committed selection ids", () => {
    expect(resolveDisplaySelectedElementIds(["image-2"], ["text-1"])).toEqual(["image-2"]);
    expect(resolveDisplaySelectedElementIds(null, ["text-1"])).toEqual(["text-1"]);
  });

  it("compares selection ids by ordered contents", () => {
    expect(selectionIdsEqual(["image-1", "text-1"], ["image-1", "text-1"])).toBe(true);
    expect(selectionIdsEqual(["image-1", "text-1"], ["text-1", "image-1"])).toBe(false);
    expect(selectionIdsEqual(null, null)).toBe(true);
  });

  it("resolves the primary selected element from the first id", () => {
    const document = createDocument();
    expect(resolvePrimarySelectedElement(document, ["text-1", "image-1"])?.id).toBe("text-1");
    expect(resolvePrimarySelectedElement(document, ["missing-id"])).toBeNull();
  });

  it("resolves the first selected image without changing the committed policy", () => {
    const document = createDocument();

    expect(resolvePrimarySelectedImageElement(document, ["text-1", "image-2"])?.id).toBe("image-2");
    expect(hasSelectedImageElement(document, ["text-1"])).toBe(false);

    const model = createCanvasSelectionModel({
      activeDocument: document,
      committedSelectedElementIds: ["text-1"],
      displaySelectedElementIds: ["image-1"],
      hasPreviewSelection: true,
    });

    expect(model.primarySelectedImageElement?.id).toBe("image-1");
    expect(hasSelectedImageElement(document, model.committedSelectedElementIds)).toBe(false);
  });
});
