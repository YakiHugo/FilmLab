import { describe, expect, it } from "vitest";
import { normalizeCanvasWorkbench } from "@/features/canvas/studioPresets";
import type { CanvasCommand, CanvasWorkbench } from "@/types";
import {
  appendCanvasHistoryEntry,
  commitCommandResultToState,
  commitCreatedWorkbenchToState,
  commitDeletedWorkbenchToState,
  commitPreviewCommandResultToState,
  createHistoryEntry,
} from "./canvasWorkbenchState";
import type { CanvasStoreDataState } from "./canvasStoreTypes";

const createWorkbench = (id = "doc-1", name = "Workbench"): CanvasWorkbench =>
  normalizeCanvasWorkbench({
    id,
    version: 5,
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
  workbenchList: [
    {
      id: "doc-1",
      name: "Workbench",
      createdAt: "2026-03-17T00:00:00.000Z",
      updatedAt: "2026-03-17T00:00:00.000Z",
      presetId: "custom",
      width: 1200,
      height: 800,
      elementCount: 0,
      coverAssetId: null,
    },
  ],
  loadedWorkbenchId: "doc-1",
  workbench: createWorkbench(),
  workbenchDraft: null,
  selectedElementIds: [],
  tool: "select",
  activeShapeType: "rect",
  zoom: 1,
  viewport: { x: 20, y: 32 },
  activePanel: null,
  isLoading: false,
  workbenchHistory: null,
  workbenchInteraction: null,
  ...overrides,
});

const emptyDelta = { operations: [] };

