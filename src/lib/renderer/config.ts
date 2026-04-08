export interface RendererFeatureFlags {
  incrementalPipeline: boolean;
  gpuGeometryPass: boolean;
  enableHslPass: boolean;
  enableCurvePass: boolean;
  enableDetailPass: boolean;
  enableFilmPass: boolean;
  enableOpticsPass: boolean;
  keepLastPreviewFrameOnError: boolean;
}

export interface RendererExportConfig {
  defaultConcurrency: number;
  maxConcurrency: number;
}

export interface RendererDiagnosticsConfig {
  renderTimings: boolean;
  verboseRenderTimings: boolean;
}

export interface RendererRuntimeConfig {
  features: RendererFeatureFlags;
  export: RendererExportConfig;
  diagnostics: RendererDiagnosticsConfig;
}

const DEFAULT_EXPORT_CONCURRENCY = 2;
const MAX_EXPORT_CONCURRENCY = 3;

export const DEFAULT_RENDERER_RUNTIME_CONFIG: RendererRuntimeConfig = {
  features: {
    incrementalPipeline: true,
    gpuGeometryPass: true,
    enableHslPass: true,
    enableCurvePass: true,
    enableDetailPass: true,
    enableFilmPass: true,
    enableOpticsPass: true,
    keepLastPreviewFrameOnError: true,
  },
  export: {
    defaultConcurrency: DEFAULT_EXPORT_CONCURRENCY,
    maxConcurrency: MAX_EXPORT_CONCURRENCY,
  },
  diagnostics: {
    renderTimings: false,
    verboseRenderTimings: false,
  },
};

const TRUE_VALUES = new Set(["1", "true", "on", "yes"]);
const FALSE_VALUES = new Set(["0", "false", "off", "no"]);

const clampInt = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
};

const readBooleanOverride = (key: string, fallback: boolean): boolean => {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    const normalized = raw.trim().toLowerCase();
    if (TRUE_VALUES.has(normalized)) {
      return true;
    }
    if (FALSE_VALUES.has(normalized)) {
      return false;
    }
  } catch {
    return fallback;
  }
  return fallback;
};

const readIntOverride = (key: string, fallback: number): number => {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    const parsed = Number(raw.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  } catch {
    return fallback;
  }
  return fallback;
};

export const getRendererRuntimeConfig = (): RendererRuntimeConfig => {
  const defaults = DEFAULT_RENDERER_RUNTIME_CONFIG;
  const requestedConcurrency = readIntOverride(
    "filmlab:exportConcurrency",
    defaults.export.defaultConcurrency
  );

  const maxConcurrency = clampInt(defaults.export.maxConcurrency, 1, MAX_EXPORT_CONCURRENCY);
  const defaultConcurrency = clampInt(requestedConcurrency, 1, maxConcurrency);

  return {
    features: {
      incrementalPipeline: readBooleanOverride(
        "filmlab:feature:incremental",
        defaults.features.incrementalPipeline
      ),
      gpuGeometryPass: readBooleanOverride(
        "filmlab:feature:gpuGeometry",
        defaults.features.gpuGeometryPass
      ),
      enableHslPass: readBooleanOverride("filmlab:feature:hsl", defaults.features.enableHslPass),
      enableCurvePass: readBooleanOverride(
        "filmlab:feature:curve",
        defaults.features.enableCurvePass
      ),
      enableDetailPass: readBooleanOverride(
        "filmlab:feature:detail",
        defaults.features.enableDetailPass
      ),
      enableFilmPass: readBooleanOverride(
        "filmlab:feature:film",
        defaults.features.enableFilmPass
      ),
      enableOpticsPass: readBooleanOverride(
        "filmlab:feature:optics",
        defaults.features.enableOpticsPass
      ),
      keepLastPreviewFrameOnError: readBooleanOverride(
        "filmlab:feature:keepLastPreviewFrameOnError",
        defaults.features.keepLastPreviewFrameOnError
      ),
    },
    export: {
      defaultConcurrency,
      maxConcurrency,
    },
    diagnostics: {
      renderTimings: readBooleanOverride(
        "filmlab:renderTiming",
        defaults.diagnostics.renderTimings
      ),
      verboseRenderTimings: readBooleanOverride(
        "filmlab:renderTimingVerbose",
        defaults.diagnostics.verboseRenderTimings
      ),
    },
  };
};

export const resolveExportConcurrency = (): number => {
  const runtimeConfig = getRendererRuntimeConfig();
  return clampInt(
    runtimeConfig.export.defaultConcurrency,
    1,
    runtimeConfig.export.maxConcurrency
  );
};
