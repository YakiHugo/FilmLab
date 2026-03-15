import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImageChatFeed, TurnPromptArtifactsPanel } from "./ImageChatFeed";
import type { ImageGenerationTurn } from "./hooks/useImageGeneration";

const buildTurn = (overrides?: Partial<ImageGenerationTurn>): ImageGenerationTurn => ({
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
    promptIntent: {
      preserve: [],
      avoid: [],
      styleDirectives: [],
      continuityTargets: [],
      editOps: [],
    },
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
  promptArtifactsStatus: "idle",
  promptArtifactsError: null,
  promptArtifacts: null,
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
  ...overrides,
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
      onEditFromResult={noop}
      onVaryResult={noop}
      onLoadPromptArtifacts={noop}
      onAcceptResult={noop}
      onDeleteTurn={noop}
      onRetryTurn={noop}
      onReuseParameters={noop}
      onDownloadAll={noop}
      onDownloadResult={noop}
      onUpscaleResult={noop}
    />
  );

const renderPromptArtifactsPanel = (turn: ImageGenerationTurn) =>
  renderToStaticMarkup(<TurnPromptArtifactsPanel turn={turn} />);

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

  it("renders loading and error states for prompt artifacts", () => {
    const loadingHtml = renderPromptArtifactsPanel(
      buildTurn({
        promptArtifactsStatus: "loading",
      })
    );
    const errorHtml = renderPromptArtifactsPanel(
      buildTurn({
        promptArtifactsStatus: "error",
        promptArtifactsError: "Prompt artifacts could not be loaded.",
      })
    );

    expect(loadingHtml).toContain("Loading prompt artifacts");
    expect(errorHtml).toContain("Prompt artifacts could not be loaded.");
  });

  it("renders dispatch-only artifacts without fabricating rewrite or compile groups", () => {
    const html = renderPromptArtifactsPanel(
      buildTurn({
        promptArtifactsStatus: "loaded",
        promptArtifacts: [
          {
            id: "artifact-dispatch-1",
            runId: "run-1",
            turnId: "turn-1",
            version: 3,
            stage: "dispatch",
            targetKey: "dashscope:qwen-image-2.0-pro",
            attempt: 1,
            compilerVersion: "prompt-compiler.v1.2",
            capabilityVersion: "prompt-capabilities.v1.2",
            originalPrompt: "A portrait",
            promptIntent: null,
            turnDelta: null,
            committedStateBefore: null,
            candidateStateAfter: {
              prompt: "A portrait",
              preserve: [],
              avoid: [],
              styleDirectives: [],
              continuityTargets: [],
              editOps: [],
              referenceAssetIds: [],
            },
            promptIR: {
              operation: "image.generate",
              goal: "A portrait",
              preserve: [],
              negativeConstraints: [],
              styleDirectives: [],
              continuityTargets: [],
              editOps: [],
              sourceAssets: [],
              referenceAssets: [],
              assetRefs: [],
              referenceImages: [],
              output: {
                aspectRatio: "1:1",
                width: 1024,
                height: 1024,
                batchSize: 1,
                style: "none",
                stylePreset: null,
              },
            },
            compiledPrompt: "compiled prompt",
            dispatchedPrompt: "dispatch prompt",
            providerEffectivePrompt: "provider prompt",
            semanticLosses: [
              {
                code: "EXACT_TEXT_CONTINUITY_AT_RISK",
                severity: "warn",
                fieldPath: "promptIR.continuityTargets",
                degradeMode: "softened",
                userMessage: "Exact text continuity is not guaranteed on the selected model.",
              },
            ],
            warnings: ["Exact retry reused prior compiler artifacts."],
            hashes: {
              stateHash: "state-1",
              irHash: "ir-1",
              prefixHash: "prefix-1",
              payloadHash: "payload-1",
            },
            createdAt: "2026-03-15T00:00:00.000Z",
          },
        ],
      })
    );

    expect(html).toContain("Dispatch");
    expect(html).not.toContain(">Rewrite<");
    expect(html).not.toContain(">Compile<");
    expect(html).toContain("Exact retry reused prior compiler artifacts.");
    expect(html).toContain("EXACT_TEXT_CONTINUITY_AT_RISK");
    expect(html).toContain("Provider Effective Prompt");
    expect(html).toContain("provider prompt");
  });
});
