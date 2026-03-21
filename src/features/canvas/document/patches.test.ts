import { describe, expect, it } from "vitest";
import { executeCanvasCommand } from "./commands";
import { applyCanvasWorkbenchPatch } from "./patches";
import { getCanvasWorkbenchSnapshot } from "./model";
import { createCanvasTestDocument, createShapeNode } from "./testUtils";

describe("document patches", () => {
  it("round-trips forward and inverse patches without drift", () => {
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

    const forwardApplied = applyCanvasWorkbenchPatch(document, result.forwardPatch);
    const inverseApplied = applyCanvasWorkbenchPatch(result.document, result.inversePatch);

    expect(getCanvasWorkbenchSnapshot(forwardApplied)).toEqual(getCanvasWorkbenchSnapshot(result.document));
    expect(getCanvasWorkbenchSnapshot(inverseApplied)).toEqual(getCanvasWorkbenchSnapshot(document));
  });
});
