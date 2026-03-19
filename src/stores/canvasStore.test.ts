import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import type { CanvasDocument } from "@/types";
import { useCanvasStore } from "./canvasStore";

const loadCanvasDocumentsMock = vi.fn();
const saveCanvasDocumentMock = vi.fn();

vi.mock("@/lib/db", () => ({
  deleteCanvasDocument: vi.fn(),
  loadCanvasDocuments: (...args: unknown[]) => loadCanvasDocumentsMock(...args),
  saveCanvasDocument: (...args: unknown[]) => saveCanvasDocumentMock(...args),
}));

const createDocument = (): CanvasDocument => ({
  id: "doc-1",
  name: "Board",
  width: 1200,
  height: 800,
  presetId: "custom",
  backgroundColor: "#000000",
  elements: [
    {
      id: "image-1",
      type: "image",
      assetId: "asset-1",
      x: 10,
      y: 20,
      width: 300,
      height: 200,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      zIndex: 1,
      adjustments: createDefaultAdjustments(),
    },
    {
      id: "text-1",
      type: "text",
      content: "Hello",
      fontFamily: "Georgia",
      fontSize: 24,
      fontSizeTier: "small",
      color: "#ffffff",
      textAlign: "left",
      x: 40,
      y: 60,
      width: 180,
      height: 80,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      zIndex: 2,
    },
  ],
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
  createdAt: "2026-03-17T00:00:00.000Z",
  updatedAt: "2026-03-17T00:00:00.000Z",
});

const createLegacyShapeDocument = () =>
  ({
    ...createDocument(),
    elements: [
      {
        ...(createDocument().elements[0] as CanvasDocument["elements"][number]),
      },
      {
        ...(createDocument().elements[1] as CanvasDocument["elements"][number]),
        fontSizeTier: undefined,
      },
      {
        id: "shape-1",
        type: "shape",
        shape: "rect",
        fill: "#ffcc00",
        stroke: "#000000",
        strokeWidth: 2,
        x: 32,
        y: 48,
        width: 96,
        height: 64,
        rotation: 0,
        opacity: 1,
        locked: false,
        visible: true,
        zIndex: 3,
      },
    ],
  }) as unknown as CanvasDocument;

const createLegacyTextTierDocument = () => {
  const document = createDocument();
  const textElement = document.elements[1];
  if (!textElement || textElement.type !== "text") {
    throw new Error("Expected text element.");
  }

  return {
    ...document,
    elements: [
      document.elements[0],
      {
        ...textElement,
        fontSizeTier: undefined,
      },
    ],
  } as unknown as CanvasDocument;
};

