import { beforeEach, describe, expect, it, vi } from "vitest";
import { materializeCanvasWorkbenchListEntry } from "@/features/canvas/store/canvasWorkbenchListEntry";
import { createEmptyHistoryState } from "@/features/canvas/store/canvasWorkbenchState";
import { normalizeCanvasWorkbench } from "@/features/canvas/studioPresets";
import { emit } from "@/lib/storeEvents";
import { createDefaultCanvasImageRenderState } from "@/render/image";
import type {
  Asset,
  CanvasEditableImageElement,
  CanvasEditableTextElement,
  CanvasWorkbench,
  CurrentUser,
} from "@/types";
import { useAssetStore } from "./assetStore";
import { useCanvasStore } from "./canvasStore";

const loadCanvasWorkbenchListEntriesByUserMock = vi.fn();
const loadCanvasWorkbenchMock = vi.fn();
const saveCanvasWorkbenchRecordMock = vi.fn();
const deleteCanvasWorkbenchRecordMock = vi.fn();

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    deleteCanvasWorkbenchRecord: (...args: unknown[]) =>
      deleteCanvasWorkbenchRecordMock(...args),
    loadCanvasWorkbench: (...args: unknown[]) => loadCanvasWorkbenchMock(...args),
    loadCanvasWorkbenchListEntriesByUser: (...args: unknown[]) =>
      loadCanvasWorkbenchListEntriesByUserMock(...args),
    saveCanvasWorkbenchRecord: (...args: unknown[]) => saveCanvasWorkbenchRecordMock(...args),
  };
});

const currentUser: CurrentUser = {
  id: "local-user",
  name: "Local User",
  createdAt: "2026-03-28T00:00:00.000Z",
  updatedAt: "2026-03-28T00:00:00.000Z",
};

const createWorkbench = (id = "doc-1", name = "Workbench"): CanvasWorkbench =>
  normalizeCanvasWorkbench({
    id,
    version: 5,
    ownerRef: { userId: currentUser.id },
    name,
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
    preferredCoverAssetId: null,
    createdAt: "2026-03-17T00:00:00.000Z",
    updatedAt: "2026-03-17T00:00:00.000Z",
  });

const installLoadedWorkbench = (workbench = createWorkbench()) => {
  useCanvasStore.setState({
    workbenchList: [materializeCanvasWorkbenchListEntry(workbench)],
    loadedWorkbenchId: workbench.id,
    workbench,
    workbenchDraft: null,
    workbenchHistory: createEmptyHistoryState(),
    workbenchInteraction: null,
    selectedElementIds: [],
    activePanel: null,
    tool: "select",
    viewport: { x: 0, y: 0 },
    zoom: 1,
  });
  return workbench;
};

const getLoadedWorkbench = () => {
  const state = useCanvasStore.getState();
  return state.workbenchDraft ?? state.workbench;
};

const getImageElement = (workbench: CanvasWorkbench) => {
  const element = workbench.elements.find((candidate) => candidate.id === "image-1");
  if (!element || element.type !== "image") {
    throw new Error("Expected image element.");
  }
  return element;
};

const getTextElement = (workbench: CanvasWorkbench) => {
  const element = workbench.elements.find((candidate) => candidate.id === "text-1");
  if (!element || element.type !== "text") {
    throw new Error("Expected text element.");
  }
  return element;
};

const createAsset = (overrides: Partial<Asset> = {}): Asset => ({
  id: overrides.id ?? "asset-1",
  name: overrides.name ?? "asset-1.jpg",
  type: overrides.type ?? "image/jpeg",
  size: overrides.size ?? 1024,
  createdAt: overrides.createdAt ?? "2026-03-28T00:00:00.000Z",
  objectUrl: overrides.objectUrl ?? "blob:asset-1",
  thumbnailUrl: overrides.thumbnailUrl ?? "blob:asset-1-thumb",
  metadata: overrides.metadata,
  contentHash: overrides.contentHash,
  ownerRef: overrides.ownerRef,
});

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

const flushMicrotasks = async (count = 8) => {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
};

