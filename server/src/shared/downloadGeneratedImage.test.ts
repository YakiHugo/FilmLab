import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lookupMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: lookupMock,
  },
}));

describe("downloadGeneratedImage", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.PROVIDER_REQUEST_TIMEOUT_MS = "1000";
    delete process.env.GENERATED_IMAGE_DOWNLOAD_MAX_MB;
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([
      {
        address: "93.184.216.34",
        family: 4,
      },
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads image bytes and returns the upstream mime type", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([7, 8, 9]), {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": "3",
        },
      })
    );

    const { downloadGeneratedImage } = await import("./downloadGeneratedImage");
    const result = await downloadGeneratedImage("https://example.com/image.png");

    expect(result.mimeType).toBe("image/png");
    expect(Array.from(result.buffer)).toEqual([7, 8, 9]);
  });

  it("rejects non-image responses", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      })
    );

    const { downloadGeneratedImage } = await import("./downloadGeneratedImage");

    await expect(downloadGeneratedImage("https://example.com/page")).rejects.toMatchObject({
      message: "Generated image response did not contain an image.",
      statusCode: 502,
    });
  });

  it("enforces the configured cache download size limit", async () => {
    process.env.GENERATED_IMAGE_DOWNLOAD_MAX_MB = "1";

    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response("", {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": String(1024 * 1024 + 1),
        },
      })
    );

    const { downloadGeneratedImage } = await import("./downloadGeneratedImage");

    await expect(downloadGeneratedImage("https://example.com/large.png")).rejects.toMatchObject({
      message: "Generated image is too large to cache.",
      statusCode: 413,
    });
  });

  it("rejects redirect targets that resolve to private network addresses", async () => {
    lookupMock.mockImplementation(async (hostname: string) =>
      hostname === "internal.example"
        ? [
            {
              address: "127.0.0.1",
              family: 4,
            },
          ]
        : [
            {
              address: "93.184.216.34",
              family: 4,
            },
          ]
    );

    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          location: "https://internal.example/image.png",
        },
      })
    );

    const { downloadGeneratedImage } = await import("./downloadGeneratedImage");

    await expect(downloadGeneratedImage("https://example.com/image.png")).rejects.toMatchObject({
      message: "Generated image URL points to a private or reserved network address.",
      statusCode: 502,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("allows fake-ip provider image hosts in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    lookupMock.mockResolvedValue([
      {
        address: "198.18.1.8",
        family: 4,
      },
    ]);

    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([7, 8, 9]), {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": "3",
        },
      })
    );

    const { downloadGeneratedImage } = await import("./downloadGeneratedImage");
    const result = await downloadGeneratedImage("https://cdn.example.com/image.png");

    expect(result.mimeType).toBe("image/png");
    expect(Array.from(result.buffer)).toEqual([7, 8, 9]);
  });
});
