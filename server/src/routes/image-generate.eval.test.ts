import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateMock = vi.fn();
const getRouteTargetsMock = vi.fn();
const downloadGeneratedImageMock = vi.fn();

const createPromptCompilerFixture = (input?: {
  negativePromptStrategy?: "native" | "merge_into_main";
  sourceImageExecution?: "native" | "reference_guided" | "unsupported";
  referenceRoleHandling?: {
    reference: "native" | "compiled_to_reference" | "compiled_to_text";
    edit: "native" | "compiled_to_reference" | "compiled_to_text";
    variation: "native" | "compiled_to_reference" | "compiled_to_text";
  };
  continuityStrength?: {
    subject: "strong" | "moderate" | "weak";
    style: "strong" | "moderate" | "weak";
    composition: "strong" | "moderate" | "weak";
    text: "strong" | "moderate" | "weak";
  };
}) => ({
  acceptedOperations: ["image.generate", "image.edit", "image.variation"],
  executableOperations: ["image.generate"],
  negativePromptStrategy: input?.negativePromptStrategy ?? "merge_into_main",
  sourceImageExecution: input?.sourceImageExecution ?? "unsupported",
  referenceRoleHandling:
    input?.referenceRoleHandling ?? {
      reference: "compiled_to_text",
      edit: "compiled_to_text",
      variation: "compiled_to_text",
    },
  continuityStrength:
    input?.continuityStrength ?? {
      subject: "weak",
      style: "weak",
      composition: "weak",
      text: "weak",
    },
  promptSurface: "natural_language" as const,
});

const repositoryMock = {
  close: vi.fn(),
  getConversationById: vi.fn(),
  getOrCreateActiveConversation: vi.fn(),
  getConversationSnapshot: vi.fn(),
  getPromptArtifactsForTurn: vi.fn(),
  getPromptObservabilityForConversation: vi.fn(),
  clearActiveConversation: vi.fn(),
  deleteTurn: vi.fn(),
  getGeneratedImageByCapability: vi.fn(),
  createTurn: vi.fn(),
  createGeneration: vi.fn(),
  createRun: vi.fn(),
  createPromptVersions: vi.fn(),
  updateConversationPromptState: vi.fn(),
  acceptConversationTurn: vi.fn(),
  completeGenerationSuccess: vi.fn(),
  completeGenerationFailure: vi.fn(),
  turnExists: vi.fn(),
};

const createRouteTargetFixture = (input: {
  modelId: "qwen-image-2-pro" | "seedream-v5";
  deploymentId?: string;
  providerId?: "dashscope" | "ark" | "kling";
  providerModel?: string;
  promptCompiler?: ReturnType<typeof createPromptCompilerFixture>;
}) => {
  if (input.modelId === "qwen-image-2-pro") {
    return {
      frontendModel: {
        id: "qwen-image-2-pro",
        logicalModel: "image.qwen.v2.pro",
        promptCompiler:
          input.promptCompiler ??
          createPromptCompilerFixture({
            negativePromptStrategy: "native",
            sourceImageExecution: "reference_guided",
            referenceRoleHandling: {
              reference: "native",
              edit: "compiled_to_reference",
              variation: "compiled_to_reference",
            },
            continuityStrength: {
              subject: "strong",
              style: "strong",
              composition: "strong",
              text: "strong",
            },
          }),
      },
      deployment: {
        id: input.deploymentId ?? "dashscope-qwen-image-2-pro-primary",
        providerModel: input.providerModel ?? "qwen-image-2.0-pro",
      },
      provider: {
        id: input.providerId ?? "dashscope",
      },
    };
  }

  return {
    frontendModel: {
      id: "seedream-v5",
      logicalModel: "image.seedream.v5",
      promptCompiler: input.promptCompiler ?? createPromptCompilerFixture(),
    },
    deployment: {
      id: input.deploymentId ?? "ark-seedream-v5-primary",
      providerModel: input.providerModel ?? "doubao-seedream-5-0-260128",
    },
    provider: {
      id: input.providerId ?? "ark",
    },
  };
};

