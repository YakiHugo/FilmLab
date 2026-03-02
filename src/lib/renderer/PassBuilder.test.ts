import { describe, expect, it } from "vitest";
import type { ProgramInfo } from "twgl.js";
import { buildMainPasses, type MainPassPrograms } from "./PassBuilder";

const DUMMY_PROGRAM = {} as ProgramInfo;

const createPrograms = (): MainPassPrograms => ({
  passthrough: DUMMY_PROGRAM,
  inputDecode: DUMMY_PROGRAM,
  geometry: DUMMY_PROGRAM,
  master: DUMMY_PROGRAM,
  hsl: DUMMY_PROGRAM,
  curve: DUMMY_PROGRAM,
  detail: DUMMY_PROGRAM,
  filmPrepUber: DUMMY_PROGRAM,
  filmColorLutUber: DUMMY_PROGRAM,
  filmPrintUber: DUMMY_PROGRAM,
  filmGrain: DUMMY_PROGRAM,
  proceduralGrain: DUMMY_PROGRAM,
  filmEffectsUber: DUMMY_PROGRAM,
});

const createFilmUniforms = () => ({
  u_expandEnabled: false,
  u_filmCompressionEnabled: false,
  u_filmDeveloperEnabled: false,
  u_toneEnabled: false,
  u_colorMatrixEnabled: false,
  u_lutEnabled: false,
  u_customLutEnabled: false,
  u_printEnabled: false,
  u_cmyColorHeadEnabled: false,
  u_colorCastEnabled: false,
  u_printToningEnabled: false,
  u_grainEnabled: false,
  u_grainModel: 0,
  u_vignetteEnabled: false,
  u_filmBreathEnabled: false,
  u_filmDamageEnabled: false,
  u_gateWeaveEnabled: false,
  u_overscanEnabled: false,
});

describe("buildMainPasses", () => {
  it("builds basic decode + master chain without film", () => {
    const result = buildMainPasses({
      useGeometry: false,
      useMaster: true,
      useHsl: false,
      useCurve: false,
      useDetail: false,
      useFilm: false,
      intermediateFormat: "RGBA16F",
      programs: createPrograms(),
      geometryPassUniforms: {},
      masterPassUniforms: {},
      hslPassUniforms: {},
      curvePassUniforms: {},
      detailPassUniforms: {},
      filmPassUniforms: createFilmUniforms(),
    });

    expect(result.passes.map((pass) => pass.id)).toEqual(["input-decode", "master"]);
    expect(result.filmStageCount).toBe(0);
    expect(result.shouldRunMultiscaleDenoise).toBe(false);
  });

  it("builds merged film stages in expected order", () => {
    const filmUniforms = createFilmUniforms();
    filmUniforms.u_expandEnabled = true;
    filmUniforms.u_lutEnabled = true;
    filmUniforms.u_printEnabled = true;
    filmUniforms.u_grainEnabled = true;
    filmUniforms.u_vignetteEnabled = true;

    const result = buildMainPasses({
      useGeometry: true,
      useMaster: true,
      useHsl: true,
      useCurve: true,
      useDetail: true,
      useFilm: true,
      intermediateFormat: "RGBA8",
      programs: createPrograms(),
      geometryPassUniforms: {},
      masterPassUniforms: {},
      hslPassUniforms: {},
      curvePassUniforms: {},
      detailPassUniforms: {
        u_noiseReduction: 0,
        u_colorNoiseReduction: 0,
      },
      filmPassUniforms: filmUniforms,
    });

    expect(result.passes.map((pass) => pass.id)).toEqual([
      "geometry",
      "master",
      "hsl",
      "curve",
      "detail",
      "film-prep-uber",
      "film-color-lut-uber",
      "film-print-uber",
      "film-grain",
      "film-effects-uber",
    ]);
    expect(result.filmStageCount).toBe(5);
  });

  it("chooses procedural grain program when grain model is enabled", () => {
    const programs = createPrograms();
    const filmUniforms = createFilmUniforms();
    filmUniforms.u_grainEnabled = true;
    filmUniforms.u_grainModel = 1;

    const result = buildMainPasses({
      useGeometry: false,
      useMaster: false,
      useHsl: false,
      useCurve: false,
      useDetail: false,
      useFilm: true,
      intermediateFormat: "RGBA16F",
      programs,
      geometryPassUniforms: {},
      masterPassUniforms: {},
      hslPassUniforms: {},
      curvePassUniforms: {},
      detailPassUniforms: {
        u_noiseReduction: 0,
        u_colorNoiseReduction: 0,
      },
      filmPassUniforms: filmUniforms,
    });

    const grainPass = result.passes.find((pass) => pass.id === "film-grain");
    expect(grainPass?.programInfo).toBe(programs.proceduralGrain);
  });

  it("enables multiscale denoise when detail NR is active", () => {
    const result = buildMainPasses({
      useGeometry: false,
      useMaster: false,
      useHsl: false,
      useCurve: false,
      useDetail: true,
      useFilm: false,
      intermediateFormat: "RGBA8",
      programs: createPrograms(),
      geometryPassUniforms: {},
      masterPassUniforms: {},
      hslPassUniforms: {},
      curvePassUniforms: {},
      detailPassUniforms: {
        u_noiseReduction: 0.01,
        u_colorNoiseReduction: 0,
      },
      filmPassUniforms: createFilmUniforms(),
    });

    expect(result.shouldRunMultiscaleDenoise).toBe(true);
  });
});
