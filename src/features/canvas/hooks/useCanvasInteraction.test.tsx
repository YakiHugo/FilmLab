import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useCanvasStore } from "@/stores/canvasStore";
import type { CanvasRenderableNode, CanvasWorkbench } from "@/types";
import { useCanvasInteraction } from "./useCanvasInteraction";

const baseCanvasState = {
  activePanel: null,
  isLoading: false,
  loadedWorkbenchId: null,
  selectedElementIds: [] as string[],
  viewport: { x: 0, y: 0 },
  workbench: null,
  workbenchDraft: null,
  workbenchHistory: null,
  workbenchInteraction: null,
  workbenchList: [],
  zoom: 1,
};

const initialNudgeElementsInWorkbench = useCanvasStore.getState().nudgeElementsInWorkbench;
const originalWindow = globalThis.window;
const originalHTMLElement = globalThis.HTMLElement;
const keyDownListeners = new Set<(event: KeyboardEvent) => void>();

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

const dispatchKeyDown = (
  event: Partial<KeyboardEvent> & Pick<KeyboardEvent, "key" | "shiftKey">
) => {
  const keyboardEvent = {
    ctrlKey: false,
    metaKey: false,
    target: null,
    preventDefault: vi.fn(),
    ...event,
  } as KeyboardEvent;

  keyDownListeners.forEach((listener) => {
    listener(keyboardEvent);
  });

  return keyboardEvent;
};

const createRenderableShapeNode = (
  overrides: Partial<CanvasRenderableNode> = {}
): CanvasRenderableNode =>
  ({
    id: overrides.id ?? "shape-1",
    type: "shape",
    parentId: overrides.parentId ?? null,
    depth: overrides.depth ?? 0,
    bounds: overrides.bounds ?? {
      x: 0,
      y: 0,
      width: 240,
      height: 180,
    },
    childIds: overrides.childIds ?? [],
    opacity: overrides.opacity ?? 1,
    worldOpacity: overrides.worldOpacity ?? 1,
    locked: overrides.locked ?? false,
    visible: overrides.visible ?? true,
    effectiveLocked: overrides.effectiveLocked ?? false,
    effectiveVisible: overrides.effectiveVisible ?? true,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 240,
    height: overrides.height ?? 180,
    rotation: overrides.rotation ?? 0,
    transform: overrides.transform ?? {
      x: 0,
      y: 0,
      width: 240,
      height: 180,
      rotation: 0,
    },
    shapeType: "rect",
    fill: "#ffffff",
    fillStyle: {
      color: "#ffffff",
      kind: "solid",
    },
    stroke: "#000000",
    strokeWidth: 0,
  }) as CanvasRenderableNode;

const createWorkbench = (node: CanvasRenderableNode): CanvasWorkbench =>
  ({
    id: "workbench-1",
    version: 5,
    ownerRef: {
      userId: "user-1",
    },
    name: "Workbench",
    width: 1080,
    height: 1080,
    presetId: "feed" as never,
    backgroundColor: "#000000",
    nodes: {
      [node.id]: node,
    },
    rootIds: [node.id],
    groupChildren: {},
    slices: [],
    guides: {
      showCenter: false,
      showThirds: false,
      showSafeArea: false,
    },
    safeArea: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    preferredCoverAssetId: null,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    allNodes: [node],
    elements: [node],
  }) as unknown as CanvasWorkbench;

function installLoadedWorkbench(workbench: CanvasWorkbench, selectedElementIds: string[]) {
  const nudgeElementsInWorkbench = vi.fn().mockResolvedValue(undefined);

  useCanvasStore.setState({
    ...baseCanvasState,
    loadedWorkbenchId: workbench.id,
    selectedElementIds,
    workbench,
    nudgeElementsInWorkbench,
    workbenchList: [
      {
        coverAssetId: null,
        createdAt: workbench.createdAt,
        elementCount: workbench.elements.length,
        height: workbench.height,
        id: workbench.id,
        name: workbench.name,
        presetId: workbench.presetId,
        updatedAt: workbench.updatedAt,
        width: workbench.width,
      },
    ],
  });

  return { nudgeElementsInWorkbench };
}

