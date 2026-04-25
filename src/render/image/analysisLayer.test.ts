import { describe, expect, it } from "vitest";
import {
  createEmptyAnalysisLayerInputs,
  deriveAnalysisRequirements,
  requiresDevelopSnapshot,
  requiresStyleSnapshot,
  resolveAnalysisSourceCanvas,
  validateAnalysisInputs,
} from "./analysisLayer";
import type { CarrierTransformNode } from "./types";

const createMockCanvas = () =>
  ({ width: 100, height: 100 }) as unknown as HTMLCanvasElement;

const createAsciiTransform = (
  overrides?: Partial<Extract<CarrierTransformNode, { type: "ascii" }>>
): CarrierTransformNode => ({
  id: "ascii-1",
  type: "ascii" as const,
  enabled: true,
  analysisSource: "style" as const,
  params: {} as never,
  ...overrides,
});

const createHalftoneTransform = (
  overrides?: Partial<Extract<CarrierTransformNode, { type: "halftone" }>>
): CarrierTransformNode => ({
  id: "halftone-1",
  type: "halftone" as const,
  enabled: true,
  analysisSource: "style" as const,
  params: {} as never,
  ...overrides,
});

describe("analysisLayer", () => {
  describe("createEmptyAnalysisLayerInputs", () => {
    it("returns all-null inputs", () => {
      const inputs = createEmptyAnalysisLayerInputs();
      expect(inputs.stageSnapshots.develop).toBeNull();
      expect(inputs.stageSnapshots.style).toBeNull();
      expect(inputs.edgeMap).toBeNull();
    });
  });

  describe("deriveAnalysisRequirements", () => {
    it("returns empty for no transforms", () => {
      expect(deriveAnalysisRequirements([])).toEqual([]);
    });

    it("returns empty for disabled transforms", () => {
      const requirements = deriveAnalysisRequirements([
        createAsciiTransform({ enabled: false }),
      ]);
      expect(requirements).toEqual([]);
    });

    it("derives stage-snapshot from enabled transforms", () => {
      const requirements = deriveAnalysisRequirements([
        createAsciiTransform({ analysisSource: "style" }),
      ]);
      expect(requirements).toEqual([{ kind: "stage-snapshot", stage: "style" }]);
    });

    it("deduplicates same-stage requirements", () => {
      const requirements = deriveAnalysisRequirements([
        createAsciiTransform({ id: "a", analysisSource: "style" }),
        createHalftoneTransform({ id: "b", analysisSource: "style" }),
      ]);
      expect(requirements).toEqual([{ kind: "stage-snapshot", stage: "style" }]);
    });

    it("includes both develop and style when both are needed", () => {
      const requirements = deriveAnalysisRequirements([
        createAsciiTransform({ analysisSource: "develop" }),
        createHalftoneTransform({ analysisSource: "style" }),
      ]);
      expect(requirements).toHaveLength(2);
      expect(requirements).toContainEqual({ kind: "stage-snapshot", stage: "develop" });
      expect(requirements).toContainEqual({ kind: "stage-snapshot", stage: "style" });
    });
  });

  describe("requiresDevelopSnapshot / requiresStyleSnapshot", () => {
    it("detects develop stage-snapshot requirement", () => {
      const reqs = [{ kind: "stage-snapshot" as const, stage: "develop" as const }];
      expect(requiresDevelopSnapshot(reqs)).toBe(true);
      expect(requiresStyleSnapshot(reqs)).toBe(false);
    });

    it("detects style stage-snapshot requirement", () => {
      const reqs = [{ kind: "stage-snapshot" as const, stage: "style" as const }];
      expect(requiresDevelopSnapshot(reqs)).toBe(false);
      expect(requiresStyleSnapshot(reqs)).toBe(true);
    });

    it("detects develop edge-map requirement", () => {
      const reqs = [{ kind: "edge-map" as const, source: "develop" as const }];
      expect(requiresDevelopSnapshot(reqs)).toBe(true);
    });
  });

  describe("resolveAnalysisSourceCanvas", () => {
    it("returns style canvas for style source", () => {
      const styleCanvas = createMockCanvas();
      const inputs = {
        ...createEmptyAnalysisLayerInputs(),
        stageSnapshots: { develop: null, style: styleCanvas },
      };
      expect(resolveAnalysisSourceCanvas("style", inputs)).toBe(styleCanvas);
    });

    it("returns develop canvas for develop source", () => {
      const developCanvas = createMockCanvas();
      const styleCanvas = createMockCanvas();
      const inputs = {
        ...createEmptyAnalysisLayerInputs(),
        stageSnapshots: { develop: developCanvas, style: styleCanvas },
      };
      expect(resolveAnalysisSourceCanvas("develop", inputs)).toBe(developCanvas);
    });

    it("falls back to style when develop is null", () => {
      const styleCanvas = createMockCanvas();
      const inputs = {
        ...createEmptyAnalysisLayerInputs(),
        stageSnapshots: { develop: null, style: styleCanvas },
      };
      expect(resolveAnalysisSourceCanvas("develop", inputs)).toBe(styleCanvas);
    });

    it("throws when no canvas is available", () => {
      const inputs = createEmptyAnalysisLayerInputs();
      expect(() => resolveAnalysisSourceCanvas("style", inputs)).toThrow(
        /Analysis source "style" not available/
      );
    });
  });

  describe("validateAnalysisInputs", () => {
    it("passes with no requirements", () => {
      const result = validateAnalysisInputs([], createEmptyAnalysisLayerInputs());
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("passes when required stage snapshot is present", () => {
      const inputs = {
        ...createEmptyAnalysisLayerInputs(),
        stageSnapshots: { develop: null, style: createMockCanvas() },
      };
      const result = validateAnalysisInputs(
        [{ kind: "stage-snapshot", stage: "style" }],
        inputs
      );
      expect(result.valid).toBe(true);
    });

    it("fails when required stage snapshot is missing", () => {
      const result = validateAnalysisInputs(
        [{ kind: "stage-snapshot", stage: "develop" }],
        createEmptyAnalysisLayerInputs()
      );
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("stage-snapshot:develop");
    });

    it("fails when required edge-map is missing", () => {
      const result = validateAnalysisInputs(
        [{ kind: "edge-map", source: "style" }],
        createEmptyAnalysisLayerInputs()
      );
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("edge-map:style");
    });

    it("reports all missing requirements", () => {
      const result = validateAnalysisInputs(
        [
          { kind: "stage-snapshot", stage: "develop" },
          { kind: "stage-snapshot", stage: "style" },
          { kind: "edge-map", source: "style" },
        ],
        createEmptyAnalysisLayerInputs()
      );
      expect(result.valid).toBe(false);
      expect(result.missing).toHaveLength(3);
    });
  });
});
