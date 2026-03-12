import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImageChatFeed } from "./ImageChatFeed";
import type { ImageGenerationTurn } from "./hooks/useImageGeneration";

const buildTurn = (): ImageGenerationTurn => ({
  id: "turn-1",
  prompt: "A portrait",
  createdAt: new Date("2026-03-10T12:00:00.000Z").toISOString(),
  configSnapshot: {
    modelId: "qwen-image-2-pro",
    aspectRatio: "1:1",
    width: null,
    height: null,
    style: "none",
    stylePreset: "",
    negativePrompt: "",
    referenceImages: [],
    assetRefs: [],
    seed: null,
    guidanceScale: null,
    steps: null,
    sampler: "",
    batchSize: 1,
    modelParams: {},
  },
  selectedModelId: "qwen-image-2-pro",
  selectedModelLabel: "Qwen Image 2.0 Pro",
  runtimeProvider: "dashscope",
  runtimeProviderLabel: "DashScope",
  providerModel: "qwen-image-2.0-pro",
  displayAspectRatio: "1:1",
  displayStyleId: "none",
  displayStylePresetId: "",
  displayReferenceImageCount: 0,
  referencedAssetIds: ["thread-asset-1"],
  primaryAssetIds: ["thread-asset-1"],
  executedTargetLabel: "dashscope / qwen-image-2.0-pro",
  runCount: 1,
  status: "done",
  error: null,
  warnings: [],
  isSavingSelection: false,
  results: [
    {
      imageUrl: "https://example.com/image.png",
      imageId: "image-1",
      threadAssetId: "thread-asset-1",
      provider: "dashscope",
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
      currentModelName="Qwen Image 2.0 Pro"
      onClearHistory={noop}
      onToggleResultSelection={noop}
      onSaveSelectedResults={noop}
      onAddToCanvas={noop}
      onUseResultAsReference={noop}
      onDeleteTurn={noop}
      onRetryTurn={noop}
      onReuseParameters={noop}
      onDownloadAll={noop}
      onDownloadResult={noop}
      onUpscaleResult={noop}
    />
  );

describe("ImageChatFeed", () => {
  it("renders selected model and run metadata from the turn", () => {
    const html = renderFeed();

    expect(html).toContain("Qwen Image 2.0 Pro");
    expect(html).toContain("Runtime DashScope");
    expect(html).toContain("qwen-image-2.0-pro");
    expect(html).toContain("Executed dashscope / qwen-image-2.0-pro");
    expect(html).toContain("Runs 1");
    expect(html).toContain("Refs 1");
  });

  it("keeps upscale action disabled for image results in the catalog-driven flow", () => {
    const html = renderFeed();

    expect(html).toContain('title="Upscale is not available for this result"');
    expect(html).not.toContain('title="Upscale image"');
  });
});
