import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DB_LOG_RING_LIMIT,
  clearDbLogRing,
  logDb,
  logDbError,
  readDbLogRing,
} from "./db.logger";

describe("db.logger", () => {
  beforeEach(() => {
    clearDbLogRing();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("appends structured events to the ring buffer and emits a JSON line in DEV", () => {
    logDb({
      op: "put",
      storeName: "assets",
      key: "asset-1",
      phase: "error",
      caller: "saveAsset",
      error: { name: "AbortError", message: "tx aborted" },
    });

    const ring = readDbLogRing();
    expect(ring).toHaveLength(1);
    expect(ring[0]).toMatchObject({
      op: "put",
      storeName: "assets",
      key: "asset-1",
      phase: "error",
      caller: "saveAsset",
      error: { name: "AbortError", message: "tx aborted" },
    });
    expect(typeof ring[0]?.tsMs).toBe("number");

    expect(console.log).toHaveBeenCalledTimes(1);
    const payload = (console.log as ReturnType<typeof vi.spyOn>).mock.calls[0]?.[0] as string;
    expect(typeof payload).toBe("string");
    expect(JSON.parse(payload)).toMatchObject({
      op: "put",
      storeName: "assets",
      phase: "error",
      caller: "saveAsset",
    });
  });

  it("caps the ring buffer at DB_LOG_RING_LIMIT entries, dropping oldest first", () => {
    const overflow = DB_LOG_RING_LIMIT + 7;
    for (let i = 0; i < overflow; i += 1) {
      logDb({ op: "get", storeName: "assets", key: `k-${i}`, phase: "success" });
    }

    const ring = readDbLogRing();
    expect(ring).toHaveLength(DB_LOG_RING_LIMIT);
    expect(ring[0]?.key).toBe(`k-${overflow - DB_LOG_RING_LIMIT}`);
    expect(ring[ring.length - 1]?.key).toBe(`k-${overflow - 1}`);
  });

  it("logDbError summarizes Error instances into {name,message}", () => {
    logDbError(
      { op: "delete", storeName: "assets", key: "asset-42", caller: "deleteAsset" },
      new Error("quota exceeded"),
    );

    const ring = readDbLogRing();
    expect(ring).toHaveLength(1);
    expect(ring[0]).toMatchObject({
      op: "delete",
      phase: "error",
      error: { name: "Error", message: "quota exceeded" },
    });
  });

  it("logDbError degrades non-Error causes to message string", () => {
    logDbError(
      { op: "put", storeName: "currentUser", caller: "saveCurrentUser" },
      "failure-code-7",
    );

    const ring = readDbLogRing();
    expect(ring[0]?.error).toEqual({ message: "failure-code-7" });
  });
});
