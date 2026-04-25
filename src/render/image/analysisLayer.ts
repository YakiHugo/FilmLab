import type { CarrierTransformNode, ImageAnalysisSource } from "./types";

export interface AnalysisLayerInputs {
  stageSnapshots: {
    develop: HTMLCanvasElement | null;
    style: HTMLCanvasElement | null;
  };
  edgeMap: HTMLCanvasElement | null;
}

export const createEmptyAnalysisLayerInputs = (): AnalysisLayerInputs => ({
  stageSnapshots: { develop: null, style: null },
  edgeMap: null,
});

export interface StageSnapshotRequirement {
  kind: "stage-snapshot";
  stage: ImageAnalysisSource;
}

export interface EdgeMapRequirement {
  kind: "edge-map";
  source: ImageAnalysisSource;
}

export type AnalysisRequirement = StageSnapshotRequirement | EdgeMapRequirement;

export const deriveAnalysisRequirements = (
  carrierTransforms: readonly CarrierTransformNode[]
): AnalysisRequirement[] => {
  const requirements: AnalysisRequirement[] = [];
  const seenSnapshots = new Set<ImageAnalysisSource>();
  for (const transform of carrierTransforms) {
    if (!transform.enabled) continue;
    if (!seenSnapshots.has(transform.analysisSource)) {
      seenSnapshots.add(transform.analysisSource);
      requirements.push({ kind: "stage-snapshot", stage: transform.analysisSource });
    }
  }
  return requirements;
};

export const requiresDevelopSnapshot = (requirements: readonly AnalysisRequirement[]) =>
  requirements.some(
    (r) =>
      (r.kind === "stage-snapshot" && r.stage === "develop") ||
      (r.kind === "edge-map" && r.source === "develop")
  );

export const requiresStyleSnapshot = (requirements: readonly AnalysisRequirement[]) =>
  requirements.some(
    (r) =>
      (r.kind === "stage-snapshot" && r.stage === "style") ||
      (r.kind === "edge-map" && r.source === "style")
  );

export const resolveAnalysisSourceCanvas = (
  source: ImageAnalysisSource,
  inputs: AnalysisLayerInputs
): HTMLCanvasElement => {
  const canvas =
    source === "develop"
      ? inputs.stageSnapshots.develop ?? inputs.stageSnapshots.style
      : inputs.stageSnapshots.style;
  if (!canvas) {
    throw new Error(`Analysis source "${source}" not available`);
  }
  return canvas;
};

export interface AnalysisValidationResult {
  valid: boolean;
  missing: string[];
}

export const validateAnalysisInputs = (
  requirements: readonly AnalysisRequirement[],
  inputs: AnalysisLayerInputs
): AnalysisValidationResult => {
  const missing: string[] = [];
  for (const req of requirements) {
    switch (req.kind) {
      case "stage-snapshot": {
        const canvas = inputs.stageSnapshots[req.stage];
        if (!canvas) {
          missing.push(`stage-snapshot:${req.stage}`);
        }
        break;
      }
      case "edge-map":
        if (!inputs.edgeMap) {
          missing.push(`edge-map:${req.source}`);
        }
        break;
    }
  }
  return { valid: missing.length === 0, missing };
};

