import { describe, expect, it } from "vitest";
import { projectConversationView } from "./projectConversationView";
import type { PersistedImageSession } from "../persistence/models";

const createSession = (configSnapshot: Record<string, unknown>): PersistedImageSession => ({
  id: "session-1",
  thread: {
    id: "conversation-1",
    creativeBrief: {
      latestPrompt: "Edit the poster",
      latestModelId: "qwen-image-2-pro",
      acceptedAssetId: null,
      selectedAssetIds: [],
      recentAssetRefIds: [],
    },
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
    createdAt: "2026-03-27T00:00:00.000Z",
    updatedAt: "2026-03-27T00:00:00.000Z",
  },
  turns: [
    {
      id: "turn-1",
      prompt: "Edit the poster",
      createdAt: "2026-03-27T00:00:00.000Z",
      retryOfTurnId: null,
      modelId: "qwen-image-2-pro",
      logicalModel: "image.qwen.v2.pro",
      deploymentId: "dashscope-qwen-image-2-pro-primary",
      runtimeProvider: "dashscope",
      providerModel: "qwen-image-2.0-pro",
      configSnapshot,
      status: "done",
      error: null,
      warnings: [],
      jobId: "job-1",
      runIds: ["run-1"],
      referencedAssetIds: [],
      primaryAssetIds: [],
      results: [],
    },
  ],
  runs: [],
  assets: [],
  assetEdges: [],
  jobs: [],
  createdAt: "2026-03-27T00:00:00.000Z",
  updatedAt: "2026-03-27T00:00:00.000Z",
});

describe("projectConversationView", () => {
  it("projects canonical operation and input assets from persisted snapshots", () => {
    const view = projectConversationView(
      createSession({
        modelId: "qwen-image-2-pro",
        aspectRatio: "1:1",
        style: "none",
        negativePrompt: "",
        promptIntent: {
          preserve: [],
          avoid: [],
          styleDirectives: [],
          continuityTargets: [],
          editOps: [],
        },
        batchSize: 1,
        modelParams: {},
        operation: "edit",
        inputAssets: [{ assetId: "asset-source-1", binding: "source" }],
      })
    );

    expect(view.turns[0]?.request.operation).toBe("edit");
    expect(view.turns[0]?.request.inputAssets).toEqual([
      { assetId: "asset-source-1", binding: "source" },
    ]);
  });

  it("drops legacy-only input fields instead of restoring them", () => {
    const view = projectConversationView(
      createSession({
        modelId: "qwen-image-2-pro",
        aspectRatio: "1:1",
        style: "none",
        negativePrompt: "",
        promptIntent: {
          preserve: [],
          avoid: [],
          styleDirectives: [],
          continuityTargets: [],
          editOps: [],
        },
        batchSize: 1,
        modelParams: {},
        referenceImages: [{ url: "https://assets.example.com/ref.png", type: "content" }],
        assetRefs: [{ assetId: "asset-source-1", role: "edit" }],
      })
    );

    expect(view.turns[0]?.warnings).toEqual([]);
    expect(view.turns[0]?.request.operation).toBe("generate");
    expect(view.turns[0]?.request.inputAssets).toEqual([]);
  });
});
