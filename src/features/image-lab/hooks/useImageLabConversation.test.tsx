import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImageLabConversationView } from "../../../../shared/imageLabViews";
import { useImageLabConversation } from "./useImageLabConversation";

const fetchImageConversation = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/imageConversation", () => ({
  fetchImageConversation,
}));

const conversation: ImageLabConversationView = {
  conversationId: "conversation-1",
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
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
  turns: [],
};

let latestHook: ReturnType<typeof useImageLabConversation> | null = null;

function Harness() {
  latestHook = useImageLabConversation();
  return null;
}

afterEach(() => {
  latestHook = null;
  fetchImageConversation.mockReset();
});

describe("useImageLabConversation", () => {
  it("loads once on mount and stays idle after applying the conversation", async () => {
    fetchImageConversation.mockResolvedValue(conversation);
    let renderer: ReactTestRenderer | null = null;

    await act(async () => {
      renderer = create(<Harness />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchImageConversation).toHaveBeenCalledTimes(1);
    expect(latestHook?.conversation).toEqual(conversation);
    expect(latestHook?.isLoadingConversation).toBe(false);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("uses the active conversation id for an explicit refresh", async () => {
    fetchImageConversation.mockResolvedValue(conversation);
    let renderer: ReactTestRenderer | null = null;

    await act(async () => {
      renderer = create(<Harness />);
    });
    await act(async () => {
      await latestHook?.refreshConversation();
    });

    expect(fetchImageConversation).toHaveBeenCalledTimes(2);
    expect(fetchImageConversation).toHaveBeenLastCalledWith("conversation-1", {
      signal: expect.any(AbortSignal),
    });

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("does not let an older refresh overwrite an externally applied snapshot", async () => {
    let resolveRefresh!: (value: ImageLabConversationView) => void;
    fetchImageConversation.mockReturnValue(
      new Promise<ImageLabConversationView>((resolve) => {
        resolveRefresh = resolve;
      })
    );
    let renderer: ReactTestRenderer | null = null;

    await act(async () => {
      renderer = create(<Harness />);
      await Promise.resolve();
    });

    const newerConversation = {
      ...conversation,
      updatedAt: "2026-07-10T01:00:00.000Z",
    };
    await act(async () => {
      latestHook?.applyConversation(newerConversation);
    });
    await act(async () => {
      resolveRefresh(conversation);
      await Promise.resolve();
    });

    expect(latestHook?.conversation).toEqual(newerConversation);

    await act(async () => {
      renderer?.unmount();
    });
  });
});
