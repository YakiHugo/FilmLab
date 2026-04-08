import { describe, expect, it } from "vitest";
import { createDefaultCanvasImageRenderState } from "@/render/image";
import type { CanvasWorkbench } from "@/types";
import { createCanvasTestDocument, createGroupNode, createShapeNode } from "./document/testUtils";
import { normalizeCanvasWorkbench } from "./studioPresets";
import {
  createCanvasSelectionModel,
  hasSelectedImageElement,
  resolveDisplaySelectedElementIds,
  resolveNextAdditiveSelectionIds,
  resolvePrimarySelectedEditableElement,
  resolvePrimarySelectedEditableElementFromNodeRecord,
  resolvePrimarySelectedEditableElementKey,
  resolvePrimarySelectedElement,
  resolvePrimarySelectedImageElement,
  resolveSelectedRootElementIds,
  resolveSelectedRootRenderableElementIds,
  selectionIdsEqual,
} from "./selectionModel";

const createWorkbench = (): CanvasWorkbench =>
  normalizeCanvasWorkbench({
  id: "doc-1",
  version: 5,
  name: "工作台",
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
      renderState: createDefaultCanvasImageRenderState(),
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
      renderState: createDefaultCanvasImageRenderState(),
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
    const document = createWorkbench();
    expect(resolvePrimarySelectedElement(document, ["text-1", "image-1"])?.id).toBe("text-1");
    expect(resolvePrimarySelectedElement(document, ["missing-id"])).toBeNull();
  });

  it("resolves the first selected image without changing the committed policy", () => {
    const document = createWorkbench();

    expect(resolvePrimarySelectedImageElement(document, ["text-1", "image-2"])?.id).toBe("image-2");
    expect(hasSelectedImageElement(document, ["text-1"])).toBe(false);

    const model = createCanvasSelectionModel({
      activeWorkbench: document,
      committedSelectedElementIds: ["text-1"],
      displaySelectedElementIds: ["image-1"],
      hasPreviewSelection: true,
    });

    expect(model.primarySelectedImageElement?.id).toBe("image-1");
    expect(hasSelectedImageElement(document, model.committedSelectedElementIds)).toBe(false);
  });

  it("keeps the editable selection target aligned with the primary selection owner", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "shape-1": createShapeNode({
          id: "shape-1",
          x: 30,
          y: 40,
        }),
        group: createGroupNode({
          id: "group",
          x: 120,
          y: 80,
        }),
      },
      rootIds: ["shape-1", "group"],
    });

    expect(resolvePrimarySelectedEditableElement(document, ["group", "shape-1"])).toBeNull();
    expect(resolvePrimarySelectedEditableElement(document, ["shape-1", "group"])?.id).toBe(
      "shape-1"
    );

    const model = createCanvasSelectionModel({
      activeWorkbench: document,
      committedSelectedElementIds: ["group"],
      displaySelectedElementIds: ["group", "shape-1"],
      hasPreviewSelection: true,
    });

    expect(model.primarySelectedEditableElement).toBeNull();
  });

  it("resolves the primary selected editable element key from persisted workbench nodes", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "shape-1": createShapeNode({
          id: "shape-1",
          x: 30,
          y: 40,
        }),
        group: createGroupNode({
          id: "group",
          x: 120,
          y: 80,
        }),
      },
      rootIds: ["shape-1", "group"],
    });

    expect(resolvePrimarySelectedEditableElementKey(document, ["group", "shape-1"])).toBeNull();
    expect(resolvePrimarySelectedEditableElementKey(document, ["shape-1", "group"])).toBe(
      "shape:shape-1"
    );
    expect(resolvePrimarySelectedEditableElementKey(document, ["group"])).toBeNull();
  });

  it("resolves the primary selected editable element directly from persisted node records", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "shape-1": createShapeNode({
          id: "shape-1",
          x: 30,
          y: 40,
        }),
        group: createGroupNode({
          id: "group",
          x: 120,
          y: 80,
        }),
      },
      rootIds: ["shape-1", "group"],
    });

    expect(
      resolvePrimarySelectedEditableElementFromNodeRecord(document, ["group", "shape-1"])
    ).toBeNull();
    expect(
      resolvePrimarySelectedEditableElementFromNodeRecord(document, ["shape-1", "group"])?.id
    ).toBe("shape-1");
  });

  it("promotes a newly added additive selection to the primary slot", () => {
    expect(resolveNextAdditiveSelectionIds(["image-1"], "shape-1")).toEqual(["shape-1", "image-1"]);
    expect(resolveNextAdditiveSelectionIds(["shape-1", "image-1"], "shape-1")).toEqual([
      "image-1",
    ]);
  });

  it("filters selected descendants when their ancestor group is already selected", () => {
    const document = createCanvasTestDocument({
      nodes: {
        group: createGroupNode({
          id: "group",
          x: 120,
          y: 80,
          childIds: ["shape-a", "shape-b"],
        }),
        "shape-a": createShapeNode({
          id: "shape-a",
          parentId: "group",
          x: 20,
          y: 30,
        }),
        "shape-b": createShapeNode({
          id: "shape-b",
          parentId: "group",
          x: 180,
          y: 60,
        }),
        "shape-c": createShapeNode({
          id: "shape-c",
          x: 420,
          y: 220,
        }),
      },
      rootIds: ["group", "shape-c"],
    });

    expect(resolveSelectedRootElementIds(document, ["shape-a", "group", "shape-c", "shape-b"])).toEqual(
      ["group", "shape-c"]
    );
    expect(
      resolveSelectedRootRenderableElementIds(document, ["shape-a", "group", "shape-c", "shape-b"])
    ).toEqual(["shape-c"]);
  });
});
