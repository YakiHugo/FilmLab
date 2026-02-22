import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_EDITOR_TOOL_PANEL_ID } from "@/pages/editor/editorPanelConfig";
import { useEditorStore } from "./editorStore";

describe("editorStore ui state", () => {
  beforeEach(() => {
    useEditorStore.setState({
      activeToolPanelId: DEFAULT_EDITOR_TOOL_PANEL_ID,
      mobilePanelExpanded: true,
    });
  });

  it("uses default tool panel id", () => {
    const state = useEditorStore.getState();
    expect(state.activeToolPanelId).toBe(DEFAULT_EDITOR_TOOL_PANEL_ID);
  });

  it("updates active tool panel id", () => {
    const store = useEditorStore.getState();
    store.setActiveToolPanelId("crop");
    expect(useEditorStore.getState().activeToolPanelId).toBe("crop");
  });

  it("updates mobile panel expanded state", () => {
    const store = useEditorStore.getState();
    store.setMobilePanelExpanded(false);
    expect(useEditorStore.getState().mobilePanelExpanded).toBe(false);
    store.setMobilePanelExpanded(true);
    expect(useEditorStore.getState().mobilePanelExpanded).toBe(true);
  });
});
