import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "./editorStore";

describe("editorStore layer selection", () => {
  beforeEach(() => {
    useEditorStore.setState({ selectedLayerId: null });
  });

  it("sets selected layer id", () => {
    const store = useEditorStore.getState();
    store.setSelectedLayerId("layer-1");

    expect(useEditorStore.getState().selectedLayerId).toBe("layer-1");
  });

  it("clears selected layer id", () => {
    const store = useEditorStore.getState();
    store.setSelectedLayerId("layer-1");
    store.setSelectedLayerId(null);

    expect(useEditorStore.getState().selectedLayerId).toBeNull();
  });
});
