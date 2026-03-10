import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ImageChatFeed } from "./ImageChatFeed";
import type { ImageGenerationTurn } from "./hooks/useImageGeneration";

const getImageModelFeatureSupportMock = vi.fn();

vi.mock("@/lib/ai/imageProviders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/imageProviders")>(
    "@/lib/ai/imageProviders"
  );

  return {
    ...actual,
    getImageModelFeatureSupport: (...args: [string, string]) =>
      getImageModelFeatureSupportMock(...args),
  };
});

const buildTurn = (): ImageGenerationTurn => ({
  id: "turn-1",
  prompt: "A portrait",
  createdAt: new Date().toISOString(),
  configSnapshot: {
    provider: "qwen",
    model: "qwen-image-2.0-pro",
    aspectRatio: "1:1",
    width: null,
    height: null,
    style: "none",
    stylePreset: "",
    negativePrompt: "",
    referenceImages: [],
    seed: null,
    guidanceScale: null,
    steps: null,
    sampler: "",
    batchSize: 1,
    modelParams: {},
  },
  displayProviderId: "qwen",
  displayModelId: "qwen-image-2.0-pro",
  displayAspectRatio: "1:1",
  displayStyleId: "none",
  displayStylePresetId: "",
  displayReferenceImageCount: 0,
  status: "done",
  error: null,
  warnings: [],
  isSavingSelection: false,
  results: [
    {
      imageUrl: "https://example.com/image.png",
      imageId: "image-1",
      provider: "qwen",
      model: "qwen-image-2.0-pro",
      index: 0,
      assetId: null,
      selected: false,
      saved: false,
    },
  ],
});

const noop = () => {};

const renderFeed = () =>
  renderToStaticMarkup(
    <ImageChatFeed
      turns={[buildTurn()]}
      currentModelName="Qwen"
      onClearHistory={noop}
      onToggleResultSelection={noop}
      onSaveSelectedResults={noop}
      onAddToCanvas={noop}
      onDeleteTurn={noop}
      onRetryTurn={noop}
      onReuseParameters={noop}
      onDownloadAll={noop}
      onDownloadResult={noop}
      onUpscaleResult={noop}
    />
  );

describe("ImageChatFeed", () => {
  it("enables upscale action when model supports upscale", () => {
    getImageModelFeatureSupportMock.mockReturnValue({ supportsUpscale: true });

    const html = renderFeed();

    expect(html).toContain('title="Upscale image"');
    expect(html).not.toContain('title="Upscale is not available for this result"');
  });

  it("keeps upscale action disabled when model does not support upscale", () => {
    getImageModelFeatureSupportMock.mockReturnValue({ supportsUpscale: false });

    const html = renderFeed();

    expect(html).toContain('title="Upscale is not available for this result"');
  });
});
