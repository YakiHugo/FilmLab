import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { emit } from "@/lib/storeEvents";
import type { CanvasHistoryEntry, CanvasWorkbench } from "@/types";
import { normalizeCanvasWorkbench } from "@/features/canvas/studioPresets";
import { useCanvasStore } from "./canvasStore";

const deleteCanvasWorkbenchMock = vi.fn();
const loadCanvasWorkbenchesMock = vi.fn();
const saveCanvasWorkbenchMock = vi.fn();

vi.mock("@/lib/db", () => ({
  deleteCanvasWorkbench: (...args: unknown[]) => deleteCanvasWorkbenchMock(...args),
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
  forwardChangeSet: { operations: [] },
  inverseChangeSet: { operations: [] },
});

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return {
    promise,
    resolve,
    reject,
  };
};

const flushMicrotasks = async (count = 8) => {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
};

describe("canvasStore", () => {
  beforeEach(() => {
    emit("currentUser:reset");
    deleteCanvasWorkbenchMock.mockReset();
    deleteCanvasWorkbenchMock.mockResolvedValue(true);
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

  it("serializes commands on the same workbench so later commits see the latest state", async () => {
    const firstSave = createDeferred<boolean>();
    saveCanvasWorkbenchMock.mockReset();
    saveCanvasWorkbenchMock.mockReturnValueOnce(firstSave.promise).mockResolvedValue(true);

    const renamePromise = useCanvasStore.getState().executeCommandInWorkbench("doc-1", {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Renamed workbench",
      },
    });
    const recolorPromise = useCanvasStore.getState().executeCommandInWorkbench("doc-1", {
      type: "PATCH_DOCUMENT",
      patch: {
        backgroundColor: "#ffffff",
      },
    });

    await flushMicrotasks();

    expect(saveCanvasWorkbenchMock).toHaveBeenCalledTimes(1);

    firstSave.resolve(true);

    const [renamed, recolored] = await Promise.all([renamePromise, recolorPromise]);

    expect(renamed?.name).toBe("Renamed workbench");
    expect(recolored?.name).toBe("Renamed workbench");
    expect(recolored?.backgroundColor).toBe("#ffffff");
    expect(useCanvasStore.getState().workbenches[0]).toMatchObject({
      name: "Renamed workbench",
      backgroundColor: "#ffffff",
    });
    expect(saveCanvasWorkbenchMock).toHaveBeenCalledTimes(2);
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

  it("returns null and leaves state untouched when createWorkbench persistence fails", async () => {
    useCanvasStore.setState({
      activeWorkbenchId: null,
      workbenches: [],
      historyByWorkbenchId: {},
      selectedElementIds: [],
    });
    saveCanvasWorkbenchMock.mockResolvedValue(false);

    const created = await useCanvasStore.getState().createWorkbench("Failed create");

    expect(created).toBeNull();
    expect(useCanvasStore.getState().workbenches).toEqual([]);
    expect(useCanvasStore.getState().activeWorkbenchId).toBeNull();
  });

  it("does not patch a missing workbench", async () => {
    useCanvasStore.setState({
      activeWorkbenchId: null,
      workbenches: [],
      historyByWorkbenchId: {},
    });
    saveCanvasWorkbenchMock.mockClear();

    const result = await useCanvasStore.getState().patchWorkbench("doc-1", {
      name: "Missing workbench",
    });

    expect(result).toBeNull();
    expect(useCanvasStore.getState().workbenches).toEqual([]);
    expect(saveCanvasWorkbenchMock).not.toHaveBeenCalled();
  });

  it("returns false and preserves state when deleteWorkbench persistence fails", async () => {
    useCanvasStore.setState({
      historyByWorkbenchId: {
        "doc-1": {
          past: [createHistoryEntry("PATCH_DOCUMENT")],
          future: [],
        },
      },
      selectedElementIds: ["image-1"],
    });
    deleteCanvasWorkbenchMock.mockResolvedValue(false);

    const deleted = await useCanvasStore
      .getState()
      .deleteWorkbench("doc-1", { nextActiveWorkbenchId: null });

    expect(deleted).toBe(false);
    expect(useCanvasStore.getState().workbenches).toHaveLength(1);
    expect(useCanvasStore.getState().activeWorkbenchId).toBe("doc-1");
    expect(useCanvasStore.getState().selectedElementIds).toEqual(["image-1"]);
    expect(useCanvasStore.getState().historyByWorkbenchId["doc-1"]).toEqual({
      past: [expect.objectContaining({ commandType: "PATCH_DOCUMENT" })],
      future: [],
    });
  });

  it("returns false without deleting when deleteWorkbench target is missing", async () => {
    deleteCanvasWorkbenchMock.mockClear();

    const deleted = await useCanvasStore
      .getState()
      .deleteWorkbench("missing-doc", { nextActiveWorkbenchId: null });

    expect(deleted).toBe(false);
    expect(deleteCanvasWorkbenchMock).not.toHaveBeenCalled();
  });

  it("drops queued command commits after current user reset", async () => {
    const deferredSave = createDeferred<boolean>();
    saveCanvasWorkbenchMock.mockReset();
    saveCanvasWorkbenchMock.mockReturnValueOnce(deferredSave.promise);

    const commandPromise = useCanvasStore.getState().executeCommandInWorkbench("doc-1", {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Should be discarded",
      },
    });

    emit("currentUser:reset");
    deferredSave.resolve(true);

    const result = await commandPromise;

    expect(result).toBeNull();
    expect(useCanvasStore.getState().workbenches).toEqual([]);
    expect(useCanvasStore.getState().activeWorkbenchId).toBeNull();
  });

  it("skips queued createWorkbench work after current user reset", async () => {
    const deferredSave = createDeferred<boolean>();
    saveCanvasWorkbenchMock.mockReset();
    saveCanvasWorkbenchMock.mockReturnValueOnce(deferredSave.promise).mockResolvedValue(true);

    const commandPromise = useCanvasStore.getState().executeCommandInWorkbench("doc-1", {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Block lifecycle queue",
      },
    });
    const createPromise = useCanvasStore.getState().createWorkbench("Queued create");

    await flushMicrotasks();
    expect(saveCanvasWorkbenchMock).toHaveBeenCalledTimes(1);

    emit("currentUser:reset");
    deferredSave.resolve(true);

    const [commandResult, created] = await Promise.all([commandPromise, createPromise]);

    expect(commandResult).toBeNull();
    expect(created).toBeNull();
    expect(saveCanvasWorkbenchMock).toHaveBeenCalledTimes(1);
    expect(useCanvasStore.getState().workbenches).toEqual([]);
  });

  it("skips queued deleteWorkbench work after current user reset", async () => {
    const queuedDeleteId = "queued-delete";
    const deferredSave = createDeferred<boolean>();
    saveCanvasWorkbenchMock.mockReset();
    saveCanvasWorkbenchMock.mockReturnValueOnce(deferredSave.promise);

    const commandPromise = useCanvasStore.getState().executeCommandInWorkbench("doc-1", {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Block delete",
      },
    });
    const deletePromise = useCanvasStore
      .getState()
      .deleteWorkbench(queuedDeleteId, { nextActiveWorkbenchId: null });

    await flushMicrotasks();
    expect(saveCanvasWorkbenchMock).toHaveBeenCalledTimes(1);

    emit("currentUser:reset");
    deferredSave.resolve(true);

    const [commandResult, deleted] = await Promise.all([commandPromise, deletePromise]);

    expect(commandResult).toBeNull();
    expect(deleted).toBe(false);
    expect(deleteCanvasWorkbenchMock).not.toHaveBeenCalledWith(queuedDeleteId);
    expect(useCanvasStore.getState().workbenches).toEqual([]);
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