vi.mock("../gateway/router/router", () => ({
  imageRuntimeRouter: {
    getRouteTargets: (...args: unknown[]) => getRouteTargetsMock(...args),
    generate: (...args: unknown[]) => generateMock(...args),
  },
}));

vi.mock("../shared/downloadGeneratedImage", () => ({
  downloadGeneratedImage: (...args: unknown[]) => downloadGeneratedImageMock(...args),
}));

const encodeBase64Url = (value: string) =>
  Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const createBearerToken = (userId: string, secret = "test-secret") => {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      sub: userId,
      exp: Math.floor(Date.now() / 1000) + 60,
    })
  );
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `Bearer ${header}.${payload}.${signature}`;
};

const createConversationRecord = () => ({
  id: "conversation-1",
  userId: "user-1",
  promptState: {
    committed: {
      prompt: "Original skyline",
      preserve: [],
      avoid: [],
      styleDirectives: [],
      continuityTargets: [],
      editOps: [],
      referenceAssetIds: [],
    },
    candidate: null,
    baseAssetId: null,
    candidateTurnId: null,
    revision: 0,
  },
  createdAt: "2026-03-12T00:00:00.000Z",
  updatedAt: "2026-03-12T00:00:00.000Z",
});

const createConversationSnapshot = (input: {
  promptState?: (typeof createConversationRecord extends () => infer T ? T : never)["promptState"];
  runs: Array<Record<string, unknown>>;
  jobs: Array<Record<string, unknown>>;
}) => ({
  id: "conversation-1",
  thread: {
    id: "conversation-1",
    creativeBrief: {
      latestPrompt: "Original skyline",
      latestModelId: "qwen-image-2-pro",
      acceptedAssetId: null,
      selectedAssetIds: [],
      recentAssetRefIds: [],
    },
    promptState: input.promptState ?? createConversationRecord().promptState,
    createdAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z",
  },
  turns: [],
  runs: input.runs,
  assets: [],
  assetEdges: [],
  jobs: input.jobs,
  createdAt: "2026-03-12T00:00:00.000Z",
  updatedAt: "2026-03-12T00:00:05.000Z",
});

const createApp = async () => {
  const { default: Fastify } = await import("fastify");
  const { imageGenerateRoute } = await import("./image-generate");

  const app = Fastify();
  app.decorate("chatStateRepository", repositoryMock);
  await app.register(imageGenerateRoute);
  return app;
};

