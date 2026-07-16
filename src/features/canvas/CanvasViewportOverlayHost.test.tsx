import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { CanvasViewportOverlayHost } from "./CanvasViewportOverlayHost";

vi.mock("./hooks/useCanvasViewportOverlay", () => ({
  useCanvasViewportOverlay: () => ({
    dimensionsBadgePosition: { left: 0, top: 0 },
    editingTextLayout: null,
    selectionOverlay: null,
    toolbarPosition: { left: 0, top: 0 },
  }),
}));

const originalDocument = globalThis.document;
const originalNode = globalThis.Node;
const originalWindow = globalThis.window;
const keyDownListeners = new Set<(event: KeyboardEvent) => void>();
const pointerDownListeners = new Set<(event: PointerEvent) => void>();

class NodeStub {}

const windowStub = {
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
    if (type === "keydown" && typeof listener === "function") {
      keyDownListeners.add(listener as (event: KeyboardEvent) => void);
    }
  },
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
    if (type === "keydown" && typeof listener === "function") {
      keyDownListeners.delete(listener as (event: KeyboardEvent) => void);
    }
  },
};

const documentStub = {
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
    if (type === "pointerdown" && typeof listener === "function") {
      pointerDownListeners.add(listener as (event: PointerEvent) => void);
    }
  },
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
    if (type === "pointerdown" && typeof listener === "function") {
      pointerDownListeners.delete(listener as (event: PointerEvent) => void);
    }
  },
};

const createProps = (
  enabled: boolean,
  onCancelTextEdit: () => void,
  onCommitTextEdit: () => void
): ComponentProps<typeof CanvasViewportOverlayHost> => ({
  enabled,
  overlay: {
    interactionNotice: null,
    previewDimensionsStore: {
      getSnapshot: () => null,
      subscribe: () => () => {},
    },
    selectedElementCount: 0,
    singleSelectedNonTextElement: null,
    stageRef: { current: null },
    stageSize: { height: 0, width: 0 },
    viewport: { x: 0, y: 0 },
    zoom: 1,
  },
  textEditing: {
    onCancelTextEdit,
    onCommitTextEdit,
    onFontFamilyChange: vi.fn(),
    onFontSizeTierChange: vi.fn(),
    onTextColorChange: vi.fn(),
    onTextInputKeyDown: vi.fn(),
    onTextValueChange: vi.fn(),
    runtimeViewModel: {
      activeEditingTextId: "text-1",
      activeTextEditorModel: null,
      displaySelectedElements: [],
      renderedEditingTextDraft: null,
      showEditingTextSelectionOutline: false,
      showTextEditor: false,
      showTextToolbar: false,
      textOverlayModel: null,
      trackedOverlayId: null,
    },
    session: {
      id: "text-1",
      value: "Draft",
    },
  },
});

beforeAll(() => {
  Object.assign(globalThis, {
    document: documentStub,
    Node: NodeStub,
    window: windowStub,
  });
});

afterEach(() => {
  keyDownListeners.clear();
  pointerDownListeners.clear();
});

afterAll(() => {
  Object.assign(globalThis, {
    document: originalDocument,
    Node: originalNode,
    window: originalWindow,
  });
});

describe("CanvasViewportOverlayHost", () => {
  it("ignores global text-session events while route interaction is disabled", async () => {
    const onCancelTextEdit = vi.fn();
    const onCommitTextEdit = vi.fn();
    let renderer: ReactTestRenderer | null = null;

    await act(async () => {
      renderer = create(
        <CanvasViewportOverlayHost
          {...createProps(false, onCancelTextEdit, onCommitTextEdit)}
        />
      );
    });

    keyDownListeners.forEach((listener) => {
      listener({ key: "Escape" } as KeyboardEvent);
    });
    pointerDownListeners.forEach((listener) => {
      listener({ target: new NodeStub() } as unknown as PointerEvent);
    });

    expect(onCancelTextEdit).not.toHaveBeenCalled();
    expect(onCommitTextEdit).not.toHaveBeenCalled();

    await act(async () => {
      renderer?.update(
        <CanvasViewportOverlayHost
          {...createProps(true, onCancelTextEdit, onCommitTextEdit)}
        />
      );
    });

    keyDownListeners.forEach((listener) => {
      listener({ key: "Escape" } as KeyboardEvent);
    });
    pointerDownListeners.forEach((listener) => {
      listener({ target: new NodeStub() } as unknown as PointerEvent);
    });

    expect(onCancelTextEdit).toHaveBeenCalledTimes(1);
    expect(onCommitTextEdit).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer?.unmount();
    });
  });
});
