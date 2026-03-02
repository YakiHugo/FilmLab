import type { ProgramInfo } from "twgl.js";
import type { PipelinePass } from "./gpu/PipelinePass";

export interface MainPassPrograms {
  passthrough: ProgramInfo;
  inputDecode: ProgramInfo;
  geometry: ProgramInfo;
  master: ProgramInfo;
  hsl: ProgramInfo;
  curve: ProgramInfo;
  detail: ProgramInfo;
  filmPrepUber: ProgramInfo;
  filmColorLutUber: ProgramInfo;
  filmPrintUber: ProgramInfo;
  filmGrain: ProgramInfo;
  proceduralGrain: ProgramInfo;
  filmEffectsUber: ProgramInfo;
}

interface BuildMainPassesArgs {
  useGeometry: boolean;
  useMaster: boolean;
  useHsl: boolean;
  useCurve: boolean;
  useDetail: boolean;
  useFilm: boolean;
  intermediateFormat: "RGBA8" | "RGBA16F";
  programs: MainPassPrograms;
  geometryPassUniforms: Record<string, unknown>;
  masterPassUniforms: Record<string, unknown>;
  hslPassUniforms: Record<string, unknown>;
  curvePassUniforms: Record<string, unknown>;
  detailPassUniforms: Record<string, unknown>;
  filmPassUniforms: Record<string, unknown>;
}

const asBoolean = (value: unknown): boolean => Boolean(value);

export interface MainPassBuildResult {
  passes: PipelinePass[];
  filmStageCount: number;
  shouldRunMultiscaleDenoise: boolean;
}

export const buildMainPasses = (args: BuildMainPassesArgs): MainPassBuildResult => {
  const {
    useGeometry,
    useMaster,
    useHsl,
    useCurve,
    useDetail,
    useFilm,
    intermediateFormat,
    programs,
    geometryPassUniforms,
    masterPassUniforms,
    hslPassUniforms,
    curvePassUniforms,
    detailPassUniforms,
    filmPassUniforms,
  } = args;

  const passes: PipelinePass[] = [];
  let filmStageCount = 0;

  if (!useGeometry) {
    passes.push({
      id: "input-decode",
      programInfo: programs.inputDecode,
      uniforms: {},
      outputFormat: intermediateFormat,
      enabled: true,
    });
  }

  if (useGeometry) {
    passes.push({
      id: "geometry",
      programInfo: programs.geometry,
      uniforms: geometryPassUniforms,
      outputFormat: intermediateFormat,
      enabled: true,
    });
  }

  if (useMaster) {
    passes.push({
      id: "master",
      programInfo: programs.master,
      uniforms: masterPassUniforms,
      outputFormat: intermediateFormat,
      enabled: true,
    });
  }

  if (useHsl) {
    passes.push({
      id: "hsl",
      programInfo: programs.hsl,
      uniforms: hslPassUniforms,
      outputFormat: intermediateFormat,
      enabled: true,
    });
  }

  if (useCurve) {
    passes.push({
      id: "curve",
      programInfo: programs.curve,
      uniforms: curvePassUniforms,
      outputFormat: intermediateFormat,
      enabled: true,
    });
  }

  if (useDetail) {
    passes.push({
      id: "detail",
      programInfo: programs.detail,
      uniforms: detailPassUniforms,
      outputFormat: intermediateFormat,
      enabled: true,
    });
  }

  const shouldRunMultiscaleDenoise =
    useDetail &&
    ((detailPassUniforms.u_noiseReduction as number) > 0.001 ||
      (detailPassUniforms.u_colorNoiseReduction as number) > 0.001);

  if (useFilm) {
    const prepEnabled =
      asBoolean(filmPassUniforms.u_expandEnabled) ||
      asBoolean(filmPassUniforms.u_filmCompressionEnabled) ||
      asBoolean(filmPassUniforms.u_filmDeveloperEnabled) ||
      asBoolean(filmPassUniforms.u_toneEnabled);

    const colorEnabled =
      asBoolean(filmPassUniforms.u_colorMatrixEnabled) ||
      asBoolean(filmPassUniforms.u_lutEnabled) ||
      asBoolean(filmPassUniforms.u_customLutEnabled);

    const printEnabled =
      asBoolean(filmPassUniforms.u_printEnabled) ||
      asBoolean(filmPassUniforms.u_cmyColorHeadEnabled) ||
      asBoolean(filmPassUniforms.u_colorCastEnabled) ||
      asBoolean(filmPassUniforms.u_printToningEnabled);

    const grainEnabled = asBoolean(filmPassUniforms.u_grainEnabled);
    const grainModel = Number(filmPassUniforms.u_grainModel ?? 0);

    const effectsEnabled =
      asBoolean(filmPassUniforms.u_vignetteEnabled) ||
      asBoolean(filmPassUniforms.u_filmBreathEnabled) ||
      asBoolean(filmPassUniforms.u_filmDamageEnabled) ||
      asBoolean(filmPassUniforms.u_gateWeaveEnabled) ||
      asBoolean(filmPassUniforms.u_overscanEnabled);

    if (prepEnabled) {
      passes.push({
        id: "film-prep-uber",
        programInfo: programs.filmPrepUber,
        uniforms: filmPassUniforms,
        outputFormat: intermediateFormat,
        enabled: true,
      });
      filmStageCount += 1;
    }

    if (colorEnabled) {
      passes.push({
        id: "film-color-lut-uber",
        programInfo: programs.filmColorLutUber,
        uniforms: filmPassUniforms,
        outputFormat: intermediateFormat,
        enabled: true,
      });
      filmStageCount += 1;
    }

    if (printEnabled) {
      passes.push({
        id: "film-print-uber",
        programInfo: programs.filmPrintUber,
        uniforms: filmPassUniforms,
        outputFormat: intermediateFormat,
        enabled: true,
      });
      filmStageCount += 1;
    }

    if (grainEnabled) {
      passes.push({
        id: "film-grain",
        programInfo: grainModel > 0.5 ? programs.proceduralGrain : programs.filmGrain,
        uniforms: filmPassUniforms,
        outputFormat: intermediateFormat,
        enabled: true,
      });
      filmStageCount += 1;
    }

    if (effectsEnabled) {
      passes.push({
        id: "film-effects-uber",
        programInfo: programs.filmEffectsUber,
        uniforms: filmPassUniforms,
        outputFormat: intermediateFormat,
        enabled: true,
      });
      filmStageCount += 1;
    }
  }

  if (passes.length === 0) {
    passes.push({
      id: "passthrough",
      programInfo: programs.passthrough,
      uniforms: {},
      enabled: true,
    });
  }

  return {
    passes,
    filmStageCount,
    shouldRunMultiscaleDenoise,
  };
};
