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

const resolveRouteSelectionFixture = (modelId: string) => {
  if (modelId === "qwen-image-2-pro") {
    return [createRouteTargetFixture({ modelId: "qwen-image-2-pro" })];
  }

  return [createRouteTargetFixture({ modelId: "seedream-v5" })];
};

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

const createUnsignedDevBearerToken = (userId: string) => {
  const header = encodeBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      sub: userId,
      exp: Math.floor(Date.now() / 1000) + 60,
    })
  );

  return `Bearer ${header}.${payload}.dev`;
};

const createApp = async () => {
  const { default: Fastify } = await import("fastify");
  const { imageGenerateRoute } = await import("./image-generate");

  const app = Fastify();
  app.decorate("chatStateRepository", repositoryMock);
  await app.register(imageGenerateRoute);
  return app;
};

describe("imageGenerateRoute", () => {
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

    getRouteTargetsMock.mockImplementation((request: { modelId: string }) =>
      resolveRouteSelectionFixture(request.modelId)
    );
    repositoryMock.getOrCreateActiveConversation.mockResolvedValue({
      id: "conversation-1",
      userId: "user-1",
      promptState: {
        committed: {
          prompt: null,
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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated generation requests", async () => {
    const app = await createApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      payload: {
        prompt: "Studio portrait",
        modelId: "qwen-image-2-pro",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(401);
    expect(generateMock).not.toHaveBeenCalled();
    expect(repositoryMock.createGeneration).not.toHaveBeenCalled();

    await app.close();
  });

  it("accepts the default development bearer token flow", async () => {
    vi.stubEnv("NODE_ENV", "development");
    generateMock.mockResolvedValue({
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
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      headers: {
        Authorization: createUnsignedDevBearerToken("local-user"),
      },
      payload: {
        prompt: "Studio portrait",
        modelId: "qwen-image-2-pro",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(200);
    expect(repositoryMock.createGeneration).toHaveBeenCalled();
    expect(repositoryMock.completeGenerationSuccess).toHaveBeenCalled();

    await app.close();
  });

  it("persists generated binaries and returns capability urls", async () => {
    generateMock.mockResolvedValue({
      modelId: "qwen-image-2-pro",
      logicalModel: "image.qwen.v2.pro",
      deploymentId: "dashscope-qwen-image-2-pro-primary",
      runtimeProvider: "dashscope",
      providerModel: "qwen-image-2.0-pro",
      warnings: ["2 of 4 images completed."],
      images: [
        {
          imageUrl: "https://cdn.example.com/remote.png",
          revisedPrompt: "remote prompt",
        },
        {
          binaryData: Buffer.from([1, 2, 3]),
          mimeType: "image/png",
        },
      ],
    });
    downloadGeneratedImageMock.mockResolvedValue({
      buffer: Buffer.from([9, 8, 7]),
      mimeType: "image/png",
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
      payload: {
        prompt: "Studio portrait",
        modelId: "qwen-image-2-pro",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(200);
    expect(generateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "qwen-image-2-pro",
      }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
    expect(repositoryMock.completeGenerationSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conversation-1",
        generatedImages: [
          expect.objectContaining({
            ownerUserId: "user-1",
            visibility: "private",
            mimeType: "image/png",
            blobData: Buffer.from([9, 8, 7]),
          }),
          expect.objectContaining({
            ownerUserId: "user-1",
            visibility: "private",
            mimeType: "image/png",
            blobData: Buffer.from([1, 2, 3]),
          }),
        ],
        results: [
          expect.objectContaining({
            imageId: expect.any(String),
            imageUrl: expect.stringMatching(/^\/api\/generated-images\/[^?]+\?token=/),
          }),
          expect.objectContaining({
            imageId: expect.any(String),
            imageUrl: expect.stringMatching(/^\/api\/generated-images\/[^?]+\?token=/),
          }),
        ],
      })
    );

    const body = response.json();
    expect(body.imageId).toEqual(expect.any(String));
    expect(body.imageUrl).toMatch(/^\/api\/generated-images\/[^?]+\?token=/);
    expect(body.images).toHaveLength(2);
    expect(body.images[0]).toMatchObject({
      provider: "dashscope",
      model: "qwen-image-2.0-pro",
    });
    expect(body.images[0].imageUrl).toMatch(/^\/api\/generated-images\/[^?]+\?token=/);

    await app.close();
  });

  it("stores lightweight turn snapshots and replayable request snapshots for reference-guided turns", async () => {
    generateMock.mockResolvedValue({
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
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
      payload: {
        prompt: "Refine this composition",
        modelId: "qwen-image-2-pro",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [
          {
            id: "ref-1",
            url: "data:image/png;base64,AAA",
            fileName: "turn-result.png",
            type: "content",
            sourceAssetId: "thread-asset-1",
          },
        ],
        assetRefs: [{ assetId: "thread-asset-1", role: "reference" }],
        modelParams: {
          promptExtend: true,
        },
      },
    });

    expect(response.statusCode).toBe(200);

    const createdGeneration = repositoryMock.createGeneration.mock.calls[0]?.[0] as {
      turn: {
        configSnapshot: {
          referenceImages?: Array<Record<string, unknown>>;
        };
      };
      job: {
        requestSnapshot: {
          referenceImages?: Array<Record<string, unknown>>;
        };
      };
    };

    expect(createdGeneration.turn.configSnapshot.referenceImages).toEqual([
      expect.objectContaining({
        id: "ref-1",
        fileName: "turn-result.png",
        type: "content",
        sourceAssetId: "thread-asset-1",
      }),
    ]);
    expect(createdGeneration.turn.configSnapshot.referenceImages?.[0]).not.toHaveProperty("url");

    expect(createdGeneration.job.requestSnapshot.referenceImages).toEqual([
      expect.objectContaining({
        id: "ref-1",
        url: "data:image/png;base64,AAA",
        fileName: "turn-result.png",
        type: "content",
        sourceAssetId: "thread-asset-1",
      }),
    ]);

    await app.close();
  });

  it("accepts edit turns as semantic operations and persists degraded prompt artifacts", async () => {
    generateMock.mockResolvedValue({
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
          revisedPrompt: "provider revised edit prompt",
        },
      ],
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
      payload: {
        prompt: "Remove the coffee cup from the poster",
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
    });

    expect(response.statusCode).toBe(200);

    const createdGeneration = repositoryMock.createGeneration.mock.calls[0]?.[0] as {
      run: {
        operation: string;
      };
    };
    expect(createdGeneration.run.operation).toBe("image.edit");

    const promptVersions = repositoryMock.createPromptVersions.mock.calls.flatMap(
      ([input]) => (input as { versions: Array<Record<string, unknown>> }).versions
    );
    const compileArtifact = promptVersions.find(
      (version) => version.stage === "compile" && version.targetKey === "dashscope:qwen-image-2.0-pro"
    );
    const finalDispatchArtifact = promptVersions.find(
      (version) =>
        version.stage === "dispatch" &&
        version.providerEffectivePrompt === "provider revised edit prompt"
    );

    expect(compileArtifact).toMatchObject({
      stage: "compile",
      semanticLosses: expect.arrayContaining([
        expect.objectContaining({ code: "OPERATION_DEGRADED_TO_IMAGE_GENERATE" }),
        expect.objectContaining({ code: "APPROXIMATED_AS_REGENERATION" }),
        expect.objectContaining({ code: "ASSET_ROLE_DEGRADED_TO_REFERENCE_GUIDANCE" }),
      ]),
    });
    expect(finalDispatchArtifact).toMatchObject({
      stage: "dispatch",
      targetKey: "dashscope:qwen-image-2.0-pro",
      providerEffectivePrompt: "provider revised edit prompt",
    });
    expect(repositoryMock.completeGenerationSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        assetEdges: [
          expect.objectContaining({
            sourceAssetId: "thread-asset-1",
            edgeType: "referenced_in_turn",
          }),
        ],
      })
    );

    await app.close();
  });

  it("reuses the prior executable request snapshot for exact retries", async () => {
    repositoryMock.turnExists.mockResolvedValue(true);
    repositoryMock.getConversationSnapshot.mockResolvedValue({
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
      },
      turns: [],
      runs: [
        {
          id: "run-moderation-1",
          turnId: "turn-1",
          jobId: "job-moderation-1",
          operation: "moderation",
          status: "completed",
          requestedTarget: null,
          selectedTarget: null,
          executedTarget: null,
          prompt: {
            originalPrompt: "Original skyline",
            compiledPrompt: "Moderation prompt",
            dispatchedPrompt: "Moderation prompt",
            providerEffectivePrompt: null,
            semanticLosses: [],
            warnings: [],
          },
          error: null,
          warnings: [],
          assetIds: [],
          referencedAssetIds: [],
          createdAt: "2026-03-12T00:00:00.000Z",
          completedAt: "2026-03-12T00:00:02.000Z",
          telemetry: {
            providerRequestId: null,
            providerTaskId: null,
            latencyMs: 2000,
          },
        },
        {
          id: "run-1",
          turnId: "turn-1",
          jobId: "job-1",
          operation: "image.generate",
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
            originalPrompt: "Original skyline",
            compiledPrompt: "Compiled skyline",
            dispatchedPrompt: "Dispatched skyline",
            providerEffectivePrompt: null,
            semanticLosses: [],
            warnings: [],
          },
          error: null,
          warnings: [],
          assetIds: [],
          referencedAssetIds: [],
          createdAt: "2026-03-12T00:00:00.000Z",
          completedAt: "2026-03-12T00:00:05.000Z",
          telemetry: {
            providerRequestId: null,
            providerTaskId: null,
            latencyMs: 5000,
          },
        },
      ],
      assets: [],
      assetEdges: [],
      jobs: [
        {
          id: "job-moderation-1",
          turnId: "turn-1",
          runId: "run-moderation-1",
          modelId: "qwen-image-2-pro",
          logicalModel: "image.qwen.v2.pro",
          deploymentId: "dashscope-qwen-image-2-pro-primary",
          runtimeProvider: "dashscope",
          providerModel: "qwen-image-2.0-pro",
          compiledPrompt: "Moderation prompt",
          requestSnapshot: {
            prompt: "Original skyline",
            modelId: "seedream-v5",
            aspectRatio: "1:1",
            batchSize: 1,
            style: "none",
            referenceImages: [],
            modelParams: {},
          },
          status: "succeeded",
          error: null,
          createdAt: "2026-03-12T00:00:00.000Z",
          completedAt: "2026-03-12T00:00:02.000Z",
        },
        {
          id: "job-1",
          turnId: "turn-1",
          runId: "run-1",
          modelId: "qwen-image-2-pro",
          logicalModel: "image.qwen.v2.pro",
          deploymentId: "dashscope-qwen-image-2-pro-primary",
          runtimeProvider: "dashscope",
          providerModel: "qwen-image-2.0-pro",
          compiledPrompt: "Compiled skyline",
          requestSnapshot: {
            prompt: "Original skyline",
            modelId: "qwen-image-2-pro",
            aspectRatio: "16:9",
            batchSize: 2,
            style: "none",
            referenceImages: [],
            seed: 17,
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
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:05.000Z",
    });
    generateMock.mockResolvedValue({
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
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
      payload: {
        prompt: "New prompt should be ignored",
        modelId: "seedream-v5",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        modelParams: {},
        retryOfTurnId: "turn-1",
        retryMode: "exact",
      },
    });

    expect(response.statusCode).toBe(200);
    const [requestArg, optionsArg] = generateMock.mock.calls[0] as [
      {
        prompt: string;
        modelId: string;
        aspectRatio: string;
        batchSize: number;
        seed: number;
        conversationId: string;
        threadId: string;
      },
      {
        resolveRequest: (
          target: ReturnType<typeof resolveRouteSelectionFixture>[number]
        ) => Promise<Record<string, unknown>>;
      },
    ];
    expect(requestArg).toMatchObject({
      prompt: "Original skyline",
      modelId: "qwen-image-2-pro",
      aspectRatio: "16:9",
      batchSize: 2,
      seed: 17,
      conversationId: "conversation-1",
      threadId: "conversation-1",
    });
    const resolvedRequest = await optionsArg.resolveRequest(
      resolveRouteSelectionFixture("qwen-image-2-pro")[0]
    );
    expect(resolvedRequest).toMatchObject({
      prompt: "Dispatched skyline",
      modelId: "qwen-image-2-pro",
      aspectRatio: "16:9",
      batchSize: 2,
      seed: 17,
      retryOfTurnId: "turn-1",
      retryMode: "exact",
      requestedTarget: {
        deploymentId: "dashscope-qwen-image-2-pro-primary",
        provider: "dashscope",
      },
    });
    const createdGeneration = repositoryMock.createGeneration.mock.calls[0]?.[0] as {
      turn: { prompt: string };
      job: {
        requestSnapshot: {
          prompt: string;
          modelId: string;
          aspectRatio: string;
          batchSize: number;
          seed: number;
        };
      };
    };
    expect(createdGeneration.turn.prompt).toBe("Original skyline");
    expect(createdGeneration.job.requestSnapshot).toMatchObject({
      prompt: "Original skyline",
      modelId: "qwen-image-2-pro",
      aspectRatio: "16:9",
      batchSize: 2,
      seed: 17,
      retryOfTurnId: "turn-1",
      retryMode: "exact",
    });
    const promptVersions = repositoryMock.createPromptVersions.mock.calls.flatMap(
      ([input]) => (input as { versions: Array<Record<string, unknown>> }).versions
    );
    expect(promptVersions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "dispatch",
          committedStateBefore: null,
          candidateStateAfter: null,
          promptIR: null,
        }),
      ])
    );
    expect(
      promptVersions.some(
        (version) =>
          version.stage === "rewrite" || version.stage === "compile"
      )
    ).toBe(false);

    await app.close();
  });

  it("reuses degraded edit artifacts for exact retries instead of recompiling", async () => {
    repositoryMock.turnExists.mockResolvedValue(true);
    repositoryMock.getConversationSnapshot.mockResolvedValue({
      id: "conversation-1",
      thread: {
        id: "conversation-1",
        creativeBrief: {
          latestPrompt: "Remove the coffee cup",
          latestModelId: "qwen-image-2-pro",
          acceptedAssetId: null,
          selectedAssetIds: [],
          recentAssetRefIds: [],
        },
        promptState: {
          committed: {
            prompt: "Remove the coffee cup",
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
      },
      turns: [],
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
            providerRequestId: null,
            providerTaskId: null,
            latencyMs: 5000,
          },
        },
      ],
      assets: [],
      assetEdges: [],
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
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:05.000Z",
    });
    generateMock.mockResolvedValue({
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

    const [requestArg, optionsArg] = generateMock.mock.calls[0] as [
      {
        prompt: string;
        modelId: string;
      },
      {
        resolveRequest: (
          target: ReturnType<typeof resolveRouteSelectionFixture>[number]
        ) => Promise<Record<string, unknown>>;
      },
    ];
    expect(requestArg).toMatchObject({
      prompt: "Remove the coffee cup",
      modelId: "qwen-image-2-pro",
    });
    const resolvedRequest = await optionsArg.resolveRequest(
      resolveRouteSelectionFixture("qwen-image-2-pro")[0]
    );
    expect(resolvedRequest).toMatchObject({
      prompt: "Dispatched degraded edit",
      retryOfTurnId: "turn-1",
      retryMode: "exact",
    });

    const createdGeneration = repositoryMock.createGeneration.mock.calls[0]?.[0] as {
      run: {
        operation: string;
      };
    };
    expect(createdGeneration.run.operation).toBe("image.edit");
    const promptVersions = repositoryMock.createPromptVersions.mock.calls.flatMap(
      ([input]) => (input as { versions: Array<Record<string, unknown>> }).versions
    );
    expect(
      promptVersions.some(
        (version) =>
          version.stage === "rewrite" || version.stage === "compile"
      )
    ).toBe(false);
    expect(promptVersions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "dispatch",
          committedStateBefore: null,
          candidateStateAfter: null,
          promptIR: null,
        }),
      ])
    );

    await app.close();
  });

  it("replays dispatch artifacts and target snapshots when a retriable fallback succeeds", async () => {
    const { ProviderError } = await import("../providers/base/errors");
    const dualRouteTargets = [
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

    getRouteTargetsMock.mockReturnValue(dualRouteTargets);
    generateMock.mockImplementation(async (_request, options) => {
      const routeTargets = options.targets ?? [];
      if (routeTargets.length !== 2) {
        throw new Error("Expected route fallback test to receive both router targets.");
      }

      const [firstTarget, secondTarget] = routeTargets;
      if (
        firstTarget.deployment.id !== dualRouteTargets[0]?.deployment.id ||
        secondTarget.deployment.id !== dualRouteTargets[1]?.deployment.id
      ) {
        throw new Error("Route passed unexpected target order into router.generate.");
      }

      const firstResolvedRequest = await options.resolveRequest?.(firstTarget);
      if (!firstResolvedRequest) {
        throw new Error("Expected primary dispatch request.");
      }
      resolvedRequests.push(firstResolvedRequest);

      try {
        throw new ProviderError("Primary target timed out.", 503);
      } catch (error) {
        if (!(error instanceof ProviderError) || error.statusCode !== 503) {
          throw error;
        }
      }

      const secondResolvedRequest = await options.resolveRequest?.(secondTarget);
      if (!secondResolvedRequest) {
        throw new Error("Expected fallback dispatch request.");
      }
      resolvedRequests.push(secondResolvedRequest);

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
      providerEffectivePrompt?: string | null;
      semanticLosses?: Array<{ code: string }>;
    }>;
    const compileArtifacts = promptVersions.filter((version) => version.stage === "compile");
    const dispatchArtifacts = promptVersions.filter((version) => version.stage === "dispatch");

    expect(compileArtifacts).toHaveLength(2);
    expect(
      compileArtifacts.map((version) => ({
        targetKey: version.targetKey,
        semanticLossCodes: version.semanticLosses?.map((loss) => loss.code) ?? [],
      }))
    ).toEqual([
      {
        targetKey: "dashscope:qwen-image-2.0-pro",
        semanticLossCodes: expect.arrayContaining([
          "OPERATION_DEGRADED_TO_IMAGE_GENERATE",
          "APPROXIMATED_AS_REGENERATION",
          "ASSET_ROLE_DEGRADED_TO_REFERENCE_GUIDANCE",
          "STYLE_REFERENCE_ROLE_COLLAPSED",
        ]),
      },
      {
        targetKey: "dashscope:qwen-image-2.0-pro-fallback",
        semanticLossCodes: expect.arrayContaining([
          "OPERATION_DEGRADED_TO_IMAGE_GENERATE",
          "APPROXIMATED_AS_REGENERATION",
          "SOURCE_IMAGE_NOT_EXECUTABLE",
          "STYLE_REFERENCE_ROLE_COLLAPSED",
          "EXACT_TEXT_CONTINUITY_AT_RISK",
          "NEGATIVE_PROMPT_DEGRADED_TO_TEXT",
        ]),
      },
    ]);

    expect(dispatchArtifacts).toHaveLength(3);
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

    const createdGeneration = repositoryMock.createGeneration.mock.calls[0]?.[0] as {
      run: {
        requestedTarget: {
          deploymentId: string;
          providerModel: string;
        };
        selectedTarget: {
          deploymentId: string;
          providerModel: string;
        };
      };
    };
    expect(createdGeneration.run.requestedTarget).toMatchObject({
      deploymentId: "dashscope-qwen-image-2-pro-primary",
      providerModel: "qwen-image-2.0-pro",
    });
    expect(createdGeneration.run.selectedTarget).toMatchObject({
      deploymentId: "dashscope-qwen-image-2-pro-primary",
      providerModel: "qwen-image-2.0-pro",
    });

    expect(repositoryMock.completeGenerationSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeProvider: "dashscope",
        providerModel: "qwen-image-2.0-pro-fallback",
        run: expect.objectContaining({
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

  it("stops fallback after a non-retriable provider failure", async () => {
    const { ProviderError } = await import("../providers/base/errors");
    const dualRouteTargets = [
      createRouteTargetFixture({
        modelId: "qwen-image-2-pro",
        deploymentId: "dashscope-qwen-image-2-pro-primary",
        providerModel: "qwen-image-2.0-pro",
      }),
      createRouteTargetFixture({
        modelId: "qwen-image-2-pro",
        deploymentId: "dashscope-qwen-image-2-pro-fallback",
        providerModel: "qwen-image-2.0-pro-fallback",
      }),
    ];
    const resolvedRequests: Array<Record<string, unknown>> = [];

    getRouteTargetsMock.mockReturnValue(dualRouteTargets);
    generateMock.mockImplementation(async (_request, options) => {
      const routeTargets = options.targets ?? [];
      if (routeTargets.length !== 2) {
        throw new Error("Expected route fallback test to receive both router targets.");
      }

      const [firstTarget, secondTarget] = routeTargets;
      if (
        firstTarget.deployment.id !== dualRouteTargets[0]?.deployment.id ||
        secondTarget.deployment.id !== dualRouteTargets[1]?.deployment.id
      ) {
        throw new Error("Route passed unexpected target order into router.generate.");
      }

      const firstResolvedRequest = await options.resolveRequest?.(firstTarget);
      if (!firstResolvedRequest) {
        throw new Error("Expected primary dispatch request.");
      }
      resolvedRequests.push(firstResolvedRequest);
      throw new ProviderError("Primary target rejected request.", 400);
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
      payload: {
        prompt: "Poster cleanup",
        modelId: "qwen-image-2-pro",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        modelParams: {
          promptExtend: true,
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "Primary target rejected request.",
      conversationId: "conversation-1",
      threadId: "conversation-1",
      turnId: expect.any(String),
      jobId: expect.any(String),
      runId: expect.any(String),
    });
    expect(resolvedRequests).toHaveLength(1);

    const promptVersions = repositoryMock.createPromptVersions.mock.calls.flatMap(
      ([input]) => (input as { versions: Array<Record<string, unknown>> }).versions
    ) as Array<{
      stage: string;
      attempt: number | null;
      targetKey: string | null;
    }>;
    const dispatchArtifacts = promptVersions.filter((version) => version.stage === "dispatch");

    expect(dispatchArtifacts).toHaveLength(1);
    expect(
      dispatchArtifacts.map((version) => ({
        attempt: version.attempt,
        targetKey: version.targetKey,
      }))
    ).toEqual([
      {
        attempt: 1,
        targetKey: "dashscope:qwen-image-2.0-pro",
      },
    ]);
    expect(repositoryMock.completeGenerationFailure).toHaveBeenCalled();

    await app.close();
  });

  it("fails the generation when binary output exceeds the persistence limit", async () => {
    vi.stubEnv("GENERATED_IMAGE_DOWNLOAD_MAX_MB", "1");
    generateMock.mockResolvedValue({
      modelId: "seedream-v5",
      logicalModel: "image.seedream.v5",
      deploymentId: "ark-seedream-v5-primary",
      runtimeProvider: "ark",
      providerModel: "doubao-seedream-5-0-260128",
      images: [
        {
          binaryData: Buffer.alloc(1_200_000, 1),
          mimeType: "image/png",
        },
      ],
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
      payload: {
        prompt: "Too large",
        modelId: "seedream-v5",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(413);
    expect(repositoryMock.completeGenerationFailure).toHaveBeenCalled();

    await app.close();
  });

  it("returns provider errors together with persisted identifiers", async () => {
    const { ProviderError } = await import("../providers/base/errors");
    generateMock.mockRejectedValue(new ProviderError("Provider rejected request.", 429));

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
      payload: {
        prompt: "Studio portrait",
        modelId: "qwen-image-2-pro",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      error: "Provider rejected request.",
      conversationId: "conversation-1",
      threadId: "conversation-1",
      turnId: expect.any(String),
      jobId: expect.any(String),
      runId: expect.any(String),
    });
    expect(repositoryMock.completeGenerationFailure).toHaveBeenCalled();

    await app.close();
  });
});
