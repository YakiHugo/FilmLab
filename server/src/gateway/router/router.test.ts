import { beforeEach, describe, expect, it, vi } from "vitest";
import { imageGenerationRequestSchema } from "../../shared/imageGenerationSchema";
import type { ResolvedRouteTarget } from "./types";

const getPlatformModelAdapterMock = vi.fn();
const getRuntimeProviderConfigurationMock = vi.fn();
const getRuntimeProviderCredentialsMock = vi.fn();

vi.mock("../../providers/base/registry", () => ({
  getPlatformModelAdapter: (...args: unknown[]) => getPlatformModelAdapterMock(...args),
}));

vi.mock("./registry", () => ({
  getRuntimeProviderConfiguration: (...args: unknown[]) =>
    getRuntimeProviderConfigurationMock(...args),
  getRuntimeProviderCredentials: (...args: unknown[]) =>
    getRuntimeProviderCredentialsMock(...args),
}));

const createRequest = (
  overrides: Partial<Parameters<typeof imageGenerationRequestSchema.parse>[0]> = {}
) =>
  imageGenerationRequestSchema.parse({
    prompt: "Poster cleanup",
    modelId: "qwen-image-2-pro",
    aspectRatio: "1:1",
    batchSize: 1,
    style: "none",
    referenceImages: [],
    modelParams: {
      promptExtend: true,
    },
    ...overrides,
  });

const createTarget = (input: {
  deploymentId: string;
  providerModel: string;
  providerId?: "dashscope" | "ark" | "kling";
}): ResolvedRouteTarget =>
  ({
    frontendModel: {
      id: "qwen-image-2-pro",
      label: "Qwen Image 2.0 Pro",
      logicalModel: "image.qwen.v2.pro",
      modelFamily: "qwen",
      capability: "image.generate",
      routingPolicy: "default",
      visible: true,
      constraints: {
        supportsCustomSize: false,
        supportedAspectRatios: ["1:1"],
        maxBatchSize: 1,
        referenceImages: {
          enabled: false,
          maxImages: 0,
          supportedTypes: [],
          supportsWeight: false,
        },
        unsupportedFields: [],
      },
      parameterDefinitions: [],
      defaults: {
        aspectRatio: "1:1",
        width: null,
        height: null,
        batchSize: 1,
        negativePrompt: "",
        style: "none",
        stylePreset: "",
        seed: null,
        guidanceScale: null,
        steps: null,
        sampler: "",
        modelParams: {},
      },
      promptCompiler: {
        acceptedOperations: ["image.generate", "image.edit", "image.variation"],
        executableOperations: ["image.generate"],
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
        promptSurface: "natural_language",
      },
      supportsUpscale: false,
    },
    deployment: {
      id: input.deploymentId,
      logicalModel: "image.qwen.v2.pro",
      provider: input.providerId ?? "dashscope",
      providerModel: input.providerModel,
      capability: "image.generate",
      enabled: true,
      priority: 100,
    },
    provider: {
      id: input.providerId ?? "dashscope",
      name: "DashScope",
      credentialSlot: input.providerId ?? "dashscope",
      operations: ["image.generate", "image.upscale"],
      healthScope: "model_operation",
      family: "http",
    },
  }) satisfies ResolvedRouteTarget;

