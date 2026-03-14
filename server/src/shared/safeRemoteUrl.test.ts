import { beforeEach, describe, expect, it, vi } from "vitest";

const { lookupMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: lookupMock,
  },
}));

import { assertSafeRemoteUrl } from "./safeRemoteUrl";

describe("assertSafeRemoteUrl", () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it("rejects hosts that resolve to private network addresses", async () => {
    lookupMock.mockResolvedValue([
      {
        address: "127.0.0.1",
        family: 4,
      },
    ]);

    await expect(
      assertSafeRemoteUrl("https://internal.example/image.png", "Reference image")
    ).rejects.toMatchObject({
      message: "Reference image URL points to a private or reserved network address.",
      statusCode: 400,
    });
  });

  it("allows public image urls", async () => {
    lookupMock.mockResolvedValue([
      {
        address: "93.184.216.34",
        family: 4,
      },
    ]);

    const result = await assertSafeRemoteUrl(
      "https://example.com/assets/image.png",
      "Reference image"
    );

    expect(result.hostname).toBe("example.com");
    expect(result.protocol).toBe("https:");
  });
});
