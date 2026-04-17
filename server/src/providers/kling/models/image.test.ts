import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformProviderGenerateInput } from "../../base/types";

const {
  createProviderRequestContextMock,
  fetchProviderResponseMock,
  resolveKlingBearerTokenMock,
} = vi.hoisted(() => ({
  createProviderRequestContextMock: vi.fn(),
  fetchProviderResponseMock: vi.fn(),
  resolveKlingBearerTokenMock: vi.fn(),
}));

vi.mock("../../base/client", () => ({
  createProviderRequestContext: (...args: unknown[]) => createProviderRequestContextMock(...args),
  fetchProviderResponse: (...args: unknown[]) => fetchProviderResponseMock(...args),
}));

vi.mock("../auth", () => ({
  resolveKlingBearerToken: (...args: unknown[]) => resolveKlingBearerTokenMock(...args),
}));

const createResponse = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });

const createInput = (timeoutMs = 3000): PlatformProviderGenerateInput =>
  ({
    target: {
      frontendModel: {
        id: "kling-v3",
        label: "Kling V3",
        logicalModel: "image.kling.v3",
        modelFamily: "kling",
        capability: "image.generate",
        routingPolicy: "default",
        visible: true,
        constraints: {
          supportsCustomSize: false,
          supportedAspectRatios: ["1:1"],
          maxBatchSize: 4,
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
        supportsUpscale: false,
      },
      deployment: {
        id: "kling-kling-v3-primary",
        logicalModel: "image.kling.v3",
        provider: "kling",
        providerModel: "kling-v3",
        capability: "image.generate",
        enabled: true,
        priority: 1,
      },
      provider: {
        id: "kling",
        name: "Kling",
        credentialSlot: "kling",
        operations: ["image.generate"],
        healthScope: "model_operation",
        family: "http",
      },
    },
    request: {
      prompt: "Rainy alley",
      modelId: "kling-v3",
      aspectRatio: "1:1",
      style: "none",
      batchSize: 1,
      modelParams: {},
    },
    credentials: {
      accessKey: "access-key",
      secretKey: "secret-key",
      baseUrl: "https://api-beijing.klingai.com",
    },
    options: {
      timeoutMs,
    },
  }) as unknown as PlatformProviderGenerateInput;

describe("generateKlingImage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-14T00:00:00.000Z"));
    vi.resetModules();
    createProviderRequestContextMock.mockReset();
    fetchProviderResponseMock.mockReset();
    resolveKlingBearerTokenMock.mockReset();
    createProviderRequestContextMock.mockImplementation((options?: { timeoutMs?: number }) => ({
      signal: undefined,
      timeoutMs: options?.timeoutMs ?? 3000,
      traceId: "trace-1",
    }));
    resolveKlingBearerTokenMock.mockReturnValue("bearer-token");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("bounds follow-up poll requests by the remaining deadline", async () => {
    fetchProviderResponseMock
      .mockResolvedValueOnce(
        createResponse({
          code: 0,
          data: {
            task_id: "task-1",
          },
        })
      )
      .mockResolvedValueOnce(
        createResponse({
          code: 0,
          data: {
            task_status: "processing",
          },
        })
      )
      .mockResolvedValueOnce(
        createResponse({
          code: 0,
          data: {
            task_status: "succeed",
            task_result: {
              images: [{ url: "https://cdn.example.com/image.png" }],
            },
          },
        })
      );

    const { generateKlingImage } = await import("./image");
    const generationPromise = generateKlingImage(createInput(3000));

    await vi.advanceTimersByTimeAsync(2500);

    await expect(generationPromise).resolves.toMatchObject({
      providerTaskId: "task-1",
      images: [{ imageUrl: "https://cdn.example.com/image.png" }],
    });
    expect(fetchProviderResponseMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/v1/images/generations/task-1"),
      expect.any(Object),
      "Kling image generation timed out.",
      expect.objectContaining({
        timeoutMs: 500,
      })
    );
  });
});
