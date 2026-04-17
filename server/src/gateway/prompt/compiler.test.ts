import { describe, expect, it } from "vitest";
import type { ImageModelPromptCompilerCapabilities } from "../../../../shared/imageModelCatalog";
import { getImageModelCapabilityFactByModelId } from "../../../../shared/imageModelCapabilityFacts";
import { imageGenerationRequestSchema } from "../../shared/imageGenerationSchema";
import {
  applyTurnDelta,
  buildPromptIR,
  compilePromptForTarget,
  createPromptCompilationContext,
} from "./compiler";
import { createInitialConversationCreativeState } from "../../domain/prompt";
import type { ResolvedRouteTarget } from "../router/types";

const createRequest = (
  overrides: Partial<Parameters<typeof imageGenerationRequestSchema.parse>[0]> = {}
) =>
  imageGenerationRequestSchema.parse({
    prompt: "Refine the neon skyline",
    modelId: "qwen-image-2-pro",
    aspectRatio: "1:1",
    batchSize: 1,
    style: "none",
    modelParams: {
      promptExtend: true,
    },
    ...overrides,
  });

const createTarget = (
  modelId: Parameters<typeof getImageModelCapabilityFactByModelId>[0],
  promptCompiler?: ImageModelPromptCompilerCapabilities
): ResolvedRouteTarget => {
  const fact = getImageModelCapabilityFactByModelId(modelId);
  if (!fact) {
    throw new Error(`Missing capability fact for ${modelId}.`);
  }

  return {
    frontendModel: {
      id: fact.modelId,
      label: fact.modelId,
      logicalModel: fact.logicalModel,
      modelFamily: fact.modelFamily,
      capability: "image.generate",
      routingPolicy: "default",
      visible: true,
      description: `${fact.modelId} fixture`,
      constraints: fact.constraints,
      parameterDefinitions: fact.parameterDefinitions,
      defaults: fact.defaults,
      promptCompiler: promptCompiler ?? fact.promptCompiler,
      supportsUpscale: fact.supportsUpscale,
    },
    deployment: {
      id: `${fact.modelId}-deployment`,
      logicalModel: fact.logicalModel,
      provider: fact.modelFamily === "seedream" ? "ark" : fact.modelFamily === "kling" ? "kling" : "dashscope",
      providerModel: `${fact.modelId}-provider-model`,
      capability: "image.generate",
      enabled: true,
      priority: 1,
    },
    provider: {
      id: fact.modelFamily === "seedream" ? "ark" : fact.modelFamily === "kling" ? "kling" : "dashscope",
      name: fact.modelFamily === "seedream" ? "Ark" : fact.modelFamily === "kling" ? "Kling" : "DashScope",
      credentialSlot: fact.modelFamily === "seedream" ? "ark" : fact.modelFamily === "kling" ? "kling" : "dashscope",
      operations: ["image.generate"],
      healthScope: "model_operation",
      family: "http",
    },
  };
};

const createCandidateState = () =>
  applyTurnDelta(
    {
      ...createInitialConversationCreativeState(),
      baseAssetId: "base-asset-ignored",
    },
    {
      prompt: "Refine the neon skyline with cleaner typography",
      preserve: ["main character silhouette"],
      avoid: ["muddy shadows"],
      styleDirectives: ["cinematic"],
      continuityTargets: ["subject", "text"],
      editOps: [{ op: "remove", target: "coffee cup" }],
      referenceAssetIds: ["thread-asset-ref-1"],
    },
    "turn-1"
  );

