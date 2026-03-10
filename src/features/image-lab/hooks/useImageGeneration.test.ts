import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeneratedImage } from "@/types/imageGeneration";

const { importAssetFilesMock, setSelectedAssetIdsMock, assetState } = vi.hoisted(() => {
  const importAssetFilesMock = vi.fn();
  const setSelectedAssetIdsMock = vi.fn();

  return {
    importAssetFilesMock,
    setSelectedAssetIdsMock,
    assetState: {
      assets: [],
      setSelectedAssetIds: setSelectedAssetIdsMock,
    },
  };
});

vi.mock("@/lib/assetImport", () => ({
  importAssetFiles: importAssetFilesMock,
}));

vi.mock("@/stores/assetStore", () => ({
  useAssetStore: {
    getState: () => assetState,
  },
}));

import {
  resolveCanvasImageSize,
  resolveRetryRequestSnapshot,
  RETRY_REFERENCE_IMAGES_OMITTED_WARNING,
  saveGeneratedImages,
  toPersistedRequestSnapshot,
} from "./useImageGeneration";

describe("image generation helpers", () => {
  beforeEach(() => {
    importAssetFilesMock.mockReset();
    setSelectedAssetIdsMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sizes canvas inserts proportionally from asset metadata", () => {
    expect(
      resolveCanvasImageSize({
        metadata: { width: 3000, height: 1500 },
      } as never)
    ).toEqual({
      width: 420,
      height: 210,
    });

    expect(
      resolveCanvasImageSize({
        metadata: { width: 1200, height: 2400 },
      } as never)
    ).toEqual({
      width: 210,
      height: 420,
    });

    expect(resolveCanvasImageSize()).toEqual({
      width: 420,
      height: 420,
    });
  });

  it("downloads selected images, imports them, and maps resulting asset ids", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "image/png",
        },
      })
    );

    importAssetFilesMock.mockResolvedValue({
      requested: 1,
      accepted: 1,
      added: 1,
      failed: 0,
      addedAssetIds: ["asset-2"],
      errors: [],
      skipped: {
        unsupported: 0,
        oversized: 0,
        duplicated: 0,
        overflow: 0,
      },
      resolvedAssetIds: ["asset-2"],
    });

    const images: GeneratedImage[] = [
      {
        imageUrl: "/api/generated-images/1",
        provider: "qwen",
        model: "qwen-image-2.0-pro",
      },
      {
        imageUrl: "/api/generated-images/2",
        provider: "qwen",
        model: "qwen-image-2.0-pro",
        mimeType: "image/png",
      },
    ];

    const result = await saveGeneratedImages(images, [1]);

    expect(fetchMock).toHaveBeenCalledWith("/api/generated-images/2");
    expect(importAssetFilesMock).toHaveBeenCalledTimes(1);
    expect(importAssetFilesMock.mock.calls[0]?.[0]).toHaveLength(1);
    expect(importAssetFilesMock.mock.calls[0]?.[0]?.[0]).toBeInstanceOf(File);
    expect(importAssetFilesMock.mock.calls[0]?.[1]).toEqual({
      source: "ai-generated",
      origin: "ai",
    });
    expect(result.indexToAssetId).toEqual({ 1: "asset-2" });
    expect(result.importedAssetIds).toEqual(["asset-2"]);
    expect(setSelectedAssetIdsMock).not.toHaveBeenCalled();
  });

  it("strips reference image data from persisted request snapshots", () => {
    const snapshot = toPersistedRequestSnapshot({
      prompt: "portrait",
      provider: "seedream",
      model: "doubao-seedream-5-0-260128",
      aspectRatio: "1:1",
      style: "none",
      batchSize: 1,
      referenceImages: [
        {
          id: "ref-1",
          url: "data:image/png;base64,abc123",
          fileName: "ref.png",
          type: "content",
          weight: 0.8,
        },
      ],
    });

    expect(snapshot.referenceImages).toEqual([
      {
        id: "ref-1",
        fileName: "ref.png",
        type: "content",
        weight: 0.8,
      },
    ]);
  });

  it("drops missing retry reference images and emits a warning", () => {
    const retry = resolveRetryRequestSnapshot({
      prompt: "portrait",
      provider: "seedream",
      model: "doubao-seedream-5-0-260128",
      aspectRatio: "1:1",
      style: "none",
      batchSize: 1,
      referenceImages: [
        {
          id: "ref-1",
          fileName: "ref.png",
          type: "content",
          weight: 1,
        },
      ],
    });

    expect(retry.request.referenceImages).toEqual([]);
    expect(retry.warnings).toEqual([RETRY_REFERENCE_IMAGES_OMITTED_WARNING]);
  });
});
