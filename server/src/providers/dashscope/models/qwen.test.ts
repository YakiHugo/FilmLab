import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformProviderGenerateInput } from "../../base/types";

const {
  createProviderRequestContextMock,
  fetchProviderResponseMock,
} = vi.hoisted(() => ({
  createProviderRequestContextMock: vi.fn(),
  fetchProviderResponseMock: vi.fn(),
}));

vi.mock("../../base/client", () => ({
  createProviderRequestContext: (...args: unknown[]) => createProviderRequestContextMock(...args),
  fetchProviderResponse: (...args: unknown[]) => fetchProviderResponseMock(...args),
}));

const createResponse = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });

const createInput = (): PlatformProviderGenerateInput =>
  ({
    target: {
      frontendModel: {
        id: "qwen-image-2-pro",
        label: "Qwen Image 2.0 Pro",
        logicalModel: "image.qwen.v2.pro",
        modelFamily: "qwen",
        capability: "image.generate",
        routingPolicy: "default",
        visible: true,
        constraints: {
          supportsCustomSize: true,
          supportedAspectRatios: ["1:1", "custom"],
          maxBatchSize: 6,
          referenceImages: {
            enabled: true,
            maxImages: 3,
            supportedTypes: ["content"],
            supportsWeight: false,
          },
          unsupportedFields: ["guidanceScale", "steps"],
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
        supportsUpscale: false,
      },
      deployment: {
        id: "dashscope-qwen-image-2-pro-primary",
        logicalModel: "image.qwen.v2.pro",
        provider: "dashscope",
        providerModel: "qwen-image-2.0-pro",
        capability: "image.generate",
        enabled: true,
        priority: 100,
      },
      provider: {
        id: "dashscope",
        name: "DashScope",
        credentialSlot: "dashscope",
        operations: ["image.generate"],
        healthScope: "model_operation",
        family: "http",
      },
    },
    request: {
      prompt: "Rainy alley",
      modelId: "qwen-image-2-pro",
      aspectRatio: "1:1",
      style: "none",
      negativePrompt: "avoid blur",
      referenceImages: [],
      batchSize: 1,
      modelParams: {
        promptExtend: true,
      },
    },
    credentials: {
      apiKey: "dashscope-key",
    },
    options: {
      timeoutMs: 3_000,
    },
  }) as unknown as PlatformProviderGenerateInput;

describe("generateDashscopeQwen", () => {
  beforeEach(() => {
    vi.resetModules();
    createProviderRequestContextMock.mockReset();
    fetchProviderResponseMock.mockReset();
    createProviderRequestContextMock.mockReturnValue({
      signal: undefined,
      timeoutMs: 3_000,
      traceId: "trace-1",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends text-only requests when no reference images are present", async () => {
    fetchProviderResponseMock.mockResolvedValueOnce(
      createResponse({
        output: {
          choices: [
            {
              message: {
                content: [{ image: "https://cdn.example.com/qwen.png" }],
              },
            },
          ],
        },
      })
    );

    const { generateDashscopeQwen } = await import("./qwen");
    await expect(generateDashscopeQwen(createInput())).resolves.toMatchObject({
      images: [{ imageUrl: "https://cdn.example.com/qwen.png" }],
    });

    const requestPayload = JSON.parse(
      String(fetchProviderResponseMock.mock.calls[0]?.[1]?.body)
    ) as {
      input: {
        messages: Array<{
          content: Array<Record<string, string>>;
        }>;
      };
    };
    expect(requestPayload.input.messages[0]?.content).toEqual([
      {
        text: "Rainy alley",
      },
    ]);
  });

  it("sends multimodal content when reference images are provided", async () => {
    fetchProviderResponseMock.mockResolvedValueOnce(
      createResponse({
        output: {
          choices: [
            {
              message: {
                content: [
                  { image: "https://cdn.example.com/qwen-ref.png" },
                  { text: "actual prompt" },
                ],
              },
            },
          ],
        },
      })
    );

    const { generateDashscopeQwen } = await import("./qwen");
    const input = createInput();
    input.request.referenceImages = [
      {
        id: "ref-1",
        url: "data:image/png;base64,AAA",
        type: "content",
      },
      {
        id: "ref-2",
        url: "data:image/png;base64,BBB",
        type: "content",
      },
    ];

    await expect(generateDashscopeQwen(input)).resolves.toMatchObject({
      images: [{ imageUrl: "https://cdn.example.com/qwen-ref.png" }],
    });

    const requestPayload = JSON.parse(
      String(fetchProviderResponseMock.mock.calls[0]?.[1]?.body)
    ) as {
      input: {
        messages: Array<{
          content: Array<Record<string, string>>;
        }>;
      };
    };
    expect(requestPayload.input.messages[0]?.content).toEqual([
      { image: "data:image/png;base64,AAA" },
      { image: "data:image/png;base64,BBB" },
      { text: "Rainy alley" },
    ]);
  });
});
