import { beforeEach, describe, expect, it, vi } from "vitest";

const createProgramInfoMock = vi.fn(() => ({ program: {} }));

vi.mock("twgl.js", () => ({
  createProgramInfo: (...args: unknown[]) =>
    Reflect.apply(createProgramInfoMock, undefined, args),
}));

import { createPrograms } from "./ProgramRegistry";

describe("ProgramRegistry", () => {
  beforeEach(() => {
    createProgramInfoMock.mockClear();
  });

  it("registers brush-mask programs with the expected shader fragments", () => {
    const fakeGl = {} as WebGL2RenderingContext;
    const programs = createPrograms(fakeGl);

    createProgramInfoMock.mockClear();

    void programs.brushMaskStamp;
    void programs.maskInvert;

    expect(createProgramInfoMock).toHaveBeenCalledTimes(2);
    const brushSources = (createProgramInfoMock.mock.calls as unknown[][])[0]![1] as string[];
    const invertSources = (createProgramInfoMock.mock.calls as unknown[][])[1]![1] as string[];

    expect(brushSources[1]).toContain("u_centerPx");
    expect(brushSources[1]).toContain("u_innerRadiusPx");
    expect(brushSources[1]).toContain("previousAlpha");
    expect(invertSources[1]).toContain("1.0 - texture(uSampler");
  });

  it("keeps brush-mask programs lazily cached after first access", () => {
    const fakeGl = {} as WebGL2RenderingContext;
    const programs = createPrograms(fakeGl);

    createProgramInfoMock.mockClear();

    void programs.brushMaskStamp;
    void programs.brushMaskStamp;
    void programs.maskInvert;
    void programs.maskInvert;

    expect(createProgramInfoMock).toHaveBeenCalledTimes(2);
  });

  it("registers the direct ascii-carrier shader lazily", () => {
    const fakeGl = {} as WebGL2RenderingContext;
    const programs = createPrograms(fakeGl);

    createProgramInfoMock.mockClear();

    void programs.asciiCarrier;

    expect(createProgramInfoMock).toHaveBeenCalledTimes(1);
    const asciiSources = (createProgramInfoMock.mock.calls as unknown[][])[0]![1] as string[];
    expect(asciiSources[1]).toContain("u_colorMode");
    expect(asciiSources[1]).toContain("resolveTone");
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
});
