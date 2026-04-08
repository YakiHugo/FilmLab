import { describe, expect, it } from "vitest";
import {
  isCanvasShortcutMatch,
  resolveCanvasShortcutPlatform,
  resolveCanvasShortcutTokens,
} from "./canvasShortcuts";

describe("canvasShortcuts", () => {
  it("matches primary shortcuts by key", () => {
    expect(
      isCanvasShortcutMatch(
        {
          displayKey: "d",
          key: "d",
          primary: true,
        },
        {
          altKey: false,
          code: "KeyD",
          ctrlKey: true,
          key: "d",
          metaKey: false,
          shiftKey: false,
        },
        "other"
      )
    ).toBe(true);
  });

  it("matches mac primary shortcuts with the meta key instead of ctrl", () => {
    expect(
      isCanvasShortcutMatch(
        {
          displayKey: "d",
          key: "d",
          primary: true,
        },
        {
          altKey: false,
          code: "KeyD",
          ctrlKey: false,
          key: "d",
          metaKey: true,
          shiftKey: false,
        },
        "mac"
      )
    ).toBe(true);

    expect(
      isCanvasShortcutMatch(
        {
          displayKey: "d",
          key: "d",
          primary: true,
        },
        {
          altKey: false,
          code: "KeyD",
          ctrlKey: true,
          key: "d",
          metaKey: false,
          shiftKey: false,
        },
        "mac"
      )
    ).toBe(false);
  });

  it("matches bracket shortcuts by physical key code", () => {
    expect(
      isCanvasShortcutMatch(
        {
          code: "BracketRight",
          displayKey: "]",
        },
        {
          altKey: false,
          code: "BracketRight",
          ctrlKey: false,
          key: "]",
          metaKey: false,
          shiftKey: false,
        },
        "other"
      )
    ).toBe(true);
  });

  it("renders platform-specific textual shortcut tokens", () => {
    expect(
      resolveCanvasShortcutTokens(
        {
          displayKey: "d",
          key: "d",
          primary: true,
        },
        resolveCanvasShortcutPlatform("MacIntel")
      )
    ).toEqual(["Cmd", "d"]);

    expect(
      resolveCanvasShortcutTokens(
        {
          displayKey: "l",
          key: "l",
          shift: true,
        },
        resolveCanvasShortcutPlatform("Win32")
      )
    ).toEqual(["Shift", "l"]);

    expect(
      resolveCanvasShortcutTokens(
        {
          code: "BracketLeft",
          displayKey: "[",
        },
        resolveCanvasShortcutPlatform("Win32")
      )
    ).toEqual(["["]);
  });
});
