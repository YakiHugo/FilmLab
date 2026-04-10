import { describe, expect, it } from "vitest";
import { createNeutralCanvasImageRenderState } from "@/render/image";
import type {
  Asset,
  CanvasRenderableGroupNode,
  CanvasRenderableImageElement,
  CanvasRenderableTextElement,
} from "@/types";
import {
  canShowCanvasSelectionTransformer,
  resolveCanvasImageAspectRatio,
  resolveCanvasResizeAnchorStyle,
} from "./useCanvasViewportResizeController";

const createRenderableImage = (
  overrides?: Partial<CanvasRenderableImageElement>
): CanvasRenderableImageElement => ({
  id: overrides?.id ?? "node-1",
  type: "image",
  parentId: overrides?.parentId ?? null,
  depth: overrides?.depth ?? 0,
  childIds: overrides?.childIds ?? [],
  bounds: overrides?.bounds ?? { x: 0, y: 0, width: 120, height: 80 },
  opacity: overrides?.opacity ?? 1,
  worldOpacity: overrides?.worldOpacity ?? 1,
  locked: overrides?.locked ?? false,
  visible: overrides?.visible ?? true,
  effectiveLocked: overrides?.effectiveLocked ?? false,
  effectiveVisible: overrides?.effectiveVisible ?? true,
  x: overrides?.x ?? 0,
  y: overrides?.y ?? 0,
  width: overrides?.width ?? 120,
  height: overrides?.height ?? 80,
  rotation: overrides?.rotation ?? 0,
  zIndex: overrides?.zIndex,
  transform: overrides?.transform ?? {
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    rotation: 0,
  },
  assetId: overrides?.assetId ?? "asset-1",
  renderState: overrides?.renderState ?? createNeutralCanvasImageRenderState(),
});

const createRenderableText = (
  overrides?: Partial<CanvasRenderableTextElement>
): CanvasRenderableTextElement => ({
  id: overrides?.id ?? "text-1",
  type: "text",
  parentId: overrides?.parentId ?? null,
  depth: overrides?.depth ?? 0,
  childIds: overrides?.childIds ?? [],
  bounds: overrides?.bounds ?? { x: 0, y: 0, width: 120, height: 80 },
  opacity: overrides?.opacity ?? 1,
  worldOpacity: overrides?.worldOpacity ?? 1,
  locked: overrides?.locked ?? false,
  visible: overrides?.visible ?? true,
  effectiveLocked: overrides?.effectiveLocked ?? false,
  effectiveVisible: overrides?.effectiveVisible ?? true,
  x: overrides?.x ?? 0,
  y: overrides?.y ?? 0,
  width: overrides?.width ?? 120,
  height: overrides?.height ?? 80,
  rotation: overrides?.rotation ?? 0,
  zIndex: overrides?.zIndex,
  transform: overrides?.transform ?? {
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    rotation: 0,
  },
  content: overrides?.content ?? "Hello",
  fontFamily: overrides?.fontFamily ?? "Georgia",
  fontSize: overrides?.fontSize ?? 24,
  fontSizeTier: overrides?.fontSizeTier ?? "small",
  color: overrides?.color ?? "#ffffff",
  textAlign: overrides?.textAlign ?? "left",
});

const createRenderableGroup = (
  overrides?: Partial<CanvasRenderableGroupNode>
): CanvasRenderableGroupNode => ({
  id: overrides?.id ?? "group-1",
  type: "group",
  parentId: overrides?.parentId ?? null,
  depth: overrides?.depth ?? 0,
  childIds: overrides?.childIds ?? [],
  bounds: overrides?.bounds ?? { x: 0, y: 0, width: 120, height: 80 },
  opacity: overrides?.opacity ?? 1,
  worldOpacity: overrides?.worldOpacity ?? 1,
  locked: overrides?.locked ?? false,
  visible: overrides?.visible ?? true,
  effectiveLocked: overrides?.effectiveLocked ?? false,
  effectiveVisible: overrides?.effectiveVisible ?? true,
  x: overrides?.x ?? 0,
  y: overrides?.y ?? 0,
  width: overrides?.width ?? 120,
  height: overrides?.height ?? 80,
  rotation: overrides?.rotation ?? 0,
  zIndex: overrides?.zIndex,
  transform: overrides?.transform ?? {
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    rotation: 0,
  },
  name: overrides?.name ?? "Group",
});

