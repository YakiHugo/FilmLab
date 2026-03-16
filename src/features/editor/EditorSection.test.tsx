import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditorSection } from "./EditorSection";

const extractButtonStartTags = (html: string) => html.match(/<button\b[^>]*>/g) ?? [];

describe("EditorSection", () => {
  it("allows visibility toggle and reset to use independent disabled states", () => {
    const toggleEnabledHtml = renderToStaticMarkup(
      <EditorSection
        title="Basic"
        isOpen
        onToggle={() => {}}
        hasChanges={false}
        canToggleVisibility
        canResetChanges={false}
        onToggleVisibility={() => {}}
        onResetChanges={() => {}}
      >
        <div>content</div>
      </EditorSection>
    );
    const toggleEnabledButtons = extractButtonStartTags(toggleEnabledHtml);

    expect(toggleEnabledButtons[1]).not.toContain("disabled");
    expect(toggleEnabledButtons[2]).toContain("disabled");

    const resetEnabledHtml = renderToStaticMarkup(
      <EditorSection
        title="Basic"
        isOpen
        onToggle={() => {}}
        hasChanges={false}
        canToggleVisibility={false}
        canResetChanges
        onToggleVisibility={() => {}}
        onResetChanges={() => {}}
      >
        <div>content</div>
      </EditorSection>
    );
    const resetEnabledButtons = extractButtonStartTags(resetEnabledHtml);

    expect(resetEnabledButtons[1]).toContain("disabled");
    expect(resetEnabledButtons[2]).not.toContain("disabled");
  });
});
