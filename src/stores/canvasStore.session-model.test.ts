import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCanvasWorkbenchSnapshot } from "@/features/canvas/documentGraph";
import { normalizeCanvasWorkbench } from "@/features/canvas/studioPresets";
import { emit } from "@/lib/storeEvents";
import type { CanvasWorkbench, CanvasWorkbenchListEntry, CurrentUser } from "@/types";
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
    version: 4,
    ownerRef: { userId: currentUser.id },
    name,
    width: 1200,
    height: 800,
    presetId: "custom",
    backgroundColor: "#050505",
    nodes: {},
    rootIds: [],
    groupChildren: {},
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

const createListEntry = (
  id = "doc-1",
  name = "Workbench"
): CanvasWorkbenchListEntry => ({
  id,
  name,
  createdAt: "2026-03-17T00:00:00.000Z",
  updatedAt: "2026-03-17T00:00:00.000Z",
  presetId: "custom",
  width: 1200,
  height: 800,
  elementCount: 0,
  coverAssetId: null,
});

describe("canvasStore session model", () => {
  beforeEach(() => {
    loadCanvasWorkbenchListEntriesByUserMock.mockReset();
    loadCanvasWorkbenchMock.mockReset();
    saveCanvasWorkbenchRecordMock.mockReset();
    deleteCanvasWorkbenchRecordMock.mockReset();
    saveCanvasWorkbenchRecordMock.mockResolvedValue(true);
    deleteCanvasWorkbenchRecordMock.mockResolvedValue(true);
    emit("currentUser:reset");
    useAssetStore.setState({
      assets: [],
      currentUser,
      isLoading: false,
    });
  });

  it("init only loads the workbench list and leaves detail unloaded", async () => {
    loadCanvasWorkbenchListEntriesByUserMock.mockResolvedValue([createListEntry()]);

    await useCanvasStore.getState().init();

    const state = useCanvasStore.getState();
    expect(loadCanvasWorkbenchListEntriesByUserMock).toHaveBeenCalledTimes(1);
    expect(loadCanvasWorkbenchMock).not.toHaveBeenCalled();
    expect(state.workbenchList).toEqual([createListEntry()]);
    expect(state.loadedWorkbenchId).toBeNull();
    expect(state.workbench).toBeNull();
    expect(state.workbenchDraft).toBeNull();
  });

  it("openWorkbench loads the requested detail into the single editor session", async () => {
    const workbench = createWorkbench("doc-1", "Opened");
    loadCanvasWorkbenchMock.mockResolvedValue(getCanvasWorkbenchSnapshot(workbench));
    useCanvasStore.setState({
      workbenchList: [createListEntry("doc-1", "Stale Name")],
    });

    const result = await useCanvasStore.getState().openWorkbench("doc-1");

    const state = useCanvasStore.getState();
    expect(result?.id).toBe("doc-1");
    expect(loadCanvasWorkbenchMock).toHaveBeenCalledWith("doc-1");
    expect(state.loadedWorkbenchId).toBe("doc-1");
    expect(state.workbench?.id).toBe("doc-1");
    expect(state.workbenchDraft).toBeNull();
    expect(state.workbenchList[0]).toEqual(createListEntry("doc-1", "Opened"));
    expect(state.selectedElementIds).toEqual([]);
  });

  it("createWorkbench can persist a new list entry without opening the session", async () => {
    const created = await useCanvasStore
      .getState()
      .createWorkbench("Fresh", { openAfterCreate: false });

    const state = useCanvasStore.getState();
    expect(created?.name).toBe("Fresh");
    expect(saveCanvasWorkbenchRecordMock).toHaveBeenCalledTimes(1);
    expect(state.workbenchList[0]?.id).toBe(created?.id);
    expect(state.loadedWorkbenchId).toBeNull();
    expect(state.workbench).toBeNull();
    expect(state.workbenchDraft).toBeNull();
  });
});
