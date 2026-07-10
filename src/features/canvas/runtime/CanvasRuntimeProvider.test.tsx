import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "@/types";

const mocks = vi.hoisted(() => ({
  assetGetState: vi.fn(),
  canvasGetState: vi.fn(() => ({ zoom: 1 })),
  canvasSubscribe: vi.fn(() => () => {}),
  createScope: vi.fn(),
  on: vi.fn(() => () => {}),
}));

vi.mock("@/stores/assetStore", () => ({
  useAssetStore: {
    getState: mocks.assetGetState,
  },
}));

vi.mock("@/stores/canvasStore", () => ({
  useCanvasStore: {
    getState: mocks.canvasGetState,
    subscribe: mocks.canvasSubscribe,
  },
}));

vi.mock("@/lib/storeEvents", () => ({ on: mocks.on }));

vi.mock("./canvasRuntimeScope", () => ({
  createCanvasRuntimeScope: mocks.createScope,
}));

import { CanvasRuntimeProvider } from "./CanvasRuntimeProvider";

const asset = {
  id: "asset-1",
  name: "source.jpg",
  type: "image/jpeg",
  size: 128,
  createdAt: "2026-07-10T00:00:00.000Z",
  objectUrl: "blob:source",
  thumbnailUrl: "blob:thumbnail",
  importDay: "2026-07-10",
  tags: [],
} as Asset;

describe("CanvasRuntimeProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reconciles assets hydrated between render and effect subscription", async () => {
    const syncRuntimeAssets = vi.fn();
    const refreshPreviewsForChangedAssets = vi.fn();
    const scope = {
      dispose: vi.fn(),
      getInput: vi.fn(() => ({
        assetById: new Map(),
        viewportScale: 1,
        workbench: null,
        workbenchId: null,
      })),
      refreshPreviewsForChangedAssets,
      reset: vi.fn(),
      syncRuntimeAssets,
      updateInput: vi.fn(),
    };
    mocks.createScope.mockReturnValue(scope);
    mocks.assetGetState
      .mockReturnValueOnce({ assets: [] })
      .mockReturnValueOnce({ assets: [] })
      .mockReturnValue({ assets: [asset] });

    let renderer: ReactTestRenderer | null = null;
    await act(async () => {
      renderer = create(
        <CanvasRuntimeProvider workbench={null} workbenchId={null}>
          <span />
        </CanvasRuntimeProvider>
      );
    });

    const changeSet = syncRuntimeAssets.mock.calls[0]?.[0];
    expect(changeSet.changedAssetIds).toEqual(new Set([asset.id]));
    expect(changeSet.nextAssetById.get(asset.id)).toBe(asset);
    expect(refreshPreviewsForChangedAssets).toHaveBeenCalledWith(new Set([asset.id]));

    await act(async () => {
      renderer?.unmount();
    });
  });
});