describe("useCanvasViewportResizeController", () => {
  it("prefers original asset metadata when resolving image aspect ratio", () => {
    const aspectRatio = resolveCanvasImageAspectRatio({
      asset: {
        metadata: {
          width: 2000,
          height: 1000,
        },
      } as Asset,
      element: createRenderableImage({ width: 120, height: 80 }),
    });

    expect(aspectRatio).toBe(2);
  });

  it("styles edge anchors differently from corner anchors", () => {
    expect(resolveCanvasResizeAnchorStyle("middle-right")).toMatchObject({
      width: 6,
      height: 18,
      cornerRadius: 999,
      fill: "rgba(24,24,27,0.72)",
      stroke: "rgba(255,255,255,0.92)",
    });

    expect(resolveCanvasResizeAnchorStyle("bottom-right")).toMatchObject({
      width: 8,
      height: 8,
      cornerRadius: 2,
      fill: "rgba(255,255,255,0.92)",
    });
  });

  it("allows the transformer for a single non-group selection", () => {
    expect(
      canShowCanvasSelectionTransformer({
        activeEditingTextId: null,
        canManipulateSelection: true,
        hasMarqueeSession: false,
        interactionBlocked: false,
        isTransforming: false,
        isMarqueeDragging: false,
        selectedElement: createRenderableImage(),
        selectedElementIds: ["node-1"],
      })
    ).toBe(true);
  });

  it("rejects multi-selection and group-selection transformer entry", () => {
    expect(
      canShowCanvasSelectionTransformer({
        activeEditingTextId: null,
        canManipulateSelection: true,
        hasMarqueeSession: false,
        interactionBlocked: false,
        isTransforming: false,
        isMarqueeDragging: false,
        selectedElement: createRenderableImage(),
        selectedElementIds: ["node-1", "node-2"],
      })
    ).toBe(false);

    expect(
      canShowCanvasSelectionTransformer({
        activeEditingTextId: null,
        canManipulateSelection: true,
        hasMarqueeSession: false,
        interactionBlocked: false,
        isTransforming: false,
        isMarqueeDragging: false,
        selectedElement: createRenderableGroup(),
        selectedElementIds: ["group-1"],
      })
    ).toBe(false);
  });

  it("hides the transformer while marquee or text editing is active", () => {
    expect(
      canShowCanvasSelectionTransformer({
        activeEditingTextId: "text-1",
        canManipulateSelection: true,
        hasMarqueeSession: false,
        interactionBlocked: false,
        isTransforming: false,
        isMarqueeDragging: false,
        selectedElement: createRenderableText(),
        selectedElementIds: ["text-1"],
      })
    ).toBe(false);

    expect(
      canShowCanvasSelectionTransformer({
        activeEditingTextId: null,
        canManipulateSelection: true,
        hasMarqueeSession: true,
        interactionBlocked: false,
        isTransforming: false,
        isMarqueeDragging: false,
        selectedElement: createRenderableImage(),
        selectedElementIds: ["node-1"],
      })
    ).toBe(false);
  });

  it("hides the transformer for locked selections", () => {
    expect(
      canShowCanvasSelectionTransformer({
        activeEditingTextId: null,
        canManipulateSelection: true,
        hasMarqueeSession: false,
        interactionBlocked: false,
        isTransforming: false,
        isMarqueeDragging: false,
        selectedElement: createRenderableImage({ effectiveLocked: true }),
        selectedElementIds: ["node-1"],
      })
    ).toBe(false);
  });

  it("hides the transformer outside select-mode element manipulation", () => {
    expect(
      canShowCanvasSelectionTransformer({
        activeEditingTextId: null,
        canManipulateSelection: false,
        hasMarqueeSession: false,
        interactionBlocked: false,
        isTransforming: false,
        isMarqueeDragging: false,
        selectedElement: createRenderableImage(),
        selectedElementIds: ["node-1"],
      })
    ).toBe(false);
  });

  it("hides the transformer while interaction commits or queued mutations block resize", () => {
    expect(
      canShowCanvasSelectionTransformer({
        activeEditingTextId: null,
        canManipulateSelection: true,
        hasMarqueeSession: false,
        interactionBlocked: true,
        isTransforming: false,
        isMarqueeDragging: false,
        selectedElement: createRenderableImage(),
        selectedElementIds: ["node-1"],
      })
    ).toBe(false);
  });

  it("keeps the transformer visible during the active resize interaction itself", () => {
    expect(
      canShowCanvasSelectionTransformer({
        activeEditingTextId: null,
        canManipulateSelection: true,
        hasMarqueeSession: false,
        interactionBlocked: true,
        isTransforming: true,
        isMarqueeDragging: false,
        selectedElement: createRenderableImage(),
        selectedElementIds: ["node-1"],
      })
    ).toBe(true);
  });
});