function Harness({ onShortcutKeyDown }: { onShortcutKeyDown: (event: KeyboardEvent) => boolean }) {
  useCanvasInteraction({ onShortcutKeyDown });
  return null;
}

beforeAll(() => {
  Object.assign(globalThis, {
    HTMLElement: class HTMLElementStub {},
    window: windowStub,
  });
});

afterEach(() => {
  keyDownListeners.clear();
  useCanvasStore.setState({
    ...baseCanvasState,
    nudgeElementsInWorkbench: initialNudgeElementsInWorkbench,
  });
});

afterAll(() => {
  Object.assign(globalThis, {
    HTMLElement: originalHTMLElement,
    window: originalWindow,
  });
});

describe("useCanvasInteraction", () => {
  it("nudges the current selection with arrow keys after shortcut dispatch declines the event", async () => {
    const selectedNode = createRenderableShapeNode();
    const workbench = createWorkbench(selectedNode);
    const { nudgeElementsInWorkbench } = installLoadedWorkbench(workbench, [selectedNode.id]);

    let renderer: ReactTestRenderer | null = null;
    await act(async () => {
      renderer = create(<Harness onShortcutKeyDown={() => false} />);
    });

    await act(async () => {
      dispatchKeyDown({ key: "ArrowRight", shiftKey: false });
    });

    expect(nudgeElementsInWorkbench).toHaveBeenCalledWith(workbench.id, [selectedNode.id], 1, 0);

    await act(async () => {
      dispatchKeyDown({ key: "ArrowUp", shiftKey: true });
    });

    expect(nudgeElementsInWorkbench).toHaveBeenLastCalledWith(
      workbench.id,
      [selectedNode.id],
      0,
      -10
    );

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("clears selected ids that are no longer selectable", async () => {
    const hiddenNode = createRenderableShapeNode({
      effectiveVisible: false,
      visible: false,
    });
    const workbench = createWorkbench(hiddenNode);
    let renderer: ReactTestRenderer | null = null;

    installLoadedWorkbench(workbench, [hiddenNode.id]);

    await act(async () => {
      renderer = create(<Harness onShortcutKeyDown={() => false} />);
    });

    expect(useCanvasStore.getState().selectedElementIds).toEqual([]);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("does not nudge when a higher-priority shortcut already handled the key", async () => {
    const selectedNode = createRenderableShapeNode();
    const workbench = createWorkbench(selectedNode);
    const { nudgeElementsInWorkbench } = installLoadedWorkbench(workbench, [selectedNode.id]);
    const onShortcutKeyDown = vi.fn().mockReturnValue(true);
    let renderer: ReactTestRenderer | null = null;

    await act(async () => {
      renderer = create(<Harness onShortcutKeyDown={onShortcutKeyDown} />);
    });

    await act(async () => {
      dispatchKeyDown({ key: "ArrowLeft", shiftKey: false });
    });

    expect(onShortcutKeyDown).toHaveBeenCalledTimes(1);
    expect(nudgeElementsInWorkbench).not.toHaveBeenCalled();

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("does not nudge while the keyboard target is editable", async () => {
    const selectedNode = createRenderableShapeNode();
    const workbench = createWorkbench(selectedNode);
    const { nudgeElementsInWorkbench } = installLoadedWorkbench(workbench, [selectedNode.id]);
    let renderer: ReactTestRenderer | null = null;

    await act(async () => {
      renderer = create(<Harness onShortcutKeyDown={() => false} />);
    });

    const editableTarget = new HTMLElement();
    Object.defineProperties(editableTarget, {
      isContentEditable: { value: false },
      tagName: { value: "TEXTAREA" },
    });

    await act(async () => {
      dispatchKeyDown({
        key: "ArrowDown",
        shiftKey: false,
        target: editableTarget as EventTarget,
      });
    });

    expect(nudgeElementsInWorkbench).not.toHaveBeenCalled();

    await act(async () => {
      renderer?.unmount();
    });
  });
});