describe("canvasStore", () => {
  beforeEach(() => {
    loadCanvasWorkbenchListEntriesByUserMock.mockReset();
    loadCanvasWorkbenchMock.mockReset();
    saveCanvasWorkbenchRecordMock.mockReset();
    deleteCanvasWorkbenchRecordMock.mockReset();
    loadCanvasWorkbenchListEntriesByUserMock.mockResolvedValue([]);
    loadCanvasWorkbenchMock.mockResolvedValue(null);
    saveCanvasWorkbenchRecordMock.mockResolvedValue(true);
    deleteCanvasWorkbenchRecordMock.mockResolvedValue(true);
    emit("currentUser:reset");
    useAssetStore.setState({
      assets: [],
      currentUser,
      isLoading: false,
    });
    useCanvasStore.setState({
      tool: "select",
      activeShapeType: "rect",
    });
  });

  it("deduplicates selection ids and opens the edit panel through an explicit action", () => {
    useCanvasStore.getState().setSelectedElementIds(["image-1", "text-1", "image-1"]);
    expect(useCanvasStore.getState().selectedElementIds).toEqual(["image-1", "text-1"]);

    useCanvasStore.setState({
      tool: "shape",
      activePanel: null,
    });
    useCanvasStore.getState().openEditPanel();
    expect(useCanvasStore.getState().activePanel).toBe("edit");
    expect(useCanvasStore.getState().tool).toBe("select");
  });

  it("keeps panels exclusive with text and shape tools", () => {
    useCanvasStore.setState({
      activePanel: "library",
      tool: "select",
    });

    useCanvasStore.getState().setTool("text");
    expect(useCanvasStore.getState().tool).toBe("text");
    expect(useCanvasStore.getState().activePanel).toBeNull();

    useCanvasStore.getState().setActivePanel("layers");
    expect(useCanvasStore.getState().tool).toBe("select");
    expect(useCanvasStore.getState().activePanel).toBe("layers");

    useCanvasStore.getState().togglePanel("layers");
    expect(useCanvasStore.getState().activePanel).toBeNull();

    useCanvasStore.getState().setTool("shape");
    expect(useCanvasStore.getState().tool).toBe("shape");
    expect(useCanvasStore.getState().activePanel).toBeNull();
  });

  it("persists image render-state updates even when geometry is unchanged", async () => {
    const workbench = installLoadedWorkbench();
    const imageElement = getImageElement(workbench);
    const nextRenderState = imageElement.renderState ?? createDefaultCanvasImageRenderState();
    nextRenderState.develop.tone.exposure = 18;
    saveCanvasWorkbenchRecordMock.mockClear();

    const nextElement: CanvasEditableImageElement = {
      id: imageElement.id,
      type: "image",
      parentId: imageElement.parentId,
      x: imageElement.x,
      y: imageElement.y,
      width: imageElement.width,
      height: imageElement.height,
      rotation: imageElement.rotation,
      transform: { ...imageElement.transform },
      opacity: imageElement.opacity,
      locked: imageElement.locked,
      visible: imageElement.visible,
      assetId: imageElement.assetId,
      renderState: nextRenderState,
    };

    await useCanvasStore.getState().upsertElementInWorkbench(workbench.id, nextElement);

    const updatedWorkbench = getLoadedWorkbench();
    const updatedImageElement = updatedWorkbench ? getImageElement(updatedWorkbench) : null;
    expect(updatedImageElement?.renderState?.develop.tone.exposure).toBe(18);
    expect(saveCanvasWorkbenchRecordMock).toHaveBeenCalledTimes(1);
  });

  it("persists text content updates without requiring transform changes", async () => {
    const workbench = installLoadedWorkbench();
    const textElement = getTextElement(workbench);
    saveCanvasWorkbenchRecordMock.mockClear();

    const nextElement: CanvasEditableTextElement = {
      id: textElement.id,
      type: "text",
      parentId: textElement.parentId,
      x: textElement.x,
      y: textElement.y,
      width: textElement.width,
      height: textElement.height,
      rotation: textElement.rotation,
      transform: { ...textElement.transform },
      opacity: textElement.opacity,
      locked: textElement.locked,
      visible: textElement.visible,
      content: "Updated copy",
      fontFamily: textElement.fontFamily,
      fontSize: textElement.fontSize,
      fontSizeTier: textElement.fontSizeTier,
      color: textElement.color,
      textAlign: textElement.textAlign,
    };

    await useCanvasStore.getState().upsertElementInWorkbench(workbench.id, nextElement);

    const updatedWorkbench = getLoadedWorkbench();
    const updatedTextElement = updatedWorkbench ? getTextElement(updatedWorkbench) : null;
    expect(updatedTextElement?.content).toBe("Updated copy");
    expect(saveCanvasWorkbenchRecordMock).toHaveBeenCalledTimes(1);
  });

  it("canonicalizes inserted image nodes through the same asset-aware render-state ingress", async () => {
    const workbench = installLoadedWorkbench();
    useAssetStore.setState({
      assets: [
        createAsset({
          id: "asset-2",
          objectUrl: "blob:asset-2",
        }),
      ],
      currentUser,
      isLoading: false,
    });

    const insertedElement: CanvasEditableImageElement = {
      id: "image-2",
      type: "image",
      assetId: "asset-2",
      parentId: null,
      x: 120,
      y: 140,
      width: 320,
      height: 180,
      rotation: 0,
      transform: {
        x: 120,
        y: 140,
        width: 320,
        height: 180,
        rotation: 0,
      },
      opacity: 1,
      locked: false,
      visible: true,
    };

    await useCanvasStore.getState().upsertElementInWorkbench(workbench.id, insertedElement);

    const updatedWorkbench = getLoadedWorkbench();
    const nextElement =
      updatedWorkbench?.elements.find((candidate) => candidate.id === "image-2") ?? null;
    if (!nextElement || nextElement.type !== "image") {
      throw new Error("Expected inserted image element.");
    }
    const nextImageElement = nextElement;

    expect(nextImageElement).toMatchObject({
      id: "image-2",
      assetId: "asset-2",
      renderState: {
        develop: {
          tone: {
            exposure: 0,
          },
        },
      },
    });
  });

  it("previews interaction updates in draft state and commits them into the loaded workbench", async () => {
    const workbench = installLoadedWorkbench();
    const interaction = useCanvasStore.getState().beginInteractionInWorkbench(workbench.id);
    if (!interaction) {
      throw new Error("Expected interaction.");
    }

    expect(useCanvasStore.getState().workbenchInteraction).toEqual({
      active: true,
      pendingCommits: 0,
      queuedMutations: 0,
    });

    const preview = useCanvasStore.getState().previewCommandInWorkbench(workbench.id, interaction.interactionId, {
      type: "MOVE_NODES",
      ids: ["image-1"],
      dx: 10,
      dy: 0,
    });

    expect(preview?.nodes["image-1"]?.transform.x).toBe(20);
    expect(useCanvasStore.getState().workbench?.nodes["image-1"]?.transform.x).toBe(10);
    expect(useCanvasStore.getState().workbenchDraft?.nodes["image-1"]?.transform.x).toBe(20);

    const committed = await useCanvasStore
      .getState()
      .commitInteractionInWorkbench(workbench.id, interaction.interactionId);

    expect(committed?.nodes["image-1"]?.transform.x).toBe(20);
    expect(useCanvasStore.getState().workbenchDraft).toBeNull();
    expect(useCanvasStore.getState().workbench?.nodes["image-1"]?.transform.x).toBe(20);
    expect(useCanvasStore.getState().workbenchInteraction).toBeNull();
    expect(useCanvasStore.getState().workbenchHistory?.entries).toHaveLength(1);
    expect(useCanvasStore.getState().workbenchHistory?.cursor).toBe(1);
    expect(saveCanvasWorkbenchRecordMock).toHaveBeenCalledTimes(1);
  });

  it("clears tracked interaction state when switching workbenches", async () => {
    const workbench = installLoadedWorkbench(createWorkbench("doc-1", "One"));
    const otherWorkbench = createWorkbench("doc-2", "Two");
    const interaction = useCanvasStore.getState().beginInteractionInWorkbench(workbench.id);
    if (!interaction) {
      throw new Error("Expected interaction.");
    }

    loadCanvasWorkbenchMock.mockResolvedValueOnce(otherWorkbench).mockResolvedValueOnce(workbench);

    const openedOther = await useCanvasStore.getState().openWorkbench(otherWorkbench.id);
    expect(openedOther?.id).toBe(otherWorkbench.id);

    const reopened = await useCanvasStore.getState().openWorkbench(workbench.id);
    expect(reopened?.id).toBe(workbench.id);

    const nextInteraction = useCanvasStore.getState().beginInteractionInWorkbench(workbench.id);
    expect(nextInteraction).not.toBeNull();
  });

  it("rolls back interaction previews to the last committed workbench", () => {
    const workbench = installLoadedWorkbench();
    const interaction = useCanvasStore.getState().beginInteractionInWorkbench(workbench.id);
    if (!interaction) {
      throw new Error("Expected interaction.");
    }

    useCanvasStore.getState().previewCommandInWorkbench(workbench.id, interaction.interactionId, {
      type: "MOVE_NODES",
      ids: ["image-1"],
      dx: 10,
      dy: 0,
    });

    const rolledBack = useCanvasStore
      .getState()
      .rollbackInteractionInWorkbench(workbench.id, interaction.interactionId);

    expect(rolledBack?.nodes["image-1"]?.transform.x).toBe(10);
    expect(useCanvasStore.getState().workbench?.nodes["image-1"]?.transform.x).toBe(10);
    expect(useCanvasStore.getState().workbenchDraft).toBeNull();
    expect(useCanvasStore.getState().workbenchHistory).toEqual(createEmptyHistoryState());
    expect(useCanvasStore.getState().workbenchInteraction).toBeNull();
  });

  it("blocks ordinary commands while an interaction is open", async () => {
    const workbench = installLoadedWorkbench();
    const interaction = useCanvasStore.getState().beginInteractionInWorkbench(workbench.id);
    if (!interaction) {
      throw new Error("Expected interaction.");
    }

    const result = await useCanvasStore.getState().executeCommandInWorkbench(workbench.id, {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Blocked during interaction",
      },
    });

    expect(result).toBeNull();
    expect(useCanvasStore.getState().workbench?.name).toBe("Workbench");
    expect(saveCanvasWorkbenchRecordMock).not.toHaveBeenCalled();
  });

  it("blocks ordinary commands while an interaction commit is still pending", async () => {
    const workbench = installLoadedWorkbench();
    const deferredSave = createDeferred<boolean>();
    saveCanvasWorkbenchRecordMock.mockReset();
    saveCanvasWorkbenchRecordMock.mockReturnValueOnce(deferredSave.promise);

    const interaction = useCanvasStore.getState().beginInteractionInWorkbench(workbench.id);
    if (!interaction) {
      throw new Error("Expected interaction.");
    }

    useCanvasStore.getState().previewCommandInWorkbench(workbench.id, interaction.interactionId, {
      type: "MOVE_NODES",
      ids: ["image-1"],
      dx: 10,
      dy: 0,
    });
    const commitPromise = useCanvasStore
      .getState()
      .commitInteractionInWorkbench(workbench.id, interaction.interactionId);

    await flushMicrotasks();

    expect(useCanvasStore.getState().workbenchInteraction).toEqual({
      active: false,
      pendingCommits: 1,
      queuedMutations: 0,
    });

    const blockedCommand = await useCanvasStore.getState().executeCommandInWorkbench(workbench.id, {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Blocked while pending",
      },
    });

    expect(blockedCommand).toBeNull();
    expect(saveCanvasWorkbenchRecordMock).toHaveBeenCalledTimes(1);

    deferredSave.resolve(true);
    await commitPromise;

    expect(useCanvasStore.getState().workbench?.name).toBe("Workbench");
  });

  it("serializes commands on the loaded workbench so later commits see the latest state", async () => {
    const workbench = installLoadedWorkbench();
    const firstSave = createDeferred<boolean>();
    saveCanvasWorkbenchRecordMock.mockReset();
    saveCanvasWorkbenchRecordMock.mockReturnValueOnce(firstSave.promise).mockResolvedValue(true);

    const renamePromise = useCanvasStore.getState().executeCommandInWorkbench(workbench.id, {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Renamed workbench",
      },
    });
    const recolorPromise = useCanvasStore.getState().executeCommandInWorkbench(workbench.id, {
      type: "PATCH_DOCUMENT",
      patch: {
        backgroundColor: "#ffffff",
      },
    });

    await flushMicrotasks();
    expect(saveCanvasWorkbenchRecordMock).toHaveBeenCalledTimes(1);

    firstSave.resolve(true);

    const [renamed, recolored] = await Promise.all([renamePromise, recolorPromise]);

    expect(renamed?.name).toBe("Renamed workbench");
    expect(recolored?.name).toBe("Renamed workbench");
    expect(recolored?.backgroundColor).toBe("#ffffff");
    expect(useCanvasStore.getState().workbench).toMatchObject({
      name: "Renamed workbench",
      backgroundColor: "#ffffff",
    });
    expect(saveCanvasWorkbenchRecordMock).toHaveBeenCalledTimes(2);
  });

  it("ignores stale background init results after a mutation updates the workbench list", async () => {
    const deferredList = createDeferred<ReturnType<typeof materializeCanvasWorkbenchListEntry>[]>();
    loadCanvasWorkbenchListEntriesByUserMock.mockReset();
    loadCanvasWorkbenchListEntriesByUserMock
      .mockReturnValueOnce(deferredList.promise)
      .mockImplementation(() => Promise.resolve(useCanvasStore.getState().workbenchList));

    const initPromise = useCanvasStore.getState().init();
    await flushMicrotasks();

    const created = await useCanvasStore.getState().createWorkbench("Created from mutation");
    expect(created).not.toBeNull();
    expect(useCanvasStore.getState().workbenchList[0]?.id).toBe(created?.id);

    deferredList.resolve([]);
    await initPromise;

    expect(useCanvasStore.getState().workbenchList.map((entry) => entry.id)).toContain(
      created?.id ?? ""
    );
  });

  it("undo and redo clear selection and move the single-session history", async () => {
    const workbench = installLoadedWorkbench();
    const originalName = workbench.name;

    await useCanvasStore.getState().executeCommandInWorkbench(workbench.id, {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Renamed workbench",
      },
    });
    useCanvasStore.setState({
      selectedElementIds: ["image-1", "text-1"],
    });

    const undone = await useCanvasStore.getState().undoInWorkbench(workbench.id);

    expect(undone).toBe(true);
    expect(useCanvasStore.getState().workbench?.name).toBe(originalName);
    expect(useCanvasStore.getState().selectedElementIds).toEqual([]);
    expect(useCanvasStore.getState().workbenchHistory).toEqual({
      entries: [expect.objectContaining({ commandType: "PATCH_DOCUMENT" })],
      cursor: 0,
    });

    useCanvasStore.setState({
      selectedElementIds: ["image-1"],
    });

    const redone = await useCanvasStore.getState().redoInWorkbench(workbench.id);

    expect(redone).toBe(true);
    expect(useCanvasStore.getState().workbench?.name).toBe("Renamed workbench");
    expect(useCanvasStore.getState().selectedElementIds).toEqual([]);
    expect(useCanvasStore.getState().workbenchHistory).toEqual({
      entries: [expect.objectContaining({ commandType: "PATCH_DOCUMENT" })],
      cursor: 1,
    });
  });

  it("returns false and preserves state when deleteWorkbench persistence fails", async () => {
    const workbench = installLoadedWorkbench();
    useCanvasStore.setState({
      selectedElementIds: ["image-1"],
      workbenchHistory: {
        entries: [
          {
            commandType: "PATCH_DOCUMENT",
            delta: { operations: [] },
          },
        ],
        cursor: 1,
      },
    });
    deleteCanvasWorkbenchRecordMock.mockResolvedValue(false);

    const deleted = await useCanvasStore.getState().deleteWorkbench(workbench.id);

    expect(deleted).toBe(false);
    expect(useCanvasStore.getState().loadedWorkbenchId).toBe(workbench.id);
    expect(useCanvasStore.getState().workbench?.id).toBe(workbench.id);
    expect(useCanvasStore.getState().selectedElementIds).toEqual(["image-1"]);
    expect(useCanvasStore.getState().workbenchHistory?.entries).toHaveLength(1);
    expect(useCanvasStore.getState().workbenchHistory?.cursor).toBe(1);
  });

  it("deletes the loaded workbench session and clears selection and history", async () => {
    const workbench = installLoadedWorkbench();
    useCanvasStore.setState({
      selectedElementIds: ["image-1"],
      workbenchHistory: {
        entries: [
          {
            commandType: "PATCH_DOCUMENT",
            delta: { operations: [] },
          },
        ],
        cursor: 1,
      },
    });

    const deleted = await useCanvasStore.getState().deleteWorkbench(workbench.id);

    expect(deleted).toBe(true);
    expect(useCanvasStore.getState().workbenchList).toEqual([]);
    expect(useCanvasStore.getState().loadedWorkbenchId).toBeNull();
    expect(useCanvasStore.getState().workbench).toBeNull();
    expect(useCanvasStore.getState().workbenchDraft).toBeNull();
    expect(useCanvasStore.getState().selectedElementIds).toEqual([]);
    expect(useCanvasStore.getState().workbenchHistory).toBeNull();
    expect(useCanvasStore.getState().workbenchInteraction).toBeNull();
  });

  it("drops queued command commits after current user reset", async () => {
    const workbench = installLoadedWorkbench();
    const deferredSave = createDeferred<boolean>();
    saveCanvasWorkbenchRecordMock.mockReset();
    saveCanvasWorkbenchRecordMock.mockReturnValueOnce(deferredSave.promise);

    const commandPromise = useCanvasStore.getState().executeCommandInWorkbench(workbench.id, {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Should be discarded",
      },
    });

    emit("currentUser:reset");
    deferredSave.resolve(true);

    const result = await commandPromise;

    expect(result).toBeNull();
    expect(useCanvasStore.getState().workbenchList).toEqual([]);
    expect(useCanvasStore.getState().loadedWorkbenchId).toBeNull();
    expect(useCanvasStore.getState().workbench).toBeNull();
    expect(useCanvasStore.getState().workbenchDraft).toBeNull();
  });

  it("skips queued createWorkbench work after current user reset", async () => {
    const workbench = installLoadedWorkbench();
    const deferredSave = createDeferred<boolean>();
    saveCanvasWorkbenchRecordMock.mockReset();
    saveCanvasWorkbenchRecordMock.mockReturnValueOnce(deferredSave.promise).mockResolvedValue(true);

    const commandPromise = useCanvasStore.getState().executeCommandInWorkbench(workbench.id, {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Block lifecycle queue",
      },
    });
    const createPromise = useCanvasStore.getState().createWorkbench("Queued create");

    await flushMicrotasks();
    expect(saveCanvasWorkbenchRecordMock).toHaveBeenCalledTimes(1);

    emit("currentUser:reset");
    deferredSave.resolve(true);

    const [commandResult, created] = await Promise.all([commandPromise, createPromise]);

    expect(commandResult?.id).toBe(workbench.id);
    expect(created).toBeNull();
    expect(saveCanvasWorkbenchRecordMock).toHaveBeenCalledTimes(1);
    expect(useCanvasStore.getState().workbenchList).toEqual([]);
    expect(useCanvasStore.getState().loadedWorkbenchId).toBeNull();
  });

  it("does not reopen a workbench after current user reset invalidates an in-flight open", async () => {
    const workbench = createWorkbench("doc-open", "Open target");
    const deferredLoad = createDeferred<CanvasWorkbench | null>();
    loadCanvasWorkbenchMock.mockReset();
    loadCanvasWorkbenchMock.mockReturnValueOnce(deferredLoad.promise);

    const openPromise = useCanvasStore.getState().openWorkbench(workbench.id);
    await flushMicrotasks();

    emit("currentUser:reset");
    deferredLoad.resolve(workbench);

    const opened = await openPromise;

    expect(opened).toBeNull();
    expect(useCanvasStore.getState().workbenchList).toEqual([]);
    expect(useCanvasStore.getState().loadedWorkbenchId).toBeNull();
    expect(useCanvasStore.getState().workbench).toBeNull();
  });

  it("skips queued deleteWorkbench work after current user reset", async () => {
    const workbench = installLoadedWorkbench();
    const deferredSave = createDeferred<boolean>();
    saveCanvasWorkbenchRecordMock.mockReset();
    saveCanvasWorkbenchRecordMock.mockReturnValueOnce(deferredSave.promise);

    const commandPromise = useCanvasStore.getState().executeCommandInWorkbench(workbench.id, {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Block delete",
      },
    });
    const deletePromise = useCanvasStore.getState().deleteWorkbench(workbench.id);

    await flushMicrotasks();
    expect(saveCanvasWorkbenchRecordMock).toHaveBeenCalledTimes(1);

    emit("currentUser:reset");
    deferredSave.resolve(true);

    const [commandResult, deleted] = await Promise.all([commandPromise, deletePromise]);

    expect(commandResult?.id).toBe(workbench.id);
    expect(deleted).toBe(false);
    expect(deleteCanvasWorkbenchRecordMock).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().workbenchList).toEqual([]);
    expect(useCanvasStore.getState().loadedWorkbenchId).toBeNull();
  });
});
