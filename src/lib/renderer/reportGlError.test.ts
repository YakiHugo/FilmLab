import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GL_ERROR_RING_LIMIT,
  clearGlErrorRing,
  readGlErrorRing,
  reportGlError,
} from "./reportGlError";

describe("reportGlError", () => {
  beforeEach(() => {
    clearGlErrorRing();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("appends structured events to the dev ring buffer with required fields", () => {
    const cause = new Error("shader link failed");

    reportGlError({
      op: "linkProgram",
      shaderName: "master",
      rendererLabel: "preview",
      compileLog: "ERROR: 0:5: cannot link",
      cause,
    });

    const ring = readGlErrorRing();
    expect(ring).toHaveLength(1);
    expect(ring[0]).toMatchObject({
      op: "linkProgram",
      shaderName: "master",
      rendererLabel: "preview",
      compileLog: "ERROR: 0:5: cannot link",
      cause,
    });
    expect(console.error).toHaveBeenCalledWith("[gl-error]", expect.objectContaining({
      op: "linkProgram",
      shaderName: "master",
    }));
  });

  it("caps the ring buffer at GL_ERROR_RING_LIMIT entries, dropping oldest first", () => {
    const overflow = GL_ERROR_RING_LIMIT + 5;
    for (let i = 0; i < overflow; i += 1) {
      reportGlError({
        op: "drawArrays",
        passId: `pass-${i}`,
        rendererLabel: "preview",
      });
    }

    const ring = readGlErrorRing();
    expect(ring).toHaveLength(GL_ERROR_RING_LIMIT);
    expect(ring[0]?.passId).toBe(`pass-${overflow - GL_ERROR_RING_LIMIT}`);
    expect(ring[ring.length - 1]?.passId).toBe(`pass-${overflow - 1}`);
  });
});