describe("canvasStore", () => {
  beforeEach(() => {
    loadCanvasDocumentsMock.mockReset();
    loadCanvasDocumentsMock.mockResolvedValue([]);
    saveCanvasDocumentMock.mockClear();
    saveCanvasDocumentMock.mockResolvedValue(true);
    useCanvasStore.setState({
      activeDocumentId: "doc-1",
      documents: [createDocument()],
      historyByDocumentId: {},
      activePanel: null,
      selectedElementIds: [],
      tool: "select",
      viewport: { x: 0, y: 0 },
      zoom: 1,
    });
  });

  it("persists image-only adjustment updates even when geometry is unchanged", async () => {
    const element = useCanvasStore
      .getState()
      .documents[0]?.elements.find((candidate) => candidate.id === "image-1");
    if (!element || element.type !== "image") {
      throw new Error("Expected image element.");
    }
    const nextAdjustments = {
      ...createDefaultAdjustments(),
      ...(element.adjustments ?? {}),
      exposure: 18,
    };

    await useCanvasStore.getState().upsertElement("doc-1", {
      ...element,
      adjustments: nextAdjustments,
    });

    const updated = useCanvasStore
      .getState()
      .documents[0]?.elements.find((candidate) => candidate.id === "image-1");
    expect(updated?.type).toBe("image");
    if (updated?.type !== "image") {
      return;
    }
    expect(updated.adjustments?.exposure).toBe(18);
    expect(saveCanvasDocumentMock).toHaveBeenCalledTimes(1);
  });

  it("persists text content updates without requiring transform changes", async () => {
    const element = useCanvasStore
      .getState()
      .documents[0]?.elements.find((candidate) => candidate.id === "text-1");
    if (!element || element.type !== "text") {
      throw new Error("Expected text element.");
    }

    await useCanvasStore.getState().upsertElement("doc-1", {
      ...element,
      content: "Updated copy",
    });

    const updated = useCanvasStore
      .getState()
      .documents[0]?.elements.find((candidate) => candidate.id === "text-1");
    expect(updated?.type).toBe("text");
    if (updated?.type !== "text") {
      return;
    }
    expect(updated.content).toBe("Updated copy");
    expect(saveCanvasDocumentMock).toHaveBeenCalledTimes(1);
  });

  it("filters legacy shape elements during init and persists the cleaned document", async () => {
    loadCanvasDocumentsMock.mockResolvedValue([createLegacyShapeDocument()]);

    await useCanvasStore.getState().init();

    const documents = useCanvasStore.getState().documents;
    expect(documents).toHaveLength(1);
    expect(documents[0]?.elements).toHaveLength(2);
    expect(documents[0]?.elements.map((element) => element.type)).toEqual(["image", "text"]);
    expect(documents[0]?.elements[1]).toMatchObject({
      id: "text-1",
      type: "text",
      fontSizeTier: "small",
    });
    expect(saveCanvasDocumentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "doc-1",
        elements: expect.arrayContaining([
          expect.objectContaining({ id: "image-1", type: "image" }),
          expect.objectContaining({ id: "text-1", type: "text" }),
        ]),
      })
    );
  });

  it("persists legacy text tier normalization during init", async () => {
    loadCanvasDocumentsMock.mockResolvedValue([createLegacyTextTierDocument()]);

    await useCanvasStore.getState().init();

    const documents = useCanvasStore.getState().documents;
    expect(documents).toHaveLength(1);
    expect(documents[0]?.elements[1]).toMatchObject({
      id: "text-1",
      type: "text",
      fontSizeTier: "small",
    });
    expect(saveCanvasDocumentMock).toHaveBeenCalledTimes(1);
    expect(saveCanvasDocumentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "doc-1",
        elements: expect.arrayContaining([
          expect.objectContaining({
            id: "text-1",
            type: "text",
            fontSizeTier: "small",
          }),
        ]),
      })
    );
  });

  it("keeps the left rail exclusive between text mode and panels", () => {
    useCanvasStore.setState({
      activePanel: "library",
      tool: "select",
    });

    useCanvasStore.getState().setTool("text");
    expect(useCanvasStore.getState().tool).toBe("text");
    expect(useCanvasStore.getState().activePanel).toBeNull();

    useCanvasStore.getState().setActivePanel("edit");
    expect(useCanvasStore.getState().tool).toBe("select");
    expect(useCanvasStore.getState().activePanel).toBe("edit");

    useCanvasStore.getState().togglePanel("edit");
    expect(useCanvasStore.getState().tool).toBe("select");
    expect(useCanvasStore.getState().activePanel).toBeNull();
  });

  it("returns to select when a floating panel is closed through setActivePanel(null)", () => {
    useCanvasStore.setState({
      activePanel: "edit",
      tool: "hand",
    });

    useCanvasStore.getState().setActivePanel(null);

    expect(useCanvasStore.getState().activePanel).toBeNull();
    expect(useCanvasStore.getState().tool).toBe("select");
  });

  it("short-circuits committed selection updates when ids are unchanged", () => {
    useCanvasStore.getState().setSelectedElementIds(["image-1", "text-1"]);
    const firstSelectedElementIds = useCanvasStore.getState().selectedElementIds;

    useCanvasStore.getState().setSelectedElementIds(["image-1", "text-1"]);

    expect(useCanvasStore.getState().selectedElementIds).toBe(firstSelectedElementIds);
  });
});
