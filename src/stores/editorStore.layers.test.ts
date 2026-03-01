import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "./editorStore";

describe("editorStore layer state", () => {
  beforeEach(() => {
    useEditorStore.setState({
      layerOrder: [],
      layerVisibilityByAssetId: {},
      layerOpacityByAssetId: {},
      layerBlendModeByAssetId: {},
    });
  });

  it("initializes missing layer defaults during sync", () => {
    const store = useEditorStore.getState();
    store.syncLayerState(["asset-a", "asset-b"]);

    const next = useEditorStore.getState();
    expect(next.layerOrder).toEqual(["asset-a", "asset-b"]);
    expect(next.layerVisibilityByAssetId["asset-a"]).toBe(true);
    expect(next.layerOpacityByAssetId["asset-b"]).toBe(100);
    expect(next.layerBlendModeByAssetId["asset-a"]).toBe("normal");
  });

  it("preserves known order and appends newly added assets", () => {
    const store = useEditorStore.getState();
    store.syncLayerState(["a", "b", "c"]);
    store.setLayerOrder(["c", "a", "b"]);
    store.syncLayerState(["a", "b", "c", "d"]);

    const next = useEditorStore.getState();
    expect(next.layerOrder).toEqual(["c", "a", "b", "d"]);
  });

  it("moves layers up and down", () => {
    const store = useEditorStore.getState();
    store.syncLayerState(["a", "b", "c"]);
    store.moveLayer("b", "up");
    expect(useEditorStore.getState().layerOrder).toEqual(["b", "a", "c"]);
    store.moveLayer("b", "down");
    expect(useEditorStore.getState().layerOrder).toEqual(["a", "b", "c"]);
  });

  it("updates visibility, opacity, and blend mode", () => {
    const store = useEditorStore.getState();
    store.syncLayerState(["a"]);
    store.setLayerVisibility("a", false);
    store.setLayerOpacity("a", 37.4);
    store.setLayerBlendMode("a", "overlay");

    const next = useEditorStore.getState();
    expect(next.layerVisibilityByAssetId["a"]).toBe(false);
    expect(next.layerOpacityByAssetId["a"]).toBe(37);
    expect(next.layerBlendModeByAssetId["a"]).toBe("overlay");
  });
});

