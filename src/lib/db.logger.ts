export type DbOp = "get" | "put" | "delete" | "migrate" | "openDb";

export type DbPhase = "start" | "success" | "error";

export interface DbLogEvent {
  tsMs: number;
  op: DbOp;
  phase: DbPhase;
  storeName?: string;
  key?: string | number;
  caller?: string;
  error?: { name?: string; message?: string };
}

export const DB_LOG_RING_LIMIT = 200;

const RING_KEY = "__filmlab_dbLog" as const;

type RingHost = typeof globalThis & { [RING_KEY]?: DbLogEvent[] };

const getRing = (): DbLogEvent[] => {
  const host = globalThis as RingHost;
  if (!host[RING_KEY]) {
    host[RING_KEY] = [];
  }
  return host[RING_KEY]!;
};

const summarizeError = (cause: unknown): DbLogEvent["error"] => {
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message };
  }
  if (cause === undefined || cause === null) {
    return undefined;
  }
  return { message: String(cause) };
};

export const logDb = (event: Omit<DbLogEvent, "tsMs">): void => {
  const full: DbLogEvent = { ...event, tsMs: Date.now() };
  const ring = getRing();
  ring.push(full);
  if (ring.length > DB_LOG_RING_LIMIT) {
    ring.splice(0, ring.length - DB_LOG_RING_LIMIT);
  }
  if (import.meta.env.DEV) {
    console.log(JSON.stringify(full));
  } else if (full.phase === "error") {
    console.warn(JSON.stringify(full));
  }
};

export const logDbError = (
  event: Omit<DbLogEvent, "tsMs" | "phase" | "error">,
  cause: unknown
): void => {
  logDb({ ...event, phase: "error", error: summarizeError(cause) });
};

export const readDbLogRing = (): readonly DbLogEvent[] => {
  return getRing().slice();
};

export const clearDbLogRing = (): void => {
  const host = globalThis as RingHost;
  host[RING_KEY] = [];
};