describe("imageRuntimeRouter.generate", () => {
  beforeEach(() => {
    vi.resetModules();
    getPlatformModelAdapterMock.mockReset();
    getRuntimeProviderConfigurationMock.mockReset();
    getRuntimeProviderCredentialsMock.mockReset();

    getRuntimeProviderConfigurationMock.mockReturnValue({
      configured: true,
      missingCredential: false,
    });
    getRuntimeProviderCredentialsMock.mockReturnValue({
      apiKey: "test-key",
    });
  });

  it("continues to the next target after a retriable provider error", async () => {
    const { imageRuntimeRouter } = await import("./router");
    const { ProviderError } = await import("../../providers/base/errors");
    const adapterGenerateMock = vi.fn();
    const seenDeployments: string[] = [];
    const resolvedPrompts: string[] = [];
    const resolveRequestMock = vi.fn(async (target: ResolvedRouteTarget) => ({
      ...createRequest(),
      prompt:
        target.deployment.id === "dashscope-qwen-image-2-pro-primary"
          ? "Primary compiled prompt"
          : "Fallback compiled prompt",
      requestedTarget: {
        deploymentId: target.deployment.id,
        provider: target.provider.id,
      },
    }));

    getPlatformModelAdapterMock.mockImplementation(() => ({
      provider: "dashscope",
      providerModel: "qwen-image-2.0-pro",
      transport: "http",
      generate: adapterGenerateMock,
    }));
    adapterGenerateMock.mockImplementation(async (input: { target: ResolvedRouteTarget; request: { prompt: string } }) => {
      seenDeployments.push(input.target.deployment.id);
      resolvedPrompts.push(input.request.prompt);
      if (input.target.deployment.id === "dashscope-qwen-image-2-pro-primary") {
        throw new ProviderError("Retry later.", 503);
      }

      return {
        modelId: "qwen-image-2-pro",
        logicalModel: "image.qwen.v2.pro",
        deploymentId: input.target.deployment.id,
        runtimeProvider: input.target.provider.id,
        providerModel: input.target.deployment.providerModel,
        warnings: [],
        images: [
          {
            binaryData: Buffer.from([1, 2, 3]),
            mimeType: "image/png",
          },
        ],
      };
    });

    const result = await imageRuntimeRouter.generate(createRequest(), {
      targets: [
        createTarget({
          deploymentId: "dashscope-qwen-image-2-pro-primary",
          providerModel: "qwen-image-2.0-pro",
        }),
        createTarget({
          deploymentId: "dashscope-qwen-image-2-pro-fallback",
          providerModel: "qwen-image-2.0-pro-fallback",
        }),
      ],
      resolveRequest: resolveRequestMock,
    });

    expect(resolveRequestMock).toHaveBeenCalledTimes(2);
    expect(seenDeployments).toEqual([
      "dashscope-qwen-image-2-pro-primary",
      "dashscope-qwen-image-2-pro-fallback",
    ]);
    expect(resolvedPrompts).toEqual([
      "Primary compiled prompt",
      "Fallback compiled prompt",
    ]);
    expect(result).toMatchObject({
      deploymentId: "dashscope-qwen-image-2-pro-fallback",
      providerModel: "qwen-image-2.0-pro-fallback",
    });
  });

  it("stops immediately when the provider error is not retriable", async () => {
    const { imageRuntimeRouter } = await import("./router");
    const { ProviderError } = await import("../../providers/base/errors");
    const adapterGenerateMock = vi.fn();
    const seenDeployments: string[] = [];
    const resolveRequestMock = vi.fn(async (target: ResolvedRouteTarget) => ({
      ...createRequest(),
      prompt: `Dispatch ${target.deployment.id}`,
      requestedTarget: {
        deploymentId: target.deployment.id,
        provider: target.provider.id,
      },
    }));

    getPlatformModelAdapterMock.mockImplementation(() => ({
      provider: "dashscope",
      providerModel: "qwen-image-2.0-pro",
      transport: "http",
      generate: adapterGenerateMock,
    }));
    adapterGenerateMock.mockImplementation(async (input: { target: ResolvedRouteTarget }) => {
      seenDeployments.push(input.target.deployment.id);
      throw new ProviderError("Invalid request.", 400);
    });

    await expect(
      imageRuntimeRouter.generate(createRequest(), {
        targets: [
          createTarget({
            deploymentId: "dashscope-qwen-image-2-pro-primary",
            providerModel: "qwen-image-2.0-pro",
          }),
          createTarget({
            deploymentId: "dashscope-qwen-image-2-pro-fallback",
            providerModel: "qwen-image-2.0-pro-fallback",
          }),
        ],
        resolveRequest: resolveRequestMock,
      })
    ).rejects.toMatchObject({
      message: "Invalid request.",
      statusCode: 400,
    });

    expect(resolveRequestMock).toHaveBeenCalledTimes(1);
    expect(seenDeployments).toEqual(["dashscope-qwen-image-2-pro-primary"]);
  });
});
