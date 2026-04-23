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

  it("appends structured events to the dev ring buffer and rethrows in DEV", () => {
    const cause = new Error("shader link failed");

    expect(() =>
      reportGlError({
        op: "linkProgram",
        shaderName: "master",
        rendererLabel: "preview",
        compileLog: "ERROR: 0:5: cannot link",
        cause,
      })
    ).toThrow(cause);

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

  it("rethrows a synthetic Error when cause is not an Error instance", () => {
    expect(() =>
      reportGlError({
        op: "drawArrays",
        passId: "pass-0",
        rendererLabel: "preview",
        cause: "string cause",
      })
    ).toThrow("[gl-error] drawArrays");
  });

  it("caps the ring buffer at GL_ERROR_RING_LIMIT entries, dropping oldest first", () => {
    const overflow = GL_ERROR_RING_LIMIT + 5;
    for (let i = 0; i < overflow; i += 1) {
      try {
        reportGlError({
          op: "drawArrays",
          passId: `pass-${i}`,
          rendererLabel: "preview",
        });
      } catch {
        // DEV rethrow expected
      }
    }

    const ring = readGlErrorRing();
    expect(ring).toHaveLength(GL_ERROR_RING_LIMIT);
    expect(ring[0]?.passId).toBe(`pass-${overflow - GL_ERROR_RING_LIMIT}`);
    expect(ring[ring.length - 1]?.passId).toBe(`pass-${overflow - 1}`);
  });
});
