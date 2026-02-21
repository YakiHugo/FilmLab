import { describe, expect, it } from "vitest";
import {
  EDITOR_PANEL_SECTION_MAP,
  EDITOR_TOOL_PANELS,
  type EditorToolPanelId,
} from "./editorPanelConfig";

describe("editor panel config", () => {
  it("defines unique tool panel ids", () => {
    const ids = EDITOR_TOOL_PANELS.map((panel) => panel.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("provides section mapping for every tool panel", () => {
    EDITOR_TOOL_PANELS.forEach((panel) => {
      const sections = EDITOR_PANEL_SECTION_MAP[panel.id];
      expect(Array.isArray(sections)).toBe(true);
      expect(sections.length).toBeGreaterThan(0);
    });
  });

  it("uses mask/remove panels as disabled placeholders", () => {
    const disabledPanels = EDITOR_TOOL_PANELS.filter((panel) => panel.disabled);
    expect(disabledPanels).toHaveLength(2);
    expect(disabledPanels.map((panel) => panel.id)).toEqual(["mask", "remove"]);
    expect(EDITOR_PANEL_SECTION_MAP.mask).toEqual(["mask"]);
    expect(EDITOR_PANEL_SECTION_MAP.remove).toEqual(["remove"]);
  });

  it("does not contain unknown mappings", () => {
    const knownIds = new Set<EditorToolPanelId>(EDITOR_TOOL_PANELS.map((panel) => panel.id));
    Object.keys(EDITOR_PANEL_SECTION_MAP).forEach((key) => {
      expect(knownIds.has(key as EditorToolPanelId)).toBe(true);
    });
  });
});
