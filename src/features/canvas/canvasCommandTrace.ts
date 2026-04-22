import { fnv1aDigest } from "@/lib/hash";
import type { CanvasWorkbench } from "@/types";

export interface CanvasCommandEvent {
  tsMs: number;
  kind: string;
  payload: unknown;
  prevDigest: string;
  nextDigest: string;
}

export const CANVAS_TRACE_RING_LIMIT = 200;

const RING_KEY = "__filmlab_canvasTrace" as const;

type RingHost = typeof globalThis & { [RING_KEY]?: CanvasCommandEvent[] };

const getRing = (): CanvasCommandEvent[] => {
  const host = globalThis as RingHost;
  if (!host[RING_KEY]) {
    host[RING_KEY] = [];
  }
  return host[RING_KEY]!;
};

const workbenchDigest = (workbench: CanvasWorkbench | null): string => {
  if (!workbench) return "";
  return fnv1aDigest(
    JSON.stringify({
      id: workbench.id,
      rootIds: workbench.rootIds,
      nodes: workbench.nodes,
      groupChildren: workbench.groupChildren,
    })
  );
};

export const traceCanvasCommand = (
  kind: string,
  payload: unknown,
  prev: CanvasWorkbench | null,
  next: CanvasWorkbench | null
): void => {
  if (!import.meta.env.DEV) return;

  const event: CanvasCommandEvent = {
    tsMs: Date.now(),
    kind,
    payload,
    prevDigest: workbenchDigest(prev),
    nextDigest: workbenchDigest(next),
  };

  const ring = getRing();
  ring.push(event);
  if (ring.length > CANVAS_TRACE_RING_LIMIT) {
    ring.splice(0, ring.length - CANVAS_TRACE_RING_LIMIT);
  }
};

export const readCanvasTraceRing = (): readonly CanvasCommandEvent[] =>
  getRing().slice();

export const clearCanvasTraceRing = (): void => {
  const host = globalThis as RingHost;
  host[RING_KEY] = [];
};
