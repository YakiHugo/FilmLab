import { describe, expect, it } from "vitest";
import type {
  CanvasRenderableElement,
  CanvasRenderableNode,
  CanvasRenderableTextElement,
  CanvasTextElement,
} from "@/types";
import { resolveCanvasTextRuntimeViewModel } from "./textRuntimeViewModel";
import {
  createCanvasTextSessionSnapshot,
  type CanvasTextSessionSnapshot,
} from "./textSessionState";

const createRenderableTextElement = (
  overrides: Partial<CanvasRenderableTextElement> = {}
): CanvasRenderableTextElement => ({
  id: "text-1",
  type: "text",
  parentId: null,
  content: "Persisted",
  fontFamily: "Georgia",
  fontSize: 36,
  fontSizeTier: "medium",
  color: "#ffffff",
  textAlign: "left",
  worldX: 40,
  worldY: 60,
  worldWidth: 120,
  worldHeight: 48,
  worldRotation: 0,
  transform: {
    x: 40,
    y: 60,
    width: 120,
    height: 48,
    rotation: 0,
  },
  zIndex: 1,
  depth: 0,
  bounds: {
    x: 40,
    y: 60,
    width: 120,
    height: 48,
  },
  childIds: [],
  opacity: 1,
  worldOpacity: 1,
  locked: false,
  visible: true,
  effectiveLocked: false,
  effectiveVisible: true,
  ...overrides,
});

const createEditingTextDraft = (
  overrides: Partial<CanvasTextElement> = {}
): CanvasTextElement => ({
  id: "text-1",
  type: "text",
  parentId: null,
  content: "Draft",
  fontFamily: "Georgia",
  fontSize: 36,
  fontSizeTier: "medium",
  color: "#ffffff",
  textAlign: "left",
  transform: {
    x: 40,
    y: 60,
    width: 120,
    height: 48,
    rotation: 0,
  },
  opacity: 1,
  locked: false,
  visible: true,
  ...overrides,
});

const createShapeElement = (): Extract<CanvasRenderableElement, { type: "shape" }> => ({
  id: "shape-1",
  type: "shape",
  parentId: null,
  shapeType: "rect",
  fill: "#000000",
  stroke: "#ffffff",
  strokeWidth: 1,
  worldX: 10,
  worldY: 20,
  worldWidth: 200,
  worldHeight: 100,
  worldRotation: 0,
  transform: {
    x: 10,
    y: 20,
    width: 200,
    height: 100,
    rotation: 0,
  },
  zIndex: 2,
  depth: 0,
  bounds: {
    x: 10,
    y: 20,
    width: 200,
    height: 100,
  },
  childIds: [],
  opacity: 1,
  worldOpacity: 1,
  locked: false,
  visible: true,
  effectiveLocked: false,
  effectiveVisible: true,
});

const createNodeById = (
  nodes: CanvasRenderableNode[]
): Map<string, CanvasRenderableNode> => new Map(nodes.map((node) => [node.id, node]));

const createTextSession = (
  overrides: Partial<CanvasTextSessionSnapshot> = {}
): CanvasTextSessionSnapshot => ({
  ...createCanvasTextSessionSnapshot(),
  draft: null,
  hasMaterializedElement: true,
  id: "text-1",
  mode: "existing",
  sessionToken: 1,
  status: "editing",
  value: "Draft",
  workbenchId: "workbench-1",
  ...overrides,
});

