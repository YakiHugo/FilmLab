import { describe, expect, it } from "vitest";
import type { PersistedImageSession } from "../../shared/chatImageTypes";
import {
  INTERRUPTED_GENERATION_ERROR,
  MAX_PERSISTED_IMAGE_JOBS,
  MAX_PERSISTED_IMAGE_TURNS,
  mergeProjectedSession,
  normalizeRecoveredSession,
  trimSession,
} from "./imageSessionStore";

const createSession = (jobCount = 0, turnCount = 2): PersistedImageSession => ({
  id: "session-1",
  thread: {
    id: "session-1",
    creativeBrief: {
      latestPrompt: null,
      latestModelId: null,
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
    createdAt: "2026-03-09T00:00:00.000Z",
    updatedAt: "2026-03-09T00:00:00.000Z",
  },
  createdAt: "2026-03-09T00:00:00.000Z",
  updatedAt: "2026-03-09T00:00:00.000Z",
  turns: Array.from({ length: Math.max(turnCount, 2) }, (_, index) => ({
    id: index === 0 ? "turn-loading" : index === 1 ? "turn-done" : `turn-${index}`,
    prompt: index === 0 ? "loading" : `turn-${index}`,
    createdAt: `2026-03-09T00:${String(index + 1).padStart(2, "0")}:00.000Z`,
    retryOfTurnId: null,
    modelId: "seedream-v5",
    logicalModel: "image.seedream.v5",
    deploymentId: "ark-seedream-v5-primary",
    runtimeProvider: "ark",
    providerModel: "doubao-seedream-5-0-260128",
    configSnapshot: {
      modelId: "seedream-v5",
      aspectRatio: "1:1",
    style: "none",
    promptIntent: {
      preserve: [],
      avoid: [],
      styleDirectives: [],
      continuityTargets: [],
      editOps: [],
    },
    batchSize: 1,
  },
    status: index === 0 ? ("loading" as const) : ("done" as const),
    error: null,
    warnings: [],
    jobId: index === 0 ? "job-loading" : index === 1 ? "job-done" : `job-${index}`,
    runIds: [],
    referencedAssetIds: [],
    primaryAssetIds: [],
    results: [],
  })),
  runs: [
    {
      id: "run-loading",
      turnId: "turn-loading",
      jobId: "job-loading",
      operation: "image.generate",
      status: "processing",
      requestedTarget: null,
      selectedTarget: null,
      executedTarget: null,
      prompt: null,
      error: null,
      warnings: [],
      assetIds: [],
      referencedAssetIds: [],
      createdAt: "2026-03-09T00:00:00.000Z",
      completedAt: null,
      telemetry: {
        traceId: "trace-run-loading",
        providerRequestId: null,
        providerTaskId: null,
        latencyMs: null,
      },
    },
  ],
  assets: [],
  assetEdges: [],
  jobs: Array.from({ length: Math.max(jobCount, 2) }, (_, index) => ({
    id: index === 0 ? "job-loading" : `job-${index}`,
    turnId: index === 0 ? "turn-loading" : `turn-${index}`,
    runId: null,
    modelId: "seedream-v5",
    logicalModel: "image.seedream.v5",
    deploymentId: "ark-seedream-v5-primary",
    runtimeProvider: "ark",
    providerModel: "doubao-seedream-5-0-260128",
    compiledPrompt: `prompt-${index}`,
      requestSnapshot: {
        prompt: `prompt-${index}`,
        modelId: "seedream-v5",
        aspectRatio: "1:1",
        style: "none",
        promptIntent: {
          preserve: [],
          avoid: [],
          styleDirectives: [],
          continuityTargets: [],
          editOps: [],
        },
        batchSize: 1,
      },
    status: index === 0 ? ("running" as const) : ("succeeded" as const),
    error: null,
    createdAt: `2026-03-09T00:${String(index).padStart(2, "0")}:00.000Z`,
    completedAt: index === 0 ? null : `2026-03-09T00:${String(index).padStart(2, "0")}:30.000Z`,
  })),
});

describe("image session store helpers", () => {
  it("marks recovered loading turns and running jobs as interrupted while preserving runtime metadata", () => {
    const recovered = normalizeRecoveredSession(createSession());

    expect(recovered.didChange).toBe(true);
    expect(recovered.session.turns[0]).toMatchObject({
      status: "error",
      error: INTERRUPTED_GENERATION_ERROR,
      modelId: "seedream-v5",
      logicalModel: "image.seedream.v5",
      deploymentId: "ark-seedream-v5-primary",
      runtimeProvider: "ark",
      providerModel: "doubao-seedream-5-0-260128",
    });
    expect(recovered.session.jobs[0]).toMatchObject({
      status: "failed",
      error: INTERRUPTED_GENERATION_ERROR,
      modelId: "seedream-v5",
      logicalModel: "image.seedream.v5",
      deploymentId: "ark-seedream-v5-primary",
      runtimeProvider: "ark",
      providerModel: "doubao-seedream-5-0-260128",
    });
    expect(recovered.session.jobs[0]?.completedAt).toBeTruthy();
    expect(recovered.session.runs[0]).toMatchObject({
      status: "failed",
      error: INTERRUPTED_GENERATION_ERROR,
    });
    expect(recovered.session.runs[0]?.completedAt).toBeTruthy();
  });

  it("caps persisted jobs to the configured maximum", () => {
    const trimmed = trimSession(
      createSession(MAX_PERSISTED_IMAGE_JOBS + 25, MAX_PERSISTED_IMAGE_JOBS + 25)
    );

    expect(trimmed.jobs).toHaveLength(MAX_PERSISTED_IMAGE_JOBS);
    expect(trimmed.jobs[0]).toMatchObject({
      id: "job-loading",
      modelId: "seedream-v5",
      runtimeProvider: "ark",
      providerModel: "doubao-seedream-5-0-260128",
    });
    expect(trimmed.jobs.at(-1)?.id).toBe(`job-${MAX_PERSISTED_IMAGE_JOBS}`);
  });

  it("caps persisted turns and clears dangling job ids", () => {
    const trimmed = trimSession(
      createSession(MAX_PERSISTED_IMAGE_JOBS + 25, MAX_PERSISTED_IMAGE_TURNS + 30)
    );

    expect(trimmed.turns).toHaveLength(MAX_PERSISTED_IMAGE_TURNS);
    expect(trimmed.turns.at(-1)?.id).toBe(`turn-${MAX_PERSISTED_IMAGE_TURNS - 1}`);
    expect(trimmed.turns.some((turn) => turn.jobId === "job-done")).toBe(false);
    expect(trimmed.turns[0]).toMatchObject({
      modelId: "seedream-v5",
      deploymentId: "ark-seedream-v5-primary",
      runtimeProvider: "ark",
    });
  });

  it("preserves cross-turn referenced assets and edges when trimming older turns", () => {
    const session = createSession(MAX_PERSISTED_IMAGE_JOBS + 25, MAX_PERSISTED_IMAGE_TURNS + 1);
    const keptTurn = {
      ...session.turns[1]!,
      id: "turn-kept",
      jobId: "job-kept",
      runIds: ["run-kept"],
      referencedAssetIds: ["asset-legacy"],
      primaryAssetIds: ["asset-kept"],
      results: [
        {
          id: "result-kept",
          imageUrl: "/api/generated-images/result-kept",
          imageId: "image-kept",
          threadAssetId: "asset-kept",
          runtimeProvider: "ark",
          providerModel: "doubao-seedream-5-0-260128",
          index: 0,
          assetId: null,
          saved: false,
        },
      ],
    };
    const trimmedOutTurn = {
      ...session.turns[MAX_PERSISTED_IMAGE_TURNS]!,
      id: "turn-trimmed",
      jobId: "job-trimmed",
      runIds: ["run-trimmed"],
      referencedAssetIds: [],
      primaryAssetIds: ["asset-legacy"],
    };

    session.turns[1] = keptTurn;
    session.turns[MAX_PERSISTED_IMAGE_TURNS] = trimmedOutTurn;
    session.jobs = [
      session.jobs[0]!,
      {
        ...session.jobs[1]!,
        id: "job-kept",
        turnId: "turn-kept",
        runId: "run-kept",
      },
    ];
    session.runs = [
      session.runs[0]!,
      {
        ...session.runs[0]!,
        id: "run-kept",
        turnId: "turn-kept",
        jobId: "job-kept",
        status: "completed",
        assetIds: ["asset-kept"],
        referencedAssetIds: ["asset-legacy"],
        completedAt: "2026-03-09T00:03:00.000Z",
      },
      {
        ...session.runs[0]!,
        id: "run-trimmed",
        turnId: "turn-trimmed",
        jobId: "job-trimmed",
        status: "completed",
        assetIds: ["asset-legacy"],
        referencedAssetIds: [],
        completedAt: "2026-03-09T00:04:00.000Z",
      },
    ];
    session.assets = [
      {
        id: "asset-kept",
        turnId: "turn-kept",
        runId: "run-kept",
        assetType: "image",
        label: "Kept",
        metadata: {},
        locators: [],
        createdAt: "2026-03-09T00:03:00.000Z",
      },
      {
        id: "asset-legacy",
        turnId: "turn-trimmed",
        runId: "run-trimmed",
        assetType: "image",
        label: "Legacy",
        metadata: {},
        locators: [],
        createdAt: "2026-03-09T00:02:00.000Z",
      },
    ];
    session.assetEdges = [
      {
        id: "edge-1",
        sourceAssetId: "asset-legacy",
        targetAssetId: "asset-kept",
        edgeType: "referenced_in_turn",
        turnId: "turn-kept",
        runId: "run-kept",
        createdAt: "2026-03-09T00:03:00.000Z",
      },
    ];
    session.thread.creativeBrief = {
      latestPrompt: "kept",
      latestModelId: "seedream-v5",
      acceptedAssetId: "asset-kept",
      selectedAssetIds: ["asset-kept"],
      recentAssetRefIds: ["asset-legacy"],
    };

    const trimmed = trimSession(session);

    expect(trimmed.turns).toHaveLength(MAX_PERSISTED_IMAGE_TURNS);
    expect(trimmed.turns.some((turn) => turn.id === "turn-trimmed")).toBe(false);
    expect(trimmed.assets.map((asset) => asset.id)).toEqual(
      expect.arrayContaining(["asset-kept", "asset-legacy"])
    );
    expect(trimmed.assetEdges).toEqual([
      expect.objectContaining({
        sourceAssetId: "asset-legacy",
        targetAssetId: "asset-kept",
      }),
    ]);
    expect(trimmed.thread.creativeBrief.recentAssetRefIds).toEqual(["asset-legacy"]);
  });

  it("preserves locally projected saved assets when a server snapshot replaces the session", () => {
    const previous = createSession();
    previous.turns[1] = {
      ...previous.turns[1],
      id: "turn-done",
      results: [
        {
          id: "result-1",
          imageUrl: "/api/generated-images/result-1",
          imageId: "image-1",
          threadAssetId: "thread-asset-1",
          runtimeProvider: "ark",
          providerModel: "doubao-seedream-5-0-260128",
          index: 0,
          assetId: "asset-1",
          saved: true,
        },
      ],
    };

    const merged = mergeProjectedSession(previous, {
      ...createSession(),
      turns: [
        previous.turns[0],
        {
          ...previous.turns[1],
          results: [
            {
              id: "result-1",
              imageUrl: "/api/generated-images/result-1",
              imageId: "image-1",
              threadAssetId: "thread-asset-1",
              runtimeProvider: "ark",
              providerModel: "doubao-seedream-5-0-260128",
              index: 0,
              assetId: null,
              saved: false,
            },
          ],
        },
      ],
    });

    expect(merged.turns[1]?.results[0]).toMatchObject({
      id: "result-1",
      assetId: "asset-1",
      saved: true,
    });
  });
});
