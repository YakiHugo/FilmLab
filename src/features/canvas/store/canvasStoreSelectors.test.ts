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
  workbenches: [
    {
      id: "workbench-1",
      name: "Workbench One",
      rootIds: ["node-1", "node-2"],
    },
    {
      id: "workbench-2",
      name: "Workbench Two",
      rootIds: [],
    },
  ] as CanvasStoreDataState["workbenches"],
  activeWorkbenchId: "workbench-1",
  selectedElementIds: [],
  tool: "select",
  activeShapeType: "rect",
  zoom: 1,
  viewport: { x: 0, y: 0 },
  activePanel: null,
  isLoading: false,
  historyByWorkbenchId: {
    "workbench-1": {
      past: [
        {
          commandType: "PATCH_DOCUMENT",
          forwardChangeSet: { operations: [] },
          inverseChangeSet: { operations: [] },
        },
      ],
      future: [],
    },
    "workbench-2": {
      past: [],
      future: [
        {
          commandType: "PATCH_DOCUMENT",
          forwardChangeSet: { operations: [] },
          inverseChangeSet: { operations: [] },
        },
      ],
    },
  },
  interactionStatusByWorkbenchId: {},
});

describe("canvasStoreSelectors", () => {
  it("resolves the active workbench and root count from canonical selectors", () => {
    const state = createState();

    expect(selectActiveWorkbench(state)?.id).toBe("workbench-1");
    expect(selectResolvedActiveWorkbenchId(state)).toBe("workbench-1");
    expect(selectActiveWorkbenchRootCount(state)).toBe(2);
    expect(selectCanvasActiveWorkbenchState(state)).toMatchObject({
      activeWorkbench: state.workbenches[0],
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
    expect(selectCanRedoInWorkbench(state, "workbench-2")).toBe(true);
    expect(selectCanUndoInWorkbench(state, null)).toBe(false);
    expect(selectCanRedoInWorkbench(state, null)).toBe(false);
  });

  it("suppresses undo and redo while interaction history is still pending", () => {
    const state = createState();
    state.interactionStatusByWorkbenchId["workbench-1"] = {
      active: false,
      pendingCommits: 1,
      queuedMutations: 0,
    };
    state.interactionStatusByWorkbenchId["workbench-2"] = {
      active: true,
      pendingCommits: 0,
      queuedMutations: 0,
    };

    expect(selectCanUndoInWorkbench(state, "workbench-1")).toBe(false);
    expect(selectCanRedoInWorkbench(state, "workbench-2")).toBe(false);
  });

  it("suppresses undo and redo while queued mutations still block interactions", () => {
    const state = createState();
    state.interactionStatusByWorkbenchId["workbench-1"] = {
      active: false,
      pendingCommits: 0,
      queuedMutations: 1,
    };

    expect(selectCanUndoInWorkbench(state, "workbench-1")).toBe(false);
    expect(selectCanRedoInWorkbench(state, "workbench-1")).toBe(false);
  });

  it("treats missing active workbench ids as unavailable history", () => {
    const state = createState();

    state.activeWorkbenchId = "missing-workbench";
    state.historyByWorkbenchId["missing-workbench"] = {
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
    state.activeWorkbenchId = "missing-workbench";

    expect(selectResolvedActiveWorkbenchId(state)).toBeNull();
    expect(selectCanvasActiveWorkbenchState(state)).toEqual({
      activeWorkbench: null,
      activeWorkbenchId: null,
      activeWorkbenchRootCount: 0,
      slices: [],
    });
  });
});
