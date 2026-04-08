import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ImageLabObservabilityView } from "../../../shared/imageLabViews";
import {
  ImageChatFeed,
  PromptObservabilityPanel,
  TurnPromptArtifactsPanel,
} from "./ImageChatFeed";
import type { ImageGenerationTurn } from "./hooks/useImageGeneration";
import { shouldAutoLoadPromptObservability } from "./imageChatFeedUtils";

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
    operation: "generate",
    inputAssets: [],
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
      provider: "dashscope",
      model: "qwen-image-2.0-pro",
      index: 0,
      assetId: "thread-asset-1",
      selected: false,
      saved: true,
    },
  ],
  ...overrides,
});

const noop = () => {};

const renderFeed = (turns: ImageGenerationTurn[] = [buildTurn()]) =>
  renderToStaticMarkup(
    <ImageChatFeed
      turns={turns}
      currentModelName="Qwen Image 2.0 Pro"
      promptObservabilityStatus="idle"
      promptObservabilityError={null}
      promptObservability={null}
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
      onLoadPromptObservability={noop}
    />
  );

const renderPromptArtifactsPanel = (turn: ImageGenerationTurn) =>
  renderToStaticMarkup(<TurnPromptArtifactsPanel turn={turn} />);

const renderPromptObservabilityPanel = (
  status: "idle" | "loading" | "loaded" | "error",
  summary: ImageLabObservabilityView | null,
  error: string | null = null
) =>
  renderToStaticMarkup(
    <PromptObservabilityPanel status={status} summary={summary} error={error} />
  );

const buildObservabilitySummary = (
  overrides?: Partial<ImageLabObservabilityView>
): ImageLabObservabilityView => ({
  conversationId: "conversation-1",
  overview: {
    totalTurns: 3,
    turnsWithArtifacts: 2,
    degradedTurns: 2,
    fallbackTurns: 1,
  },
  semanticLosses: [
    {
      code: "STYLE_REFERENCE_ROLE_COLLAPSED",
      occurrenceCount: 3,
      turnCount: 2,
      latestCreatedAt: "2026-03-15T10:05:00.000Z",
    },
    {
      code: "EXACT_TEXT_CONTINUITY_AT_RISK",
      occurrenceCount: 1,
      turnCount: 1,
      latestCreatedAt: "2026-03-15T10:01:00.000Z",
    },
  ],
  targets: [
    {
      targetKey: "dashscope:qwen-image-2.0-pro",
      compileArtifactCount: 2,
      dispatchArtifactCount: 2,
      degradedDispatchCount: 1,
      latestCreatedAt: "2026-03-15T10:05:00.000Z",
    },
  ],
  turns: [
    {
      turnId: "turn-2",
      prompt: "Rework the style reference",
      createdAt: "2026-03-15T10:05:00.000Z",
      artifactCount: 2,
      semanticLossCodes: ["STYLE_REFERENCE_ROLE_COLLAPSED"],
      degraded: true,
      fallback: false,
      selectedTargetKey: "dashscope:qwen-image-2.0-pro",
      executedTargetKey: "dashscope:qwen-image-2.0-pro",
    },
    {
      turnId: "turn-3",
      prompt: "Keep the poster text exactly aligned",
      createdAt: "2026-03-15T10:06:00.000Z",
      artifactCount: 3,
      semanticLossCodes: ["EXACT_TEXT_CONTINUITY_AT_RISK"],
      degraded: true,
      fallback: true,
      selectedTargetKey: "dashscope:qwen-image-2.0-pro",
      executedTargetKey: "openai:gpt-image-1",
    },
  ],
  ...overrides,
});

describe("ImageChatFeed", () => {
  it("auto-loads prompt observability only for open panels with turns and idle state", () => {
    expect(shouldAutoLoadPromptObservability(true, 1, "idle")).toBe(true);
    expect(shouldAutoLoadPromptObservability(false, 1, "idle")).toBe(false);
    expect(shouldAutoLoadPromptObservability(true, 0, "idle")).toBe(false);
    expect(shouldAutoLoadPromptObservability(true, 1, "loading")).toBe(false);
    expect(shouldAutoLoadPromptObservability(true, 1, "loaded")).toBe(false);
    expect(shouldAutoLoadPromptObservability(true, 1, "error")).toBe(false);
  });

  it("renders selected model and run metadata from the turn", () => {
    const html = renderFeed();

    expect(html).toContain("Qwen Image 2.0 Pro");
    expect(html).toContain("Insights");
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

  it("disables the Artifacts action while a turn is still loading", () => {
    const html = renderFeed([
      buildTurn({
        status: "loading",
        results: [],
      }),
    ]);
    const buttonBlocks = html.match(/<button[\s\S]*?<\/button>/g) ?? [];
    const artifactsButton = buttonBlocks.find((block) => block.includes("Artifacts"));

    expect(artifactsButton).toBeDefined();
    expect(artifactsButton).toContain('disabled=""');
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
            traceId: "trace-run-1",
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
              inputAssets: [],
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

  it("renders the empty state for prompt observability summaries", () => {
    const html = renderPromptObservabilityPanel(
      "loaded",
      buildObservabilitySummary({
        overview: {
          totalTurns: 0,
          turnsWithArtifacts: 0,
          degradedTurns: 0,
          fallbackTurns: 0,
        },
        semanticLosses: [],
        turns: [],
      })
    );

    expect(html).toContain("No prompt observability data is available for this conversation yet.");
  });

  it("renders sorted semantic losses and recent degraded turns in the observability panel", () => {
    const html = renderPromptObservabilityPanel("loaded", buildObservabilitySummary());

    expect(html).toContain("Prompt Observability");
    expect(html).toContain("Total Turns");
    expect(html).toContain("Fallback Turns");
    expect(html).toContain("Rework the style reference");
    expect(html).toContain("Keep the poster text exactly aligned");
    expect(html).toContain("Selected dashscope:qwen-image-2.0-pro");
    expect(html).toContain("Executed openai:gpt-image-1");
    expect(html).toContain("STYLE_REFERENCE_ROLE_COLLAPSED");
    expect(html).toContain("EXACT_TEXT_CONTINUITY_AT_RISK");
    expect(html.indexOf("STYLE_REFERENCE_ROLE_COLLAPSED")).toBeLessThan(
      html.indexOf("EXACT_TEXT_CONTINUITY_AT_RISK")
    );
  });
});
