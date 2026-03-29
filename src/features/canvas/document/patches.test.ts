import { describe, expect, it } from "vitest";
import { executeCanvasCommand } from "./commands";
import {
  applyCanvasDocumentDelta,
  diffCanvasDocumentDelta,
} from "./patches";
import { getCanvasWorkbenchSnapshot } from "./model";
import { createCanvasTestDocument, createShapeNode } from "./testUtils";

describe("document delta patches", () => {
  it("round-trips redo and undo without drift", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "shape-1": createShapeNode({
          id: "shape-1",
          x: 100,
          y: 120,
        }),
      },
      rootIds: ["shape-1"],
    });

    const result = executeCanvasCommand(document, {
      type: "MOVE_NODES",
      ids: ["shape-1"],
      dx: 48,
      dy: -12,
    });

    const redone = applyCanvasDocumentDelta(document, result.delta, "redo");
    const undone = applyCanvasDocumentDelta(result.document, result.delta, "undo");

    expect(getCanvasWorkbenchSnapshot(redone)).toEqual(getCanvasWorkbenchSnapshot(result.document));
    expect(getCanvasWorkbenchSnapshot(undone)).toEqual(getCanvasWorkbenchSnapshot(document));
  });

  it("returns an empty delta for net-no-op documents", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "shape-1": createShapeNode({
          id: "shape-1",
          x: 32,
          y: 48,
        }),
      },
      rootIds: ["shape-1"],
    });

    expect(diffCanvasDocumentDelta(document, document)).toEqual({
      didChange: false,
      delta: { operations: [] },
    });
  });

  it("restores updatedAt when diffing interaction-style before and after documents", () => {
    const document = {
      ...createCanvasTestDocument({
      nodes: {
        "shape-1": createShapeNode({
          id: "shape-1",
          x: 24,
          y: 36,
        }),
      },
      rootIds: ["shape-1"],
      }),
      updatedAt: "2026-03-17T00:00:00.000Z",
    };

    const moved = executeCanvasCommand(document, {
      type: "MOVE_NODES",
      ids: ["shape-1"],
      dx: 12,
      dy: 8,
    }).document;

    const diff = diffCanvasDocumentDelta(document, moved);
    const undone = applyCanvasDocumentDelta(moved, diff.delta, "undo");

    expect(diff.didChange).toBe(true);
    expect(getCanvasWorkbenchSnapshot(undone)).toEqual(getCanvasWorkbenchSnapshot(document));
  });

  it("treats timestamp-only interaction diffs as no-ops", () => {
    const document = createCanvasTestDocument({
      nodes: {
        "shape-1": createShapeNode({
          id: "shape-1",
          x: 24,
          y: 36,
        }),
      },
      rootIds: ["shape-1"],
    });

    const diff = diffCanvasDocumentDelta(document, {
      ...document,
      updatedAt: "2026-03-29T00:00:00.000Z",
    });

    expect(diff).toEqual({
      didChange: false,
      delta: { operations: [] },
    });
  });

  it("preserves thumbnail blob identity across undo", () => {
    const originalBlob = new Blob(["before"], { type: "image/png" });
    const nextBlob = new Blob(["after"], { type: "image/png" });
    const document = {
      ...createCanvasTestDocument({
        nodes: {
          "shape-1": createShapeNode({
            id: "shape-1",
            x: 24,
            y: 36,
          }),
        },
        rootIds: ["shape-1"],
      }),
      thumbnailBlob: originalBlob,
    };

    const result = executeCanvasCommand(document, {
      type: "PATCH_DOCUMENT",
      patch: {
        thumbnailBlob: nextBlob,
      },
    });
    const undone = applyCanvasDocumentDelta(result.document, result.delta, "undo");

    expect(undone.thumbnailBlob).toBe(originalBlob);
  });
});
