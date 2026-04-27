import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createProgramInfoMock = vi.fn(() => ({ program: {} }));

vi.mock("twgl.js", () => ({
  createProgramInfo: (...args: unknown[]) =>
    Reflect.apply(createProgramInfoMock, undefined, args),
}));

import { createPrograms } from "./ProgramRegistry";
import { clearGlErrorRing, readGlErrorRing } from "./reportGlError";

describe("ProgramRegistry", () => {
  beforeEach(() => {
    createProgramInfoMock.mockClear();
  });

  it("registers the direct ascii-carrier shader lazily", () => {
    const fakeGl = {} as WebGL2RenderingContext;
    const programs = createPrograms(fakeGl);

    createProgramInfoMock.mockClear();

    void programs.asciiCarrier;

    expect(createProgramInfoMock).toHaveBeenCalledTimes(1);
    const asciiSources = (createProgramInfoMock.mock.calls as unknown[][])[0]![1] as string[];
    expect(asciiSources[1]).toContain("u_colorMode");
    expect(asciiSources[1]).toContain("sampleCellTone");
    expect(asciiSources[1]).toContain("u_cellBackgroundColor");
  });

  it("registers the timestamp overlay shader lazily", () => {
    const fakeGl = {} as WebGL2RenderingContext;
    const programs = createPrograms(fakeGl);

    createProgramInfoMock.mockClear();

    void programs.timestampOverlay;

    expect(createProgramInfoMock).toHaveBeenCalledTimes(1);
    const overlaySources = (createProgramInfoMock.mock.calls as unknown[][])[0]![1] as string[];
    expect(overlaySources[1]).toContain("u_glyphIndices");
    expect(overlaySources[1]).toContain("resolveGlyphMask");
    expect(overlaySources[1]).toContain("u_backgroundColor");
  });

  describe("uniform alignment self-check", () => {
    beforeEach(() => {
      clearGlErrorRing();
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("reports declared uniforms missing from uniformSetters as orphans", () => {
      const fakeGl = {} as WebGL2RenderingContext;
      const programs = createPrograms(fakeGl);

      createProgramInfoMock.mockClear();
      clearGlErrorRing();

      createProgramInfoMock.mockImplementationOnce(() => ({
        program: {},
        uniformSetters: {
          uSampler: () => {},
        },
      }));

      expect(() => void programs.hsl).toThrow("[gl-error] uniform-binding");

      const ring = readGlErrorRing();
      expect(ring).toHaveLength(1);
      const event = ring[0]!;
      expect(event.op).toBe("uniform-binding");
      expect(event.shaderName).toBe("hsl");
      expect(event.rendererLabel).toBe("program-registry");
      expect((event.declaredOrphans ?? []).length).toBeGreaterThan(0);
    });
  });
});