describe("imageGenerateRoute evals", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AUTH_JWT_SECRET", "test-secret");
    generateMock.mockReset();
    getRouteTargetsMock.mockReset();
    downloadGeneratedImageMock.mockReset();
    Object.values(repositoryMock).forEach((mockFn) => {
      if ("mockReset" in mockFn) {
        mockFn.mockReset();
      }
    });

    repositoryMock.getOrCreateActiveConversation.mockResolvedValue(createConversationRecord());
    getRouteTargetsMock.mockReturnValue([createRouteTargetFixture({ modelId: "qwen-image-2-pro" })]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reuses prior dispatch artifacts for exact retries and keeps a single trace id", async () => {
    repositoryMock.turnExists.mockResolvedValue(true);
    repositoryMock.getConversationSnapshot.mockResolvedValue(
      createConversationSnapshot({
        runs: [
          {
            id: "run-1",
            turnId: "turn-1",
            jobId: "job-1",
            operation: "image.edit",
            status: "completed",
            requestedTarget: {
              modelId: "qwen-image-2-pro",
              logicalModel: "image.qwen.v2.pro",
              deploymentId: "dashscope-qwen-image-2-pro-primary",
              runtimeProvider: "dashscope",
              providerModel: "qwen-image-2.0-pro",
              pinned: false,
            },
            selectedTarget: {
              modelId: "qwen-image-2-pro",
              logicalModel: "image.qwen.v2.pro",
              deploymentId: "dashscope-qwen-image-2-pro-primary",
              runtimeProvider: "dashscope",
              providerModel: "qwen-image-2.0-pro",
              pinned: false,
            },
            executedTarget: {
              modelId: "qwen-image-2-pro",
              logicalModel: "image.qwen.v2.pro",
              deploymentId: "dashscope-qwen-image-2-pro-primary",
              runtimeProvider: "dashscope",
              providerModel: "qwen-image-2.0-pro",
              pinned: false,
            },
            prompt: {
              originalPrompt: "Remove the coffee cup",
              compiledPrompt: "Compiled edit",
              dispatchedPrompt: "Dispatched degraded edit",
              providerEffectivePrompt: null,
              semanticLosses: [
                {
                  code: "OPERATION_DEGRADED_TO_IMAGE_GENERATE",
                  severity: "warn",
                  fieldPath: "promptIR.operation",
                  degradeMode: "approximated",
                  userMessage: "This edit request was degraded.",
                },
              ],
              warnings: ["This edit request was degraded."],
            },
            error: null,
            warnings: [],
            assetIds: [],
            referencedAssetIds: ["thread-asset-1"],
            createdAt: "2026-03-12T00:00:00.000Z",
            completedAt: "2026-03-12T00:00:05.000Z",
            telemetry: {
              traceId: "trace-previous-run-1",
              providerRequestId: null,
              providerTaskId: null,
              latencyMs: 5000,
            },
          },
        ],
        jobs: [
          {
            id: "job-1",
            turnId: "turn-1",
            runId: "run-1",
            modelId: "qwen-image-2-pro",
            logicalModel: "image.qwen.v2.pro",
            deploymentId: "dashscope-qwen-image-2-pro-primary",
            runtimeProvider: "dashscope",
            providerModel: "qwen-image-2.0-pro",
            compiledPrompt: "Compiled edit",
            requestSnapshot: {
              prompt: "Remove the coffee cup",
              modelId: "qwen-image-2-pro",
              aspectRatio: "1:1",
              batchSize: 1,
              style: "none",
              referenceImages: [],
              assetRefs: [{ assetId: "thread-asset-1", role: "edit" }],
              modelParams: {
                promptExtend: true,
              },
            },
            status: "succeeded",
            error: null,
            createdAt: "2026-03-12T00:00:00.000Z",
            completedAt: "2026-03-12T00:00:05.000Z",
          },
        ],
      })
    );
    generateMock.mockImplementation(async (_request, options) => {
      const [target] = options.targets ?? [];
      if (!target) {
        throw new Error("Expected exact retry to select a single target.");
      }

      const resolvedRequest = await options.resolveRequest?.(target);
      if (!resolvedRequest) {
        throw new Error("Expected exact retry to resolve a dispatch request.");
      }

      return {
        modelId: "qwen-image-2-pro",
        logicalModel: "image.qwen.v2.pro",
        deploymentId: "dashscope-qwen-image-2-pro-primary",
        runtimeProvider: "dashscope",
        providerModel: "qwen-image-2.0-pro",
        warnings: [],
        images: [
          {
            binaryData: Buffer.from([1, 2, 3]),
            mimeType: "image/png",
          },
        ],
      };
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
      payload: {
        prompt: "This should be ignored",
        modelId: "seedream-v5",
        aspectRatio: "16:9",
        batchSize: 4,
        style: "none",
        referenceImages: [],
        modelParams: {},
        retryOfTurnId: "turn-1",
        retryMode: "exact",
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.traceId).toEqual(expect.any(String));
    expect(body.runs[1]?.telemetry?.traceId).toBe(body.traceId);

    const createdGeneration = repositoryMock.createGeneration.mock.calls[0]?.[0] as {
      run: {
        operation: string;
        telemetry: {
          traceId: string;
        };
      };
    };
    expect(createdGeneration.run.operation).toBe("image.edit");
    expect(createdGeneration.run.telemetry.traceId).toBe(body.traceId);

    const promptVersions = repositoryMock.createPromptVersions.mock.calls.flatMap(
      ([input]) => (input as { versions: Array<Record<string, unknown>> }).versions
    ) as Array<{
      stage: string;
      attempt: number | null;
      traceId: string | null;
    }>;

    expect(promptVersions).toHaveLength(2);
    expect(promptVersions.every((version) => version.stage === "dispatch")).toBe(true);
    expect(promptVersions.every((version) => version.traceId === body.traceId)).toBe(true);
    expect(promptVersions.map((version) => version.attempt)).toEqual([1, 1]);

    await app.close();
  });

  it("tracks fallback dispatches without losing requested or selected target snapshots", async () => {
    const { ProviderError } = await import("../providers/base/errors");
    const routeTargets = [
      createRouteTargetFixture({
        modelId: "qwen-image-2-pro",
        deploymentId: "dashscope-qwen-image-2-pro-primary",
        providerModel: "qwen-image-2.0-pro",
      }),
      createRouteTargetFixture({
        modelId: "qwen-image-2-pro",
        deploymentId: "dashscope-qwen-image-2-pro-fallback",
        providerModel: "qwen-image-2.0-pro-fallback",
        promptCompiler: createPromptCompilerFixture({
          negativePromptStrategy: "merge_into_main",
          sourceImageExecution: "unsupported",
          referenceRoleHandling: {
            reference: "compiled_to_text",
            edit: "compiled_to_text",
            variation: "compiled_to_text",
          },
          continuityStrength: {
            subject: "moderate",
            style: "moderate",
            composition: "weak",
            text: "weak",
          },
        }),
      }),
    ];
    const resolvedRequests: Array<Record<string, unknown>> = [];

    getRouteTargetsMock.mockReturnValue(routeTargets);
    generateMock.mockImplementation(async (_request, options) => {
      const [primaryTarget, fallbackTarget] = options.targets ?? [];
      if (!primaryTarget || !fallbackTarget) {
        throw new Error("Expected both primary and fallback route targets.");
      }

      const primaryRequest = await options.resolveRequest?.(primaryTarget);
      if (!primaryRequest) {
        throw new Error("Expected primary dispatch request.");
      }
      resolvedRequests.push(primaryRequest);

      try {
        throw new ProviderError("Primary target timed out.", 503);
      } catch (error) {
        if (!(error instanceof ProviderError) || error.statusCode !== 503) {
          throw error;
        }
      }

      const fallbackRequest = await options.resolveRequest?.(fallbackTarget);
      if (!fallbackRequest) {
        throw new Error("Expected fallback dispatch request.");
      }
      resolvedRequests.push(fallbackRequest);

      return {
        modelId: "qwen-image-2-pro",
        logicalModel: "image.qwen.v2.pro",
        deploymentId: "dashscope-qwen-image-2-pro-fallback",
        runtimeProvider: "dashscope",
        providerModel: "qwen-image-2.0-pro-fallback",
        warnings: ["Fallback target executed."],
        images: [
          {
            binaryData: Buffer.from([1, 2, 3]),
            mimeType: "image/png",
            revisedPrompt: "provider revised fallback prompt",
          },
        ],
      };
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
      payload: {
        prompt: "Remove the coffee cup while preserving the poster text",
        modelId: "qwen-image-2-pro",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        negativePrompt: "blurry text, watermark",
        referenceImages: [],
        assetRefs: [{ assetId: "thread-asset-1", role: "edit" }],
        promptIntent: {
          preserve: [],
          avoid: [],
          styleDirectives: [],
          continuityTargets: ["text"],
          editOps: [],
        },
        modelParams: {
          promptExtend: true,
        },
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.traceId).toEqual(expect.any(String));
    expect(resolvedRequests).toHaveLength(2);
    expect(resolvedRequests[0]).toMatchObject({
      requestedTarget: {
        deploymentId: "dashscope-qwen-image-2-pro-primary",
        provider: "dashscope",
      },
      negativePrompt: "blurry text, watermark",
    });
    expect(resolvedRequests[1]).toMatchObject({
      requestedTarget: {
        deploymentId: "dashscope-qwen-image-2-pro-fallback",
        provider: "dashscope",
      },
    });
    expect(resolvedRequests[1]?.negativePrompt).toBeUndefined();

    const promptVersions = repositoryMock.createPromptVersions.mock.calls.flatMap(
      ([input]) => (input as { versions: Array<Record<string, unknown>> }).versions
    ) as Array<{
      stage: string;
      targetKey: string | null;
      attempt: number | null;
      traceId: string | null;
      providerEffectivePrompt?: string | null;
      semanticLosses?: Array<{ code: string }>;
    }>;
    const compileArtifacts = promptVersions.filter((version) => version.stage === "compile");
    const dispatchArtifacts = promptVersions.filter((version) => version.stage === "dispatch");

    expect(promptVersions.every((version) => version.traceId === body.traceId)).toBe(true);
    expect(compileArtifacts.map((version) => version.targetKey)).toEqual([
      "dashscope:qwen-image-2.0-pro",
      "dashscope:qwen-image-2.0-pro-fallback",
    ]);
    expect(
      compileArtifacts.map((version) => version.semanticLosses?.map((loss) => loss.code) ?? [])
    ).toEqual([
      expect.arrayContaining([
        "OPERATION_DEGRADED_TO_IMAGE_GENERATE",
        "APPROXIMATED_AS_REGENERATION",
        "ASSET_ROLE_DEGRADED_TO_REFERENCE_GUIDANCE",
        "STYLE_REFERENCE_ROLE_COLLAPSED",
      ]),
      expect.arrayContaining([
        "OPERATION_DEGRADED_TO_IMAGE_GENERATE",
        "APPROXIMATED_AS_REGENERATION",
        "SOURCE_IMAGE_NOT_EXECUTABLE",
        "STYLE_REFERENCE_ROLE_COLLAPSED",
        "EXACT_TEXT_CONTINUITY_AT_RISK",
        "NEGATIVE_PROMPT_DEGRADED_TO_TEXT",
      ]),
    ]);
    expect(
      dispatchArtifacts.map((version) => ({
        attempt: version.attempt,
        targetKey: version.targetKey,
        providerEffectivePrompt: version.providerEffectivePrompt ?? null,
      }))
    ).toEqual([
      {
        attempt: 1,
        targetKey: "dashscope:qwen-image-2.0-pro",
        providerEffectivePrompt: null,
      },
      {
        attempt: 2,
        targetKey: "dashscope:qwen-image-2.0-pro-fallback",
        providerEffectivePrompt: null,
      },
      {
        attempt: 2,
        targetKey: "dashscope:qwen-image-2.0-pro-fallback",
        providerEffectivePrompt: "provider revised fallback prompt",
      },
    ]);

    expect(repositoryMock.completeGenerationSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        run: expect.objectContaining({
          telemetry: expect.objectContaining({
            traceId: body.traceId,
          }),
          executedTarget: expect.objectContaining({
            deploymentId: "dashscope-qwen-image-2-pro-fallback",
            providerModel: "qwen-image-2.0-pro-fallback",
          }),
        }),
      })
    );
    expect(body).toMatchObject({
      runtimeProvider: "dashscope",
      providerModel: "qwen-image-2.0-pro-fallback",
      runs: [
        expect.any(Object),
        expect.objectContaining({
          telemetry: expect.objectContaining({
            traceId: body.traceId,
          }),
          requestedTarget: expect.objectContaining({
            deploymentId: "dashscope-qwen-image-2-pro-primary",
            providerModel: "qwen-image-2.0-pro",
          }),
          selectedTarget: expect.objectContaining({
            deploymentId: "dashscope-qwen-image-2-pro-primary",
            providerModel: "qwen-image-2.0-pro",
          }),
          executedTarget: expect.objectContaining({
            deploymentId: "dashscope-qwen-image-2-pro-fallback",
            providerModel: "qwen-image-2.0-pro-fallback",
          }),
        }),
      ],
    });

    await app.close();
  });
});