describe("canvasWorkbenchState", () => {
  it("commits created workbench state and resets viewport when activated", () => {
    const state = createStoreState();
    const created = createWorkbench("doc-2", "Created");

    const nextState = commitCreatedWorkbenchToState(state, created);

    expect(nextState.workbenchList[0]?.id).toBe("doc-2");
    expect(nextState.loadedWorkbenchId).toBe("doc-2");
    expect(nextState.workbench?.id).toBe("doc-2");
    expect(nextState.selectedElementIds).toEqual([]);
    expect(nextState.viewport).toEqual({ x: 0, y: 0 });
    expect(nextState.zoom).toBe(1);
    expect(nextState.workbenchHistory).toEqual({
      entries: [],
      cursor: 0,
    });
  });

  it("removes deleted workbench state and clears selection when active workbench changes", () => {
    const state = createStoreState({
      workbenchList: [
        {
          id: "doc-1",
          name: "One",
          createdAt: "2026-03-17T00:00:00.000Z",
          updatedAt: "2026-03-17T00:00:00.000Z",
          presetId: "custom",
          width: 1200,
          height: 800,
          elementCount: 0,
          coverAssetId: null,
        },
        {
          id: "doc-2",
          name: "Two",
          createdAt: "2026-03-17T00:00:00.000Z",
          updatedAt: "2026-03-17T00:00:00.000Z",
          presetId: "custom",
          width: 1200,
          height: 800,
          elementCount: 0,
          coverAssetId: null,
        },
      ],
      selectedElementIds: ["node-1"],
      workbenchHistory: {
        entries: [
          createHistoryEntry({ type: "PATCH_DOCUMENT", patch: { name: "One" } }, { delta: emptyDelta }),
        ],
        cursor: 1,
      },
    });

    const nextState = commitDeletedWorkbenchToState(state, "doc-1");

    expect(nextState.workbenchList.map((workbench) => workbench.id)).toEqual(["doc-2"]);
    expect(nextState.loadedWorkbenchId).toBeNull();
    expect(nextState.selectedElementIds).toEqual([]);
    expect(nextState.workbenchHistory).toBeNull();
  });

  it("updates workbench and history without touching selection when selection override is omitted", () => {
    const state = createStoreState({
      selectedElementIds: ["node-1"],
      workbenchHistory: {
        entries: [
          createHistoryEntry(
            { type: "MOVE_NODES", dx: 1, dy: 1, ids: ["node-1"] },
            { delta: emptyDelta }
          ),
        ],
        cursor: 0,
      },
    });
    const command: CanvasCommand = {
      type: "PATCH_DOCUMENT",
      patch: {
        name: "Renamed",
      },
    };

    const nextState = commitCommandResultToState(state, {
      workbenchId: "doc-1",
      nextWorkbench: createWorkbench("doc-1", "Renamed"),
      historyMode: "command",
      historyEntry: createHistoryEntry(command, { delta: emptyDelta }),
      trackHistory: true,
    });

    expect(nextState.workbench?.name).toBe("Renamed");
    expect(nextState.workbenchHistory).toEqual({
      entries: [expect.objectContaining({ commandType: "PATCH_DOCUMENT" })],
      cursor: 1,
    });
    expect("selectedElementIds" in nextState).toBe(false);
  });

  it("commits preview updates without appending history entries and clears redo history", () => {
    const state = createStoreState({
      workbenchHistory: {
        entries: [
          createHistoryEntry(
            { type: "PATCH_DOCUMENT", patch: { name: "Past" } },
            { delta: emptyDelta }
          ),
          createHistoryEntry(
            { type: "PATCH_DOCUMENT", patch: { name: "Future" } },
            { delta: emptyDelta }
          ),
        ],
        cursor: 1,
      },
    });

    const nextState = commitPreviewCommandResultToState(state, {
      workbenchId: "doc-1",
      nextWorkbench: createWorkbench("doc-1", "Preview Name"),
    });

    expect("workbench" in nextState).toBe(false);
    expect(nextState.workbenchDraft?.name).toBe("Preview Name");
    expect(nextState.workbenchHistory).toEqual({
      entries: [expect.objectContaining({ commandType: "PATCH_DOCUMENT" })],
      cursor: 1,
    });
  });

  it("appends a history entry and clears redo history", () => {
    const history = {
      entries: [
        createHistoryEntry(
          { type: "PATCH_DOCUMENT", patch: { name: "Before" } },
          { delta: emptyDelta }
        ),
        createHistoryEntry(
          { type: "PATCH_DOCUMENT", patch: { name: "Future" } },
          { delta: emptyDelta }
        ),
      ],
      cursor: 1,
    };

    const nextHistory = appendCanvasHistoryEntry(
      history,
      createHistoryEntry(
        { type: "UPDATE_NODE_PROPS", updates: [] },
        {
          delta: {
            operations: [
              {
                type: "patchDocumentMeta",
                before: { name: "Before" },
                after: { name: "After" },
              },
            ],
          },
        }
      )
    );

    expect(nextHistory).toEqual({
      entries: [
        expect.objectContaining({ commandType: "PATCH_DOCUMENT" }),
        expect.objectContaining({ commandType: "UPDATE_NODE_PROPS" }),
      ],
      cursor: 2,
    });
  });

  it("clears redo history for changed commands that opt out of history tracking", () => {
    const state = createStoreState({
      workbenchHistory: {
        entries: [
          createHistoryEntry(
            { type: "PATCH_DOCUMENT", patch: { name: "Past" } },
            { delta: emptyDelta }
          ),
          createHistoryEntry(
            { type: "PATCH_DOCUMENT", patch: { name: "Future" } },
            { delta: emptyDelta }
          ),
        ],
        cursor: 1,
      },
    });

    const nextState = commitCommandResultToState(state, {
      workbenchId: "doc-1",
      nextWorkbench: createWorkbench("doc-1", "Non-tracked rename"),
      historyMode: "command",
      historyEntry: createHistoryEntry(
        { type: "PATCH_DOCUMENT", patch: { name: "Non-tracked rename" } },
        { delta: emptyDelta }
      ),
      trackHistory: false,
    });

    expect(nextState.workbenchHistory).toEqual({
      entries: [expect.objectContaining({ commandType: "PATCH_DOCUMENT" })],
      cursor: 1,
    });
  });
});
