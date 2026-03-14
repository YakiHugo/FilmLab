import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createAbortError = () => {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
};

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    process.env.PROVIDER_REQUEST_TIMEOUT_MS = "1000";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("converts internal timeouts into provider timeout errors", async () => {
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => {
            reject(createAbortError());
          },
          { once: true }
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchWithTimeout } = await import("./fetchWithTimeout");
    const requestPromise = fetchWithTimeout(
      "https://example.com/image.png",
      {
        method: "GET",
      },
      "Provider timed out."
    );
    const expectation = expect(requestPromise).rejects.toMatchObject({
      message: "Provider timed out.",
      statusCode: 504,
    });

    await vi.advanceTimersByTimeAsync(1000);

    await expectation;
  });

  it("preserves caller aborts instead of misclassifying them as timeouts", async () => {
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => {
            reject(createAbortError());
          },
          { once: true }
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const requestController = new AbortController();
    const { fetchWithTimeout } = await import("./fetchWithTimeout");
    const requestPromise = fetchWithTimeout(
      "https://example.com/image.png",
      {
        method: "GET",
      },
      "Provider timed out.",
      {
        signal: requestController.signal,
      }
    );
    const expectation = expect(requestPromise).rejects.toMatchObject({
      name: "AbortError",
      message: "The operation was aborted.",
    });

    requestController.abort();
    await Promise.resolve();

    await expectation;
  });
});