describe("text runtime view model helpers", () => {
  it("applies the live draft once for both rendered elements and selected outlines", () => {
    const textElement = createRenderableTextElement();
    const editingTextDraft = createEditingTextDraft();
    const result = resolveCanvasTextRuntimeViewModel({
      activeWorkbenchId: "workbench-1",
      displaySelectedElementIds: ["text-1"],
      hasMarqueeSession: false,
      isMarqueeDragging: false,
      nodeById: createNodeById([textElement]),
      selectedElementIds: ["text-1"],
      textSession: createTextSession({
        draft: editingTextDraft,
      }),
    });

    expect(result.activeEditingTextId).toBe("text-1");
    expect(result.renderedEditingTextDraft).toEqual(editingTextDraft);
    expect(result.displaySelectedElements[0]).toEqual(editingTextDraft);
    expect(result.activeTextEditorModel?.content).toBe("Draft");
    expect(result.textOverlayModel?.content).toBe("Draft");
  });

  it("suppresses toolbar, editor, and draft outline while marquee interaction is active", () => {
    const editingTextDraft = createEditingTextDraft();
    const result = resolveCanvasTextRuntimeViewModel({
      activeWorkbenchId: "workbench-1",
      displaySelectedElementIds: [],
      hasMarqueeSession: true,
      isMarqueeDragging: true,
      nodeById: createNodeById([]),
      selectedElementIds: [],
      textSession: createTextSession({
        draft: editingTextDraft,
      }),
    });

    expect(result.activeEditingTextId).toBeNull();
    expect(result.showTextToolbar).toBe(false);
    expect(result.showTextEditor).toBe(false);
    expect(result.showEditingTextSelectionOutline).toBe(false);
  });

  it("revokes the editing identity when the active workbench no longer owns the session but keeps selected-text toolbar state", () => {
    const textElement = createRenderableTextElement();
    const editingTextDraft = createEditingTextDraft();
    const result = resolveCanvasTextRuntimeViewModel({
      activeWorkbenchId: "workbench-2",
      displaySelectedElementIds: ["text-1"],
      hasMarqueeSession: false,
      isMarqueeDragging: false,
      nodeById: createNodeById([textElement]),
      selectedElementIds: ["text-1"],
      textSession: createTextSession({
        draft: editingTextDraft,
      }),
    });

    expect(result.activeEditingTextId).toBeNull();
    expect(result.renderedEditingTextDraft).toBeNull();
    expect(result.activeTextEditorModel?.id).toBe("text-1");
    expect(result.showTextEditor).toBe(false);
    expect(result.showTextToolbar).toBe(true);
  });

  it("shows the text toolbar for a single selected text node even without an active text session", () => {
    const textElement = createRenderableTextElement();
    const result = resolveCanvasTextRuntimeViewModel({
      activeWorkbenchId: "workbench-1",
      displaySelectedElementIds: ["text-1"],
      hasMarqueeSession: false,
      isMarqueeDragging: false,
      nodeById: createNodeById([textElement]),
      selectedElementIds: ["text-1"],
      textSession: {
        ...createCanvasTextSessionSnapshot(),
        draft: null,
        hasMaterializedElement: false,
        id: null,
        mode: null,
        sessionToken: 0,
        status: "idle",
        value: "",
        workbenchId: null,
      },
    });

    expect(result.activeEditingTextId).toBeNull();
    expect(result.activeTextEditorModel?.id).toBe("text-1");
    expect(result.textOverlayModel?.id).toBe("text-1");
    expect(result.showTextToolbar).toBe(true);
    expect(result.showTextEditor).toBe(false);
  });

  it("keeps non-text selection tracking without fabricating any text runtime UI", () => {
    const shapeElement = createShapeElement();
    const result = resolveCanvasTextRuntimeViewModel({
      activeWorkbenchId: "workbench-1",
      displaySelectedElementIds: ["shape-1"],
      hasMarqueeSession: false,
      isMarqueeDragging: false,
      nodeById: createNodeById([shapeElement]),
      selectedElementIds: ["shape-1"],
      textSession: createTextSession({
        draft: null,
        hasMaterializedElement: false,
        id: null,
        mode: null,
        sessionToken: 0,
        status: "idle",
        value: "",
        workbenchId: null,
      }),
    });

    expect(result.trackedOverlayId).toBe("shape-1");
    expect(result.activeTextEditorModel).toBeNull();
    expect(result.textOverlayModel).toBeNull();
    expect(result.showTextToolbar).toBe(false);
    expect(result.showTextEditor).toBe(false);
    expect(result.showEditingTextSelectionOutline).toBe(false);
  });
});
