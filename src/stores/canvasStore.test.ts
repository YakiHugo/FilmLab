import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import type { CanvasHistoryEntry, CanvasWorkbench } from "@/types";
import { normalizeCanvasWorkbench } from "@/features/canvas/studioPresets";
import { useCanvasStore } from "./canvasStore";

const loadCanvasWorkbenchesMock = vi.fn();
const saveCanvasWorkbenchMock = vi.fn();

vi.mock("@/lib/db", () => ({
  deleteCanvasWorkbench: vi.fn(),
  loadCanvasWorkbenches: (...args: unknown[]) => loadCanvasWorkbenchesMock(...args),
  loadCanvasWorkbenchesByUser: (...args: unknown[]) => loadCanvasWorkbenchesMock(...args),
  saveCanvasWorkbench: (...args: unknown[]) => saveCanvasWorkbenchMock(...args),
}));

const createWorkbench = (): CanvasWorkbench =>
  normalizeCanvasWorkbench({
  id: "doc-1",
  version: 2,
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

const createCrossParentGroupingDocument = (): CanvasWorkbench =>
  normalizeCanvasWorkbench({
    id: "doc-1",
    version: 2,
    name: "工作台",
    width: 1200,
    height: 800,
    presetId: "custom",
    backgroundColor: "#000000",
    nodes: {
      "group-1": {
        id: "group-1",
        type: "group",
        parentId: null,
        x: 100,
        y: 120,
        width: 1,
        height: 1,
        rotation: 0,
        transform: {
          x: 100,
          y: 120,
          width: 1,
          height: 1,
          rotation: 0,
        },
        opacity: 1,
        locked: false,
        visible: true,
        childIds: ["shape-1"],
        name: "Group",
      },
      "shape-1": {
        id: "shape-1",
        type: "shape",
        parentId: "group-1",
        x: 10,
        y: 20,
        width: 120,
        height: 80,
        rotation: 0,
        transform: {
          x: 10,
          y: 20,
          width: 120,
          height: 80,
          rotation: 0,
        },
        opacity: 1,
        locked: false,
        visible: true,
        shapeType: "rect",
        fill: "#ffffff",
        stroke: "#111111",
        strokeWidth: 1,
      },
      "shape-2": {
        id: "shape-2",
        type: "shape",
        parentId: null,
        x: 260,
        y: 200,
        width: 120,
        height: 80,
        rotation: 0,
        transform: {
          x: 260,
          y: 200,
          width: 120,
          height: 80,
          rotation: 0,
        },
        opacity: 1,
        locked: false,
        visible: true,
        shapeType: "rect",
        fill: "#ffffff",
        stroke: "#111111",
        strokeWidth: 1,
      },
    },
    rootIds: ["group-1", "shape-2"],
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

const createLegacyShapeDocument = () =>
  ({
    id: "doc-1",
    name: "工作台",
    width: 1200,
    height: 800,
    presetId: "custom",
    backgroundColor: "#000000",
    elements: [
      {
        ...(createWorkbench().elements[0] as CanvasWorkbench["elements"][number]),
      },
      {
        ...(createWorkbench().elements[1] as CanvasWorkbench["elements"][number]),
        fontSizeTier: undefined,
      },
      {
        id: "shape-1",
        type: "shape",
        fill: "#ffcc00",
        stroke: "#000000",
        strokeWidth: 2,
        parentId: null,
        x: 32,
        y: 48,
        width: 96,
        height: 64,
        rotation: 0,
        transform: {
          x: 32,
          y: 48,
          width: 96,
          height: 64,
          rotation: 0,
        },
        opacity: 1,
        locked: false,
        visible: true,
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
  }) as unknown as CanvasWorkbench;

const createLegacyTextTierDocument = () => {
  const document = createWorkbench();
  const textElement = document.elements[1];
  if (!textElement || textElement.type !== "text") {
    throw new Error("Expected text element.");
  }

  return {
    id: "doc-1",
    name: "工作台",
    width: 1200,
    height: 800,
    presetId: "custom",
    backgroundColor: "#000000",
    elements: [
      document.elements[0],
      {
        ...textElement,
        fontSizeTier: undefined,
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
  } as unknown as CanvasWorkbench;
};

const createHistoryEntry = (
  commandType: CanvasHistoryEntry["commandType"] = "PATCH_DOCUMENT"
): CanvasHistoryEntry => ({
  commandType,
  forwardPatch: { operations: [] },
  inversePatch: { operations: [] },
});

describe("canvasStore", () => {
  beforeEach(() => {
    loadCanvasWorkbenchesMock.mockReset();
    loadCanvasWorkbenchesMock.mockResolvedValue([]);
    saveCanvasWorkbenchMock.mockClear();
    saveCanvasWorkbenchMock.mockResolvedValue(true);
    useCanvasStore.setState({
      activeWorkbenchId: "doc-1",
      workbenches: [createWorkbench()],
      historyByWorkbenchId: {},
      activePanel: null,
      selectedElementIds: [],
      tool: "select",
      viewport: { x: 0, y: 0 },
      zoom: 1,
    });
  });

  it("persists image-only adjustment updates even when geometry is unchanged", async () => {
    const element = useCanvasStore
      .getState()
      .workbenches[0]?.elements.find((candidate) => candidate.id === "image-1");
    if (!element || element.type !== "image") {
      throw new Error("Expected image element.");
    }
    const nextAdjustments = {
      ...createDefaultAdjustments(),
      ...(element.adjustments ?? {}),
      exposure: 18,
    };

    await useCanvasStore.getState().upsertElement({
      ...element,
      adjustments: nextAdjustments,
    });

    const updated = useCanvasStore
      .getState()
      .workbenches[0]?.elements.find((candidate) => candidate.id === "image-1");
    expect(updated?.type).toBe("image");
    if (updated?.type !== "image") {
      return;
    }
    expect(updated.adjustments?.exposure).toBe(18);
    expect(saveCanvasWorkbenchMock).toHaveBeenCalledTimes(1);
  });

  it("persists text content updates without requiring transform changes", async () => {
    const element = useCanvasStore
      .getState()
      .workbenches[0]?.elements.find((candidate) => candidate.id === "text-1");
    if (!element || element.type !== "text") {
      throw new Error("Expected text element.");
    }

    await useCanvasStore.getState().upsertElement({
      ...element,
      content: "Updated copy",
    });

    const updated = useCanvasStore
      .getState()
      .workbenches[0]?.elements.find((candidate) => candidate.id === "text-1");
    expect(updated?.type).toBe("text");
    if (updated?.type !== "text") {
      return;
    }
    expect(updated.content).toBe("Updated copy");
    expect(saveCanvasWorkbenchMock).toHaveBeenCalledTimes(1);
  });

  it("migrates legacy shape elements into v2 nodes during init", async () => {
    loadCanvasWorkbenchesMock.mockResolvedValue([createLegacyShapeDocument()]);

    await useCanvasStore.getState().init();

    const workbenches = useCanvasStore.getState().workbenches;
    expect(workbenches).toHaveLength(1);
    expect(workbenches[0]?.elements).toHaveLength(3);
    expect(workbenches[0]?.elements.map((element) => element.type)).toEqual([
      "image",
      "text",
      "shape",
    ]);
    expect(workbenches[0]?.nodes["shape-1"]).toMatchObject({
      id: "shape-1",
      type: "shape",
      shapeType: "rect",
    });
    expect(saveCanvasWorkbenchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "doc-1",
        nodes: expect.objectContaining({
          "image-1": expect.objectContaining({ id: "image-1", type: "image" }),
          "shape-1": expect.objectContaining({ id: "shape-1", type: "shape" }),
          "text-1": expect.objectContaining({ id: "text-1", type: "text" }),
        }),
      })
    );
  });

  it("persists legacy text tier normalization during init", async () => {
    loadCanvasWorkbenchesMock.mockResolvedValue([createLegacyTextTierDocument()]);

    await useCanvasStore.getState().init();

    const workbenches = useCanvasStore.getState().workbenches;
    expect(workbenches).toHaveLength(1);
    expect(workbenches[0]?.elements[1]).toMatchObject({
      id: "text-1",
      type: "text",
      fontSizeTier: "small",
    });
    expect(saveCanvasWorkbenchMock).toHaveBeenCalledTimes(1);
    expect(saveCanvasWorkbenchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "doc-1",
        nodes: expect.objectContaining({
          "text-1": expect.objectContaining({
            id: "text-1",
            type: "text",
            fontSizeTier: "small",
          }),
        }),
      })
    );
  });

  it("keeps the left rail exclusive between text mode and panels", () => {
    useCanvasStore.setState({
      activePanel: "library",
      tool: "select",
    });

    useCanvasStore.getState().setTool("text");
    expect(useCanvasStore.getState().tool).toBe("text");
    expect(useCanvasStore.getState().activePanel).toBeNull();

    useCanvasStore.getState().setActivePanel("edit");
    expect(useCanvasStore.getState().tool).toBe("select");
    expect(useCanvasStore.getState().activePanel).toBe("edit");

    useCanvasStore.getState().togglePanel("edit");
    expect(useCanvasStore.getState().tool).toBe("select");
    expect(useCanvasStore.getState().activePanel).toBeNull();
  });

  it("returns to select when a floating panel is closed through setActivePanel(null)", () => {
    useCanvasStore.setState({
      activePanel: "edit",
      tool: "hand",
    });

    useCanvasStore.getState().setActivePanel(null);

    expect(useCanvasStore.getState().activePanel).toBeNull();
    expect(useCanvasStore.getState().tool).toBe("select");
  });

  it("skips persistence, history, and selection changes when grouping is invalid", async () => {
    useCanvasStore.setState({
      activeWorkbenchId: "doc-1",
      workbenches: [createCrossParentGroupingDocument()],
      historyByWorkbenchId: {
        "doc-1": { past: [], future: [] },
      },
      selectedElementIds: ["shape-1", "shape-2"],
    });

    const result = await useCanvasStore.getState().groupElements(["shape-1", "shape-2"]);

    expect(result).toBeNull();
    expect(useCanvasStore.getState().selectedElementIds).toEqual(["shape-1", "shape-2"]);
    expect(useCanvasStore.getState().historyByWorkbenchId["doc-1"]?.past).toEqual([]);
    expect(saveCanvasWorkbenchMock).not.toHaveBeenCalled();
  });

  it("short-circuits committed selection updates when ids are unchanged", () => {
    useCanvasStore.getState().setSelectedElementIds(["image-1", "text-1"]);
    const firstSelectedElementIds = useCanvasStore.getState().selectedElementIds;

    useCanvasStore.getState().setSelectedElementIds(["image-1", "text-1"]);

    expect(useCanvasStore.getState().selectedElementIds).toBe(firstSelectedElementIds);
  });

  it("records command history and clears future entries by default", async () => {
    const staleFutureEntry = createHistoryEntry("MOVE_NODES");
    useCanvasStore.setState({
      historyByWorkbenchId: {
        "doc-1": {
          past: [],
          future: [staleFutureEntry],
        },
      },
    });

    const result = await useCanvasStore.getState().executeCommandInWorkbench("doc-1", {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Renamed workbench",
      },
    });

    expect(result?.name).toBe("Renamed workbench");
    expect(useCanvasStore.getState().workbenches[0]?.name).toBe("Renamed workbench");
    expect(useCanvasStore.getState().historyByWorkbenchId["doc-1"]).toEqual({
      past: [
        expect.objectContaining({
          commandType: "PATCH_DOCUMENT",
        }),
      ],
      future: [],
    });
  });

  it("keeps history unchanged when trackHistory is false", async () => {
    const existingHistory = {
      past: [createHistoryEntry("MOVE_NODES")],
      future: [createHistoryEntry("TOGGLE_NODE_LOCK")],
    };
    useCanvasStore.setState({
      historyByWorkbenchId: {
        "doc-1": existingHistory,
      },
    });

    const result = await useCanvasStore.getState().executeCommandInWorkbench(
      "doc-1",
      {
        type: "PATCH_DOCUMENT",
        patch: {
          name: "Renamed without history",
        },
      },
      { trackHistory: false }
    );

    expect(result?.name).toBe("Renamed without history");
    expect(useCanvasStore.getState().workbenches[0]?.name).toBe("Renamed without history");
    expect(useCanvasStore.getState().historyByWorkbenchId["doc-1"]).toEqual(existingHistory);
  });

  it("skips persistence and history changes for no-op commands", async () => {
    const existing = useCanvasStore.getState().workbenches[0]!;
    const previousHistory = {
      past: [createHistoryEntry("MOVE_NODES")],
      future: [createHistoryEntry("TOGGLE_NODE_VISIBILITY")],
    };
    useCanvasStore.setState({
      historyByWorkbenchId: {
        "doc-1": previousHistory,
      },
    });
    saveCanvasWorkbenchMock.mockClear();

    const result = await useCanvasStore.getState().executeCommandInWorkbench("doc-1", {
      type: "PATCH_DOCUMENT",
      patch: {
        name: existing.name,
      },
    });

    expect(result).toBe(existing);
    expect(saveCanvasWorkbenchMock).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().workbenches[0]).toBe(existing);
    expect(useCanvasStore.getState().historyByWorkbenchId["doc-1"]).toEqual(previousHistory);
  });

  it("undo applies inverse patches, moves history to future, and clears selection", async () => {
    const originalName = useCanvasStore.getState().workbenches[0]?.name;
    await useCanvasStore.getState().executeCommandInWorkbench("doc-1", {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Renamed workbench",
      },
    });
    useCanvasStore.setState({
      selectedElementIds: ["image-1", "text-1"],
    });

    const undone = await useCanvasStore.getState().undo();

    expect(undone).toBe(true);
    expect(useCanvasStore.getState().workbenches[0]?.name).toBe(originalName);
    expect(useCanvasStore.getState().selectedElementIds).toEqual([]);
    expect(useCanvasStore.getState().historyByWorkbenchId["doc-1"]).toEqual({
      past: [],
      future: [
        expect.objectContaining({
          commandType: "PATCH_DOCUMENT",
        }),
      ],
    });
  });

  it("redo reapplies forward patches, restores past history, and clears selection", async () => {
    await useCanvasStore.getState().executeCommandInWorkbench("doc-1", {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Renamed workbench",
      },
    });
    await useCanvasStore.getState().undo();
    useCanvasStore.setState({
      selectedElementIds: ["image-1"],
    });

    const redone = await useCanvasStore.getState().redo();

    expect(redone).toBe(true);
    expect(useCanvasStore.getState().workbenches[0]?.name).toBe("Renamed workbench");
    expect(useCanvasStore.getState().selectedElementIds).toEqual([]);
    expect(useCanvasStore.getState().historyByWorkbenchId["doc-1"]).toEqual({
      past: [
        expect.objectContaining({
          commandType: "PATCH_DOCUMENT",
        }),
      ],
      future: [],
    });
  });

  it("does not commit command state when persistence fails", async () => {
    const originalName = useCanvasStore.getState().workbenches[0]?.name;
    useCanvasStore.setState({
      historyByWorkbenchId: {
        "doc-1": {
          past: [],
          future: [],
        },
      },
    });
    saveCanvasWorkbenchMock.mockResolvedValue(false);

    const result = await useCanvasStore.getState().executeCommandInWorkbench("doc-1", {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Should not persist",
      },
    });

    expect(result).toBeNull();
    expect(useCanvasStore.getState().workbenches[0]?.name).toBe(originalName);
    expect(useCanvasStore.getState().historyByWorkbenchId["doc-1"]).toEqual({
      past: [],
      future: [],
    });
  });

  it("does not commit undo state when persistence fails", async () => {
    await useCanvasStore.getState().executeCommandInWorkbench("doc-1", {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Renamed workbench",
      },
    });
    useCanvasStore.setState({
      selectedElementIds: ["image-1"],
    });
    saveCanvasWorkbenchMock.mockResolvedValue(false);

    const undone = await useCanvasStore.getState().undo();

    expect(undone).toBe(false);
    expect(useCanvasStore.getState().workbenches[0]?.name).toBe("Renamed workbench");
    expect(useCanvasStore.getState().selectedElementIds).toEqual(["image-1"]);
    expect(useCanvasStore.getState().historyByWorkbenchId["doc-1"]).toEqual({
      past: [
        expect.objectContaining({
          commandType: "PATCH_DOCUMENT",
        }),
      ],
      future: [],
    });
  });

  it("does not commit redo state when persistence fails", async () => {
    const originalName = useCanvasStore.getState().workbenches[0]?.name;
    await useCanvasStore.getState().executeCommandInWorkbench("doc-1", {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Renamed workbench",
      },
    });
    await useCanvasStore.getState().undo();
    useCanvasStore.setState({
      selectedElementIds: ["image-1"],
    });
    saveCanvasWorkbenchMock.mockResolvedValue(false);

    const redone = await useCanvasStore.getState().redo();

    expect(redone).toBe(false);
    expect(useCanvasStore.getState().workbenches[0]?.name).toBe(originalName);
    expect(useCanvasStore.getState().selectedElementIds).toEqual(["image-1"]);
    expect(useCanvasStore.getState().historyByWorkbenchId["doc-1"]).toEqual({
      past: [],
      future: [
        expect.objectContaining({
          commandType: "PATCH_DOCUMENT",
        }),
      ],
    });
  });

  it("returns null without side effects when the command target workbench is missing", async () => {
    saveCanvasWorkbenchMock.mockClear();

    const result = await useCanvasStore.getState().executeCommandInWorkbench("missing-doc", {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Missing",
      },
    });

    expect(result).toBeNull();
    expect(saveCanvasWorkbenchMock).not.toHaveBeenCalled();
  });
});
