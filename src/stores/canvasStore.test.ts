import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import type { CanvasDocument } from "@/types";
import { useCanvasStore } from "./canvasStore";

const saveCanvasDocumentMock = vi.fn();

vi.mock("@/lib/db", () => ({
  deleteCanvasDocument: vi.fn(),
  loadCanvasDocuments: vi.fn(async () => []),
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

describe("canvasStore", () => {
  beforeEach(() => {
    saveCanvasDocumentMock.mockClear();
    saveCanvasDocumentMock.mockResolvedValue(true);
    useCanvasStore.setState({
      activeDocumentId: "doc-1",
      documents: [createDocument()],
      historyByDocumentId: {},
      selectedElementIds: [],
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
});
