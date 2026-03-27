import { describe, expect, it } from "vitest";
import { executeCanvasCommand } from "./commands";
import {
  applyCanvasDocumentChangeSet,
  diffCanvasDocumentChangeSet,
} from "./patches";
import { getCanvasWorkbenchSnapshot } from "./model";
import { createCanvasTestDocument, createShapeNode } from "./testUtils";

describe("document change sets", () => {
  it("round-trips forward and inverse change sets without drift", () => {
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

    const forwardApplied = applyCanvasDocumentChangeSet(document, result.forwardChangeSet);
    const inverseApplied = applyCanvasDocumentChangeSet(result.document, result.inverseChangeSet);

    expect(getCanvasWorkbenchSnapshot(forwardApplied)).toEqual(getCanvasWorkbenchSnapshot(result.document));
    expect(getCanvasWorkbenchSnapshot(inverseApplied)).toEqual(getCanvasWorkbenchSnapshot(document));
  });

  it("returns an empty diff for net-no-op documents", () => {
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

    expect(diffCanvasDocumentChangeSet(document, document)).toEqual({
      didChange: false,
      forwardChangeSet: { operations: [] },
      inverseChangeSet: { operations: [] },
    });
  });
});
