export interface CanvasShortcutEventLike {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface CanvasShortcutSpec {
  alt?: boolean;
  code?: string;
  displayKey: string;
  key?: string;
  primary?: boolean;
  shift?: boolean;
}

export type CanvasShortcutPlatform = "mac" | "other";

const normalizeKey = (value: string) => value.toLowerCase();

export const resolveCanvasShortcutPlatform = (
  platformValue: string | null | undefined
): CanvasShortcutPlatform =>
  platformValue && /(mac|iphone|ipad|ipod)/i.test(platformValue) ? "mac" : "other";

const resolveCurrentCanvasShortcutPlatform = () =>
  resolveCanvasShortcutPlatform(typeof navigator === "undefined" ? null : navigator.platform);

export const isCanvasShortcutMatch = (
  shortcut: CanvasShortcutSpec,
  event: CanvasShortcutEventLike,
  platform = resolveCurrentCanvasShortcutPlatform()
) => {
  const hasPrimaryModifier = platform === "mac" ? event.metaKey : event.ctrlKey;
  if (Boolean(shortcut.primary) !== hasPrimaryModifier) {
    return false;
  }

  if (Boolean(shortcut.shift) !== event.shiftKey) {
    return false;
  }

  if (Boolean(shortcut.alt) !== event.altKey) {
    return false;
  }

  if (shortcut.code) {
    return event.code === shortcut.code;
  }

  return normalizeKey(event.key) === normalizeKey(shortcut.key ?? shortcut.displayKey);
};

export const resolveCanvasShortcutTokens = (
  shortcut: CanvasShortcutSpec,
  platform: CanvasShortcutPlatform
) => {
  const tokens: string[] = [];

  if (shortcut.primary) {
    tokens.push(platform === "mac" ? "Cmd" : "Ctrl");
  }

  if (shortcut.alt) {
    tokens.push("Alt");
  }

  if (shortcut.shift) {
    tokens.push("Shift");
  }

  tokens.push(shortcut.displayKey);

  return tokens;
};
