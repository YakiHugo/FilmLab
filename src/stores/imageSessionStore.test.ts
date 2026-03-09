import { describe, expect, it } from "vitest";
import type { PersistedImageSession } from "../../shared/chatImageTypes";
import {
  INTERRUPTED_GENERATION_ERROR,
  MAX_PERSISTED_IMAGE_JOBS,
  MAX_PERSISTED_IMAGE_TURNS,
  normalizeRecoveredSession,
  trimSession,
} from "./imageSessionStore";

const createSession = (jobCount = 0, turnCount = 2): PersistedImageSession => ({
  id: "session-1",
  createdAt: "2026-03-09T00:00:00.000Z",
  updatedAt: "2026-03-09T00:00:00.000Z",
  turns: Array.from({ length: Math.max(turnCount, 2) }, (_, index) => ({
    id: index === 0 ? "turn-loading" : index === 1 ? "turn-done" : `turn-${index}`,
    prompt: index === 0 ? "loading" : `turn-${index}`,
    createdAt: `2026-03-09T00:${String(index + 1).padStart(2, "0")}:00.000Z`,
    configSnapshot: {},
    status: index === 0 ? ("loading" as const) : ("done" as const),
    error: null,
    warnings: [],
    jobId: index === 0 ? "job-loading" : index === 1 ? "job-done" : `job-${index}`,
    results: [],
  })),
  jobs: Array.from({ length: Math.max(jobCount, 2) }, (_, index) => ({
    id: index === 0 ? "job-loading" : `job-${index}`,
    turnId: index === 0 ? "turn-loading" : `turn-${index}`,
    provider: "seedream" as const,
    model: "seedream-5.0",
    compiledPrompt: `prompt-${index}`,
    requestSnapshot: {
      prompt: `prompt-${index}`,
      provider: "seedream",
      model: "seedream-5.0",
      aspectRatio: "1:1",
      style: "none",
      batchSize: 1,
    },
    status: index === 0 ? ("running" as const) : ("succeeded" as const),
    error: null,
    createdAt: `2026-03-09T00:${String(index).padStart(2, "0")}:00.000Z`,
    completedAt: index === 0 ? null : `2026-03-09T00:${String(index).padStart(2, "0")}:30.000Z`,
  })),
});

describe("image session store helpers", () => {
  it("marks recovered loading turns and running jobs as interrupted", () => {
    const recovered = normalizeRecoveredSession(createSession());

    expect(recovered.didChange).toBe(true);
    expect(recovered.session.turns[0]).toMatchObject({
      status: "error",
      error: INTERRUPTED_GENERATION_ERROR,
    });
    expect(recovered.session.jobs[0]).toMatchObject({
      status: "failed",
      error: INTERRUPTED_GENERATION_ERROR,
    });
    expect(recovered.session.jobs[0]?.completedAt).toBeTruthy();
  });

  it("caps persisted jobs to the configured maximum", () => {
    const trimmed = trimSession(
      createSession(MAX_PERSISTED_IMAGE_JOBS + 25, MAX_PERSISTED_IMAGE_JOBS + 25)
    );

    expect(trimmed.jobs).toHaveLength(MAX_PERSISTED_IMAGE_JOBS);
    expect(trimmed.jobs[0]?.id).toBe("job-loading");
    expect(trimmed.jobs.at(-1)?.id).toBe(`job-${MAX_PERSISTED_IMAGE_JOBS}`);
  });

  it("caps persisted turns and clears dangling job ids", () => {
    const trimmed = trimSession(createSession(MAX_PERSISTED_IMAGE_JOBS + 25, MAX_PERSISTED_IMAGE_TURNS + 30));

    expect(trimmed.turns).toHaveLength(MAX_PERSISTED_IMAGE_TURNS);
    expect(trimmed.turns.at(-1)?.id).toBe(`turn-${MAX_PERSISTED_IMAGE_TURNS - 1}`);
    expect(trimmed.turns.some((turn) => turn.jobId === "job-done")).toBe(false);
  });
});
