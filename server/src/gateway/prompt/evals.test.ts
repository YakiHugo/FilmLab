import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../config";
import type { ImageModelPromptCompilerCapabilities } from "../../../../shared/imageModelCatalog";
import { getImageModelCapabilityFactByModelId } from "../../../../shared/imageModelCapabilityFacts";
import { imageGenerationRequestSchema } from "../../shared/imageGenerationSchema";
import {
  applyTurnDelta,
  buildPromptIR,
  compilePromptForTarget,
  createPromptCompilationContext,
} from "./compiler";
import { buildFallbackTurnDelta, rewriteTurn } from "./rewrite";
import { createInitialConversationCreativeState } from "./types";
import type { ResolvedRouteTarget } from "../router/types";

const createConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 3001,
  corsOrigin: "http://localhost:5173",
  requestBodyLimitBytes: 12 * 1024 * 1024,
  providerRequestTimeoutMs: 120_000,
  rateLimitMax: 20,
  rateLimitTimeWindowMs: 60_000,
  imageGenerateRateLimitMax: 20,
  imageGenerateRateLimitTimeWindowMs: 60_000,
  imageUpscaleRateLimitMax: 20,
  imageUpscaleRateLimitTimeWindowMs: 60_000,
  generatedImageGetRateLimitMax: 120,
  generatedImageGetRateLimitTimeWindowMs: 60_000,
  generatedImageDownloadMaxBytes: 32 * 1024 * 1024,
  referenceImageDownloadMaxBytes: 8 * 1024 * 1024,
  promptRewriteTimeoutMs: 15_000,
  arkApiBaseUrl: "https://ark.example.com",
  dashscopeApiBaseUrl: "https://dashscope.example.com",
  klingApiBaseUrl: "https://kling.example.com",
  allowUnsignedDevAuth: false,
  devAuthAllowedUserIds: ["local-user"],
  ...overrides,
  trustProxyRequestId: overrides.trustProxyRequestId ?? false,
});

