import { beforeEach, describe, expect, it } from "vitest";
import type { CanvasWorkbench } from "@/types";

import {
  CANVAS_TRACE_RING_LIMIT,
  clearCanvasTraceRing,
  readCanvasTraceRing,
  traceCanvasCommand,
} from "./canvasCommandTrace";

const makeStubWorkbench = (
  overrides: Partial<Pick<CanvasWorkbench, "id" | "rootIds" | "nodes" | "groupChildren">> = {}
): CanvasWorkbench =>
  ({
    id: "wb-1",
    rootIds: [],
    nodes: {},
    groupChildren: {},
    ...overrides,
  }) as unknown as CanvasWorkbench;

describe("canvasCommandTrace", () => {
  beforeEach(() => {
    clearCanvasTraceRing();
  });

  it("three consecutive dispatches produce three trace events with chained digests", () => {
    const wb0 = makeStubWorkbench({ rootIds: [] });
    const wb1 = makeStubWorkbench({ rootIds: ["n1"], nodes: { n1: {} } as never });
    const wb2 = makeStubWorkbench({ rootIds: ["n1", "n2"], nodes: { n1: {}, n2: {} } as never });
    const wb3 = makeStubWorkbench({
      rootIds: ["n1", "n2", "n3"],
      nodes: { n1: {}, n2: {}, n3: {} } as never,
    });

    traceCanvasCommand("INSERT_NODES", { ids: ["n1"] }, wb0, wb1);
    traceCanvasCommand("INSERT_NODES", { ids: ["n2"] }, wb1, wb2);
    traceCanvasCommand("MOVE_NODES", { ids: ["n1"] }, wb2, wb3);

    const events = readCanvasTraceRing();
    expect(events).toHaveLength(3);
    expect(events[0]!.kind).toBe("INSERT_NODES");
    expect(events[1]!.kind).toBe("INSERT_NODES");
    expect(events[2]!.kind).toBe("MOVE_NODES");

    expect(events[0]!.nextDigest).toBe(events[1]!.prevDigest);
    expect(events[1]!.nextDigest).toBe(events[2]!.prevDigest);

    for (const event of events) {
      expect(typeof event.tsMs).toBe("number");
      expect(event.prevDigest.length).toBeGreaterThan(0);
      expect(event.nextDigest.length).toBeGreaterThan(0);
    }
  });

  it("caps the ring buffer at CANVAS_TRACE_RING_LIMIT", () => {
    const wb = makeStubWorkbench();
    const overflow = CANVAS_TRACE_RING_LIMIT + 10;
    for (let i = 0; i < overflow; i += 1) {
      traceCanvasCommand(`cmd-${i}`, {}, wb, wb);
    }

    const events = readCanvasTraceRing();
    expect(events).toHaveLength(CANVAS_TRACE_RING_LIMIT);
    expect(events[0]!.kind).toBe(`cmd-${overflow - CANVAS_TRACE_RING_LIMIT}`);
    expect(events[events.length - 1]!.kind).toBe(`cmd-${overflow - 1}`);
  });

  it("produces distinct digests for different workbench states", () => {
    const wb1 = makeStubWorkbench({ rootIds: [] });
    const wb2 = makeStubWorkbench({ rootIds: ["n1"], nodes: { n1: {} } as never });

    traceCanvasCommand("INSERT_NODES", {}, wb1, wb2);

    const events = readCanvasTraceRing();
    expect(events[0]!.prevDigest).not.toBe(events[0]!.nextDigest);
  });
});
