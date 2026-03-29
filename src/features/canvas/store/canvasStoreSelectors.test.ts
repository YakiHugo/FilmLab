import { describe, expect, it } from "vitest";
import type { CanvasStoreDataState } from "./canvasStoreTypes";
import {
  selectCanvasLoadedWorkbenchState,
  selectLoadedWorkbench,
  selectLoadedWorkbenchRootCount,
  selectCanRedoOnLoadedWorkbench,
  selectCanRedoInWorkbench,
  selectCanUndoOnLoadedWorkbench,
  selectCanUndoInWorkbench,
  selectResolvedLoadedWorkbenchId,
} from "./canvasStoreSelectors";

const createState = (): CanvasStoreDataState => ({
  workbenchList: [
    {
      id: "workbench-1",
      name: "Workbench One",
      createdAt: "2026-03-28T00:00:00.000Z",
      updatedAt: "2026-03-28T00:00:00.000Z",
      presetId: "custom",
      width: 1080,
      height: 1350,
      elementCount: 0,
      coverAssetId: null,
    },
    {
      id: "workbench-2",
      name: "Workbench Two",
      createdAt: "2026-03-28T00:00:00.000Z",
      updatedAt: "2026-03-28T00:00:00.000Z",
      presetId: "custom",
      width: 1080,
      height: 1350,
      elementCount: 0,
      coverAssetId: null,
    },
  ],
  loadedWorkbenchId: "workbench-1",
  workbench: {
    id: "workbench-1",
    version: 5,
    ownerRef: {
      userId: "user-1",
    },
    name: "Workbench One",
    width: 1080,
    height: 1350,
    presetId: "custom",
    backgroundColor: "#000000",
    nodes: {},
    rootIds: ["node-1", "node-2"],
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
    createdAt: "2026-03-28T00:00:00.000Z",
    updatedAt: "2026-03-28T00:00:00.000Z",
    allNodes: [],
    elements: [],
  } as CanvasStoreDataState["workbench"],
  workbenchDraft: null,
  selectedElementIds: [],
  tool: "select",
  activeShapeType: "rect",
  zoom: 1,
  viewport: { x: 0, y: 0 },
  activePanel: null,
  isLoading: false,
  workbenchHistory: {
    entries: [
      {
        commandType: "PATCH_DOCUMENT",
        delta: { operations: [] },
      },
    ],
    cursor: 1,
  },
  workbenchInteraction: null,
});

describe("canvasStoreSelectors", () => {
  it("resolves the loaded workbench and root count from canonical selectors", () => {
    const state = createState();

    expect(selectLoadedWorkbench(state)?.id).toBe("workbench-1");
    expect(selectResolvedLoadedWorkbenchId(state)).toBe("workbench-1");
    expect(selectLoadedWorkbenchRootCount(state)).toBe(2);
    expect(selectCanvasLoadedWorkbenchState(state)).toMatchObject({
      loadedWorkbench: state.workbench,
      loadedWorkbenchId: "workbench-1",
      loadedWorkbenchRootCount: 2,
      slices: [],
    });
  });

  it("reports undo and redo availability per workbench id", () => {
    const state = createState();

    expect(selectCanUndoInWorkbench(state, "workbench-1")).toBe(true);
    expect(selectCanRedoInWorkbench(state, "workbench-1")).toBe(false);
    expect(selectCanUndoInWorkbench(state, "workbench-2")).toBe(false);
    expect(selectCanRedoInWorkbench(state, "workbench-2")).toBe(false);
    expect(selectCanUndoInWorkbench(state, null)).toBe(false);
    expect(selectCanRedoInWorkbench(state, null)).toBe(false);
  });

  it("suppresses undo and redo while interaction history is still pending", () => {
    const state = createState();
    state.workbenchInteraction = {
      active: false,
      pendingCommits: 1,
      queuedMutations: 0,
    };

    expect(selectCanUndoInWorkbench(state, "workbench-1")).toBe(false);
    expect(selectCanRedoInWorkbench(state, "workbench-2")).toBe(false);
  });

  it("suppresses undo and redo while queued mutations still block interactions", () => {
    const state = createState();
    state.workbenchInteraction = {
      active: false,
      pendingCommits: 0,
      queuedMutations: 1,
    };

    expect(selectCanUndoInWorkbench(state, "workbench-1")).toBe(false);
    expect(selectCanRedoInWorkbench(state, "workbench-1")).toBe(false);
  });

  it("treats missing loaded workbench ids as unavailable history", () => {
    const state = createState();

    state.loadedWorkbenchId = "missing-workbench";
    state.workbench = null;
    state.workbenchHistory = {
      entries: [
        {
          commandType: "PATCH_DOCUMENT",
          delta: { operations: [] },
        },
        {
          commandType: "PATCH_DOCUMENT",
          delta: { operations: [] },
        },
      ],
      cursor: 1,
    };

    expect(selectCanUndoOnLoadedWorkbench(state)).toBe(false);
    expect(selectCanRedoOnLoadedWorkbench(state)).toBe(false);
  });

  it("treats missing loaded workbench ids as unavailable history even with redo entries", () => {
    const state = createState();

    state.loadedWorkbenchId = "missing-workbench";
    state.workbench = null;
    state.workbenchHistory = {
      entries: [
        {
          commandType: "PATCH_DOCUMENT",
          delta: { operations: [] },
        },
      ],
      cursor: 0,
    };

    expect(selectCanUndoOnLoadedWorkbench(state)).toBe(false);
    expect(selectCanRedoOnLoadedWorkbench(state)).toBe(false);
  });

  it("collapses missing loaded workbench state to the null-safe read model", () => {
    const state = createState();
    state.loadedWorkbenchId = "missing-workbench";
    state.workbench = null;

    expect(selectResolvedLoadedWorkbenchId(state)).toBeNull();
    expect(selectCanvasLoadedWorkbenchState(state)).toEqual({
      loadedWorkbench: null,
      loadedWorkbenchId: null,
      loadedWorkbenchRootCount: 0,
      slices: [],
    });
  });
});
