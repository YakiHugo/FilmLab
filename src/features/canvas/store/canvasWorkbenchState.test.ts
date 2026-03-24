import { describe, expect, it } from "vitest";
import { normalizeCanvasWorkbench } from "@/features/canvas/studioPresets";
import type { CanvasCommand, CanvasWorkbench } from "@/types";
import {
  commitCommandResultToState,
  commitCreatedWorkbenchToState,
  commitDeletedWorkbenchToState,
  createHistoryEntry,
} from "./canvasWorkbenchState";
import type { CanvasStoreDataState } from "./canvasStoreTypes";

const createWorkbench = (id = "doc-1", name = "Workbench"): CanvasWorkbench =>
  normalizeCanvasWorkbench({
    id,
    version: 2,
    ownerRef: { userId: "user-1" },
    name,
    width: 1200,
    height: 800,
    presetId: "custom",
    backgroundColor: "#050505",
    nodes: {},
    rootIds: [],
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

const createStoreState = (overrides?: Partial<CanvasStoreDataState>): CanvasStoreDataState => ({
  workbenches: [createWorkbench()],
  activeWorkbenchId: "doc-1",
  selectedElementIds: [],
  tool: "select",
  activeShapeType: "rect",
  zoom: 1,
  viewport: { x: 20, y: 32 },
  activePanel: null,
  isLoading: false,
  historyByWorkbenchId: {},
  ...overrides,
});

describe("canvasWorkbenchState", () => {
  it("commits created workbench state and resets viewport when activated", () => {
    const state = createStoreState();
    const created = createWorkbench("doc-2", "Created");

    const nextState = commitCreatedWorkbenchToState(state, created);

    expect(nextState.workbenches[0]?.id).toBe("doc-2");
    expect(nextState.activeWorkbenchId).toBe("doc-2");
    expect(nextState.selectedElementIds).toEqual([]);
    expect(nextState.viewport).toEqual({ x: 0, y: 0 });
    expect(nextState.zoom).toBe(1);
    expect(nextState.historyByWorkbenchId["doc-2"]).toEqual({
      past: [],
      future: [],
    });
  });

  it("removes deleted workbench state and clears selection when active workbench changes", () => {
    const state = createStoreState({
      workbenches: [createWorkbench("doc-1", "One"), createWorkbench("doc-2", "Two")],
      selectedElementIds: ["node-1"],
      historyByWorkbenchId: {
        "doc-1": {
          past: [createHistoryEntry({ type: "PATCH_DOCUMENT", patch: { name: "One" } }, {
            forwardChangeSet: { operations: [] },
            inverseChangeSet: { operations: [] },
          })],
          future: [],
        },
      },
    });

    const nextState = commitDeletedWorkbenchToState(state, "doc-1");

    expect(nextState.workbenches.map((workbench) => workbench.id)).toEqual(["doc-2"]);
    expect(nextState.activeWorkbenchId).toBe("doc-2");
    expect(nextState.selectedElementIds).toEqual([]);
    expect(nextState.historyByWorkbenchId["doc-1"]).toBeUndefined();
  });

  it("updates workbench and history without touching selection when selection override is omitted", () => {
    const state = createStoreState({
      selectedElementIds: ["node-1"],
      historyByWorkbenchId: {
        "doc-1": {
          past: [],
          future: [createHistoryEntry({ type: "MOVE_NODES", dx: 1, dy: 1, ids: ["node-1"] }, {
            forwardChangeSet: { operations: [] },
            inverseChangeSet: { operations: [] },
          })],
        },
      },
    });
    const command: CanvasCommand = {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Renamed",
      },
    };
    const result = {
      forwardChangeSet: { operations: [] },
      inverseChangeSet: { operations: [] },
    };

    const nextState = commitCommandResultToState(state, {
      workbenchId: "doc-1",
      nextWorkbench: createWorkbench("doc-1", "Renamed"),
      historyMode: "command",
      historyEntry: createHistoryEntry(command, result),
      trackHistory: true,
    });

    expect(nextState.workbenches[0]?.name).toBe("Renamed");
    expect(nextState.historyByWorkbenchId["doc-1"]).toEqual({
      past: [expect.objectContaining({ commandType: "PATCH_DOCUMENT" })],
      future: [],
    });
    expect("selectedElementIds" in nextState).toBe(false);
  });
});
