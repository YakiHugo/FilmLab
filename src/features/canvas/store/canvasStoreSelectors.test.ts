import { describe, expect, it } from "vitest";
import type { CanvasStoreDataState } from "./canvasStoreTypes";
import {
  selectCanvasActiveWorkbenchState,
  selectActiveWorkbench,
  selectActiveWorkbenchRootCount,
  selectCanRedoOnActiveWorkbench,
  selectCanRedoInWorkbench,
  selectCanUndoOnActiveWorkbench,
  selectCanUndoInWorkbench,
  selectResolvedActiveWorkbenchId,
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
    version: 4,
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
    past: [
      {
        commandType: "PATCH_DOCUMENT",
        forwardChangeSet: { operations: [] },
        inverseChangeSet: { operations: [] },
      },
    ],
    future: [],
  },
  workbenchInteraction: null,
});

describe("canvasStoreSelectors", () => {
  it("resolves the active workbench and root count from canonical selectors", () => {
    const state = createState();

    expect(selectActiveWorkbench(state)?.id).toBe("workbench-1");
    expect(selectResolvedActiveWorkbenchId(state)).toBe("workbench-1");
    expect(selectActiveWorkbenchRootCount(state)).toBe(2);
    expect(selectCanvasActiveWorkbenchState(state)).toMatchObject({
      activeWorkbench: state.workbench,
      activeWorkbenchId: "workbench-1",
      activeWorkbenchRootCount: 2,
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

  it("treats missing active workbench ids as unavailable history", () => {
    const state = createState();

    state.loadedWorkbenchId = "missing-workbench";
    state.workbench = null;
    state.workbenchHistory = {
      past: [
        {
          commandType: "PATCH_DOCUMENT",
          forwardChangeSet: { operations: [] },
          inverseChangeSet: { operations: [] },
        },
      ],
      future: [
        {
          commandType: "PATCH_DOCUMENT",
          forwardChangeSet: { operations: [] },
          inverseChangeSet: { operations: [] },
        },
      ],
    };

    expect(selectCanUndoOnActiveWorkbench(state)).toBe(false);
    expect(selectCanRedoOnActiveWorkbench(state)).toBe(false);
  });

  it("collapses missing active workbench state to the null-safe read model", () => {
    const state = createState();
    state.loadedWorkbenchId = "missing-workbench";
    state.workbench = null;

    expect(selectResolvedActiveWorkbenchId(state)).toBeNull();
    expect(selectCanvasActiveWorkbenchState(state)).toEqual({
      activeWorkbench: null,
      activeWorkbenchId: null,
      activeWorkbenchRootCount: 0,
      slices: [],
    });
  });
});