describe("prompt compiler", () => {
  it.each([
    {
      name: "generate",
      inputAssets: [
        {
          assetId: "thread-asset-ref-1",
          binding: "guide" as const,
          guideType: "content" as const,
          weight: 1,
        },
      ],
      expectedOperation: "image.generate",
    },
    {
      name: "edit",
      operation: "edit" as const,
      inputAssets: [
        { assetId: "thread-asset-source-1", binding: "source" as const },
        {
          assetId: "thread-asset-ref-1",
          binding: "guide" as const,
          guideType: "content" as const,
          weight: 1,
        },
      ],
      expectedOperation: "image.edit",
    },
    {
      name: "variation",
      operation: "variation" as const,
      inputAssets: [
        { assetId: "thread-asset-source-1", binding: "source" as const },
        {
          assetId: "thread-asset-ref-1",
          binding: "guide" as const,
          guideType: "content" as const,
          weight: 1,
        },
      ],
      expectedOperation: "image.variation",
    },
  ])(
    "builds %s prompt IR with explicit source/reference assets",
    ({ inputAssets, operation, expectedOperation }) => {
      const request = createRequest({ inputAssets, operation });
    const promptIr = buildPromptIR(request, createCandidateState());

    expect(promptIr.operation).toBe(expectedOperation);
    expect(promptIr.goal).toBe("Refine the neon skyline with cleaner typography");
    expect(promptIr.sourceAssets).toEqual(
      request.inputAssets.filter((entry) => entry.binding === "source")
    );
    expect(promptIr.referenceAssets).toEqual(
      request.inputAssets.filter((entry) => entry.binding === "guide")
    );
    }
  );

  it("carries committed reference asset ids forward as generic reference guidance", () => {
    const request = createRequest({
      inputAssets: [],
    });
    const state = {
      ...createCandidateState(),
      committed: {
        ...createCandidateState().committed,
        referenceAssetIds: ["thread-asset-ref-committed"],
      },
      candidate: {
        ...createCandidateState().candidate!,
        referenceAssetIds: ["thread-asset-ref-committed"],
      },
    };

    const promptIr = buildPromptIR(request, state);

    expect(promptIr.operation).toBe("image.generate");
    expect(promptIr.sourceAssets).toEqual([]);
    expect(promptIr.referenceAssets).toEqual([
      {
        assetId: "thread-asset-ref-committed",
        binding: "guide",
        guideType: "content",
        weight: 1,
      },
    ]);
  });

  it("keeps native negative prompts out of the main compiled prompt", () => {
    const state = createCandidateState();
    const request = createRequest({
      negativePrompt: "avoid lens flare, avoid watermark",
    });
    const promptIr = buildPromptIR(request, state);
    const target = createTarget("qwen-image-2-pro", {
      ...getImageModelCapabilityFactByModelId("qwen-image-2-pro")!.promptCompiler,
      executableOperations: ["image.generate"],
      negativePromptStrategy: "native",
      continuityStrength: {
        subject: "strong",
        style: "strong",
        composition: "strong",
        text: "strong",
      },
    });
    const context = createPromptCompilationContext(state, "deterministic-fallback", "image.generate", "recompile");

    const compiled = compilePromptForTarget(request, promptIr, state, target, context);

    expect(compiled.negativePrompt).toBe("muddy shadows, avoid lens flare, avoid watermark");
    expect(compiled.compiledPrompt).not.toContain("avoid lens flare");
    expect(compiled.dispatchedPrompt).not.toContain("Avoid:");
    expect(compiled.dispatchedPrompt).not.toContain("## Identity");
    expect(compiled.semanticLosses).toEqual([]);
  });

  it("merges negative prompts into the main prompt when the target lacks a native channel", () => {
    const state = createCandidateState();
    const request = createRequest({
      negativePrompt: "avoid lens flare, avoid watermark",
    });
    const promptIr = buildPromptIR(request, state);
    const target = createTarget("seedream-v5", {
      ...getImageModelCapabilityFactByModelId("seedream-v5")!.promptCompiler,
      negativePromptStrategy: "merge_into_main",
    });
    const context = createPromptCompilationContext(state, "deterministic-fallback", "image.generate", "recompile");

    const compiled = compilePromptForTarget(request, promptIr, state, target, context);

    expect(compiled.negativePrompt).toBeNull();
    expect(compiled.compiledPrompt).toContain("avoid lens flare");
    expect(compiled.dispatchedPrompt).toContain("Avoid:");
    expect(compiled.dispatchedPrompt).not.toContain("## Identity");
    expect(compiled.semanticLosses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "NEGATIVE_PROMPT_DEGRADED_TO_TEXT",
        }),
      ])
    );
  });

  it("emits degradation warnings for non-native edit flows and keeps hashes stable", () => {
    const state = createCandidateState();
    const request = createRequest({
      negativePrompt: "avoid lens flare",
      operation: "edit",
      inputAssets: [{ assetId: "thread-asset-source-1", binding: "source" }],
    });
    const promptIr = buildPromptIR(request, state);
    const capabilities: ImageModelPromptCompilerCapabilities = {
      acceptedOperations: ["image.generate", "image.edit", "image.variation"],
      executableOperations: ["image.generate"],
      negativePromptStrategy: "merge_into_main",
      sourceImageExecution: "reference_guided",
      referenceRoleHandling: {
        reference: "native",
        edit: "compiled_to_reference",
        variation: "compiled_to_reference",
      },
      continuityStrength: {
        subject: "strong",
        style: "strong",
        composition: "moderate",
        text: "weak",
      },
      promptSurface: "natural_language",
    };
    const target = createTarget("qwen-image-2-pro", capabilities);
    const context = createPromptCompilationContext(state, "deterministic-fallback", "image.edit", "recompile");

    const first = compilePromptForTarget(request, promptIr, state, target, context);
    const second = compilePromptForTarget(request, promptIr, state, target, context);

    expect(first.compiledPrompt).toContain("Compiled Operation: image.generate");
    expect(first.dispatchedPrompt).not.toContain("## Identity");
    expect(first.dispatchedPrompt).not.toContain("## Compiler Context");
    expect(first.dispatchedPrompt).not.toContain("## Output Contract");
    expect(first.dispatchedPrompt).toContain("Refine the neon skyline");
    expect(first.dispatchedPrompt).toContain("Preserve:");
    expect(first.dispatchedPrompt).toContain("main character silhouette");
    expect(first.dispatchedPrompt).toContain("cinematic");
    expect(first.dispatchedPrompt).toContain("remove coffee cup");
    expect(first.dispatchedPrompt).toContain("Avoid:");
    expect(first.semanticLosses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "OPERATION_DEGRADED_TO_IMAGE_GENERATE" }),
        expect.objectContaining({ code: "APPROXIMATED_AS_REGENERATION" }),
        expect.objectContaining({ code: "ASSET_ROLE_DEGRADED_TO_REFERENCE_GUIDANCE" }),
        expect.objectContaining({ code: "EXACT_TEXT_CONTINUITY_AT_RISK" }),
        expect.objectContaining({ code: "NEGATIVE_PROMPT_DEGRADED_TO_TEXT" }),
      ])
    );
    expect(first.prefixHash).toBe(second.prefixHash);
    expect(first.payloadHash).toBe(second.payloadHash);
  });
});
