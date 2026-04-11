// Helpers for deciding whether the user is currently interacting with a DOM
// editable surface (textarea, input, contenteditable). Canvas-side shortcut
// handlers and pointer dispatchers need to bail out when this is true, so the
// user's typing/selection inside overlays isn't overridden by canvas actions.
//
// We check both the event.target (where the event was dispatched) and
// document.activeElement (the authoritative current focus). The two normally
// agree, but they can diverge when focus shifts asynchronously, when a
// keyboard event is captured at window level after focus has moved, or when
// the handler is running during a React state transition.

const EDITABLE_TAG_NAMES = new Set(["input", "textarea", "select"]);

const isEditableHtmlElement = (element: unknown): boolean => {
  // Avoid referencing `Element` directly because some test environments ship a
  // partial DOM shim that defines HTMLElement without Element, and
  // `null instanceof Element` would throw at resolve time. HTMLElement is the
  // right check anyway — every editable surface we care about (input, textarea,
  // select, contenteditable) is an HTMLElement.
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  if (EDITABLE_TAG_NAMES.has(element.tagName.toLowerCase())) {
    return true;
  }
  return element.isContentEditable;
};

export const isEditableEventTarget = (target: EventTarget | null): boolean =>
  isEditableHtmlElement(target);

export const isEditableActiveElement = (): boolean => {
  if (typeof document === "undefined") {
    return false;
  }
  return isEditableHtmlElement(document.activeElement);
};

export const isCanvasTypingInProgress = (target: EventTarget | null): boolean =>
  isEditableEventTarget(target) || isEditableActiveElement();
