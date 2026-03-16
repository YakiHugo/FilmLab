import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const closeMock = vi.fn();

vi.mock("./chat/persistence/repository", () => ({
  createChatStateRepository: () => ({
    close: closeMock,
    getConversationById: vi.fn(),
    getOrCreateActiveConversation: vi.fn(),
    getConversationSnapshot: vi.fn(),
    getPromptArtifactsForTurn: vi.fn(),
    clearActiveConversation: vi.fn(),
    deleteTurn: vi.fn(),
    getGeneratedImageByCapability: vi.fn(),
    createTurn: vi.fn(),
    createGeneration: vi.fn(),
    createRun: vi.fn(),
    createPromptVersions: vi.fn(),
    updateConversationPromptState: vi.fn(),
    acceptConversationTurn: vi.fn(),
    completeGenerationSuccess: vi.fn(),
    completeGenerationFailure: vi.fn(),
    turnExists: vi.fn(),
  }),
}));

describe("buildServer", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    closeMock.mockReset();
    const { resetConfigForTests } = await import("./config");
    resetConfigForTests();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    const { resetConfigForTests } = await import("./config");
    resetConfigForTests();
  });

  it("closes the repository through Fastify lifecycle hooks", async () => {
    const { buildServer } = await import("./index");

    const app = await buildServer();
    await app.close();

    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
