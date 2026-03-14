import { beforeEach, describe, expect, it, vi } from "vitest";

const poolConstructorMock = vi.fn();

vi.mock("pg", () => ({
  Pool: class MockPool {
    query = vi.fn();
    connect = vi.fn();
    end = vi.fn();

    constructor(options: unknown) {
      poolConstructorMock(options);
    }
  },
}));

describe("createChatStateRepository", () => {
  beforeEach(() => {
    poolConstructorMock.mockReset();
  });

  it("uses the memory repository when DATABASE_URL is absent", async () => {
    const { createChatStateRepository } = await import("./repository");
    const { MemoryChatStateRepository } = await import("./memory");

    const repository = createChatStateRepository(undefined);

    expect(repository).toBeInstanceOf(MemoryChatStateRepository);
    expect(poolConstructorMock).not.toHaveBeenCalled();
  });

  it("uses the Postgres repository when DATABASE_URL is provided", async () => {
    const { createChatStateRepository } = await import("./repository");
    const { PostgresChatStateRepository } = await import("./postgres");

    const repository = createChatStateRepository("postgres://example:test@localhost:5432/filmlab");

    expect(repository).toBeInstanceOf(PostgresChatStateRepository);
    expect(poolConstructorMock).toHaveBeenCalledWith({
      connectionString: "postgres://example:test@localhost:5432/filmlab",
    });
  });
});