const createRequest = (
  overrides: Partial<Parameters<typeof imageGenerationRequestSchema.parse>[0]> = {}
) =>
  imageGenerationRequestSchema.parse({
    prompt: "Refine the neon skyline",
    modelId: "qwen-image-2-pro",
    aspectRatio: "1:1",
    batchSize: 1,
    style: "none",
    inputAssets: [],
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

  const providerId =
    fact.modelFamily === "seedream"
      ? "ark"
      : fact.modelFamily === "kling"
        ? "kling"
        : "dashscope";

  return {
    frontendModel: {
      id: fact.modelId,
      label: fact.modelId,
      logicalModel: fact.logicalModel,
      modelFamily: fact.modelFamily,
      capability: "image.generate",
      routingPolicy: "default",
      visible: true,
      description: `${fact.modelId} eval fixture`,
      constraints: fact.constraints,
      parameterDefinitions: fact.parameterDefinitions,
      defaults: fact.defaults,
      promptCompiler: promptCompiler ?? fact.promptCompiler,
      supportsUpscale: fact.supportsUpscale,
    },
    deployment: {
      id: `${fact.modelId}-deployment`,
      logicalModel: fact.logicalModel,
      provider: providerId,
      providerModel: `${fact.modelId}-provider-model`,
      capability: "image.generate",
      enabled: true,
      priority: 1,
    },
    provider: {
      id: providerId,
      name: providerId === "ark" ? "Ark" : providerId === "kling" ? "Kling" : "DashScope",
      credentialSlot: providerId,
      operations: ["image.generate"],
      healthScope: "model_operation",
      family: "http",
    },
  };
};

const createCandidateState = () =>
  applyTurnDelta(
    createInitialConversationCreativeState(),
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("prompt evals", () => {
  it("falls back deterministically when rewrite config is unavailable", async () => {
    const request = createRequest({
      prompt: "  Refine the neon skyline  ",
      promptIntent: {
        preserve: ["Poster text", "poster text"],
        avoid: ["  watermark  ", "Watermark"],
        styleDirectives: ["cinematic", " Cinematic "],
        continuityTargets: ["text"],
        editOps: [{ op: "remove", target: "coffee cup" }],
      },
      inputAssets: [
        { assetId: "thread-asset-ref-1", binding: "guide", guideType: "content" },
      ],
    });

    const result = await rewriteTurn(
      request,
      createInitialConversationCreativeState(),
      createConfig()
    );

    expect(result).toEqual({
      turnDelta: buildFallbackTurnDelta(request),
      degraded: true,
      warning: "Prompt rewrite degraded to deterministic fallback.",
    });
  });

  it("normalizes upstream rewrite output into the persisted turn delta shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                prompt: "  Refine the neon skyline  ",
                preserve: ["Poster text", "poster text", "Lead subject"],
                avoid: [" watermark ", "Watermark"],
                styleDirectives: ["cinematic", " Cinematic "],
                continuityTargets: ["subject", "text"],
                editOps: [{ op: "remove", target: "coffee cup" }],
                referenceAssetIds: ["thread-asset-ref-1", " thread-asset-ref-1 "],
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await rewriteTurn(
      createRequest(),
      createInitialConversationCreativeState(),
      createConfig({
        promptRewriteBaseUrl: "https://rewrite.example.com",
        promptRewriteApiKey: "rewrite-key",
        promptRewriteModel: "gpt-rewrite",
      })
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result).toEqual({
      turnDelta: {
        prompt: "Refine the neon skyline",
        preserve: ["Poster text", "Lead subject"],
        avoid: ["watermark"],
        styleDirectives: ["cinematic"],
        continuityTargets: ["subject", "text"],
        editOps: [{ op: "remove", target: "coffee cup" }],
        referenceAssetIds: ["thread-asset-ref-1"],
      },
      degraded: false,
      warning: null,
    });
  });

  it.each([
    {
      name: "negative prompt merge is emitted as semantic loss on text-only targets",
      request: createRequest({
        negativePrompt: "avoid lens flare, avoid watermark",
      }),
      target: createTarget("seedream-v5", {
        ...getImageModelCapabilityFactByModelId("seedream-v5")!.promptCompiler,
        negativePromptStrategy: "merge_into_main",
      }),
      operation: "image.generate" as const,
      expectedCodes: ["NEGATIVE_PROMPT_DEGRADED_TO_TEXT"],
      expectedNegativePrompt: null,
      compiledPromptIncludes: ["avoid lens flare", "avoid watermark"],
    },
    {
      name: "degraded edit flows preserve stable hashes and explicit loss codes",
      request: createRequest({
        negativePrompt: "avoid lens flare",
        operation: "edit",
        inputAssets: [{ assetId: "thread-asset-source-1", binding: "source" }],
      }),
      target: createTarget("qwen-image-2-pro", {
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
      }),
      operation: "image.edit" as const,
      expectedCodes: [
        "OPERATION_DEGRADED_TO_IMAGE_GENERATE",
        "APPROXIMATED_AS_REGENERATION",
        "ASSET_ROLE_DEGRADED_TO_REFERENCE_GUIDANCE",
        "STYLE_REFERENCE_ROLE_COLLAPSED",
        "EXACT_TEXT_CONTINUITY_AT_RISK",
        "NEGATIVE_PROMPT_DEGRADED_TO_TEXT",
      ],
      expectedNegativePrompt: null,
      compiledPromptIncludes: ["Compiled Operation: image.generate"],
    },
  ])("$name", ({ request, target, operation, expectedCodes, expectedNegativePrompt, compiledPromptIncludes }) => {
    const state = createCandidateState();
    const promptIr = buildPromptIR(request, state);
    const context = createPromptCompilationContext(
      state,
      "deterministic-fallback",
      operation,
      "recompile"
    );

    const first = compilePromptForTarget(request, promptIr, state, target, context);
    const second = compilePromptForTarget(request, promptIr, state, target, context);

    expect(first.negativePrompt).toBe(expectedNegativePrompt);
    expect(first.semanticLosses.map((loss) => loss.code)).toEqual(
      expect.arrayContaining(expectedCodes)
    );
    expect(first.prefixHash).toBe(second.prefixHash);
    expect(first.payloadHash).toBe(second.payloadHash);

    for (const snippet of compiledPromptIncludes) {
      expect(first.compiledPrompt).toContain(snippet);
    }
  });
});
