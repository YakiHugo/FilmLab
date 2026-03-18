import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import type { Asset, CanvasDocument } from "@/types";
import { cropRenderedCanvasSlice, renderCanvasDocumentToCanvas } from "./renderCanvasDocument";

const renderDocumentToCanvasMock = vi.fn();
const releaseRenderSlotsMock = vi.fn();

vi.mock("@/features/editor/renderDocumentCanvas", () => ({
  renderDocumentToCanvas: (...args: unknown[]) => renderDocumentToCanvasMock(...args),
}));

vi.mock("@/lib/imageProcessing", () => ({
  releaseRenderSlots: (...args: unknown[]) => releaseRenderSlotsMock(...args),
}));

const createAsset = (): Asset => ({
  id: "asset-1",
  name: "asset-1.jpg",
  type: "image/jpeg",
  size: 2048,
  createdAt: "2026-03-17T00:00:00.000Z",
  objectUrl: "blob:asset-1",
  thumbnailUrl: "blob:asset-1-thumb",
  adjustments: createDefaultAdjustments(),
  layers: [],
  tags: [],
  importDay: "2026-03-17",
  group: "2026-03-17",
  origin: "file",
  remote: {
    status: "local_only",
    updatedAt: "2026-03-17T00:00:00.000Z",
  },
  ownerRef: {
    userId: "user-1",
  },
});

const createContext = () => ({
  arc: vi.fn(),
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  lineTo: vi.fn(),
  measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
  moveTo: vi.fn(),
  restore: vi.fn(),
  rotate: vi.fn(),
  save: vi.fn(),
  scale: vi.fn(),
  stroke: vi.fn(),
  strokeRect: vi.fn(),
  translate: vi.fn(),
  set fillStyle(_value: string) {},
  set font(_value: string) {},
  set globalAlpha(_value: number) {},
  set imageSmoothingEnabled(_value: boolean) {},
  set imageSmoothingQuality(_value: "low" | "medium" | "high") {},
  set lineWidth(_value: number) {},
  set strokeStyle(_value: string) {},
  set textAlign(_value: CanvasTextAlign) {},
  set textBaseline(_value: CanvasTextBaseline) {},
});

const createCanvas = (context = createContext()) => ({
  height: 0,
  width: 0,
  getContext: vi.fn(() => context),
  toDataURL: vi.fn(() => "data:image/png;base64,rendered"),
});

const createCanvasDocument = (): CanvasDocument => ({
  id: "doc-1",
  name: "Board",
  width: 1000,
  height: 800,
  presetId: "custom",
  backgroundColor: "#101010",
  elements: [
    {
      id: "image-1",
      type: "image",
      assetId: "asset-1",
      x: 100,
      y: 120,
      width: 200,
      height: 100,
      rotation: 10,
      opacity: 0.9,
      locked: false,
      visible: true,
      zIndex: 1,
    },
    {
      id: "text-1",
      type: "text",
      content: "Board export",
      fontFamily: "Georgia",
      fontSize: 24,
      fontSizeTier: "small",
      color: "#ffffff",
      textAlign: "left",
      x: 200,
      y: 260,
      width: 180,
      height: 50,
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

describe("renderCanvasDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renderDocumentToCanvasMock.mockResolvedValue(undefined);
    releaseRenderSlotsMock.mockResolvedValue(undefined);
  });

  it("renders image and text elements without including editor-only overlays", async () => {
    const createdCanvases: Array<ReturnType<typeof createCanvas>> = [];
    vi.stubGlobal("document", {
      createElement: vi.fn(() => {
        const canvas = createCanvas();
        createdCanvases.push(canvas);
        return canvas;
      }),
    });

    const mainContext = createContext();
    const mainCanvas = createCanvas(mainContext);
    const canvasDocument = createCanvasDocument();

    await renderCanvasDocumentToCanvas({
      assets: [createAsset()],
      canvas: mainCanvas as unknown as HTMLCanvasElement,
      document: canvasDocument,
      height: 1600,
      pixelRatio: 1,
      width: 2000,
    });

    expect(renderDocumentToCanvasMock).toHaveBeenCalledTimes(1);
    expect(renderDocumentToCanvasMock.mock.calls[0]?.[0]).toMatchObject({
      intent: "export-full",
      renderSlotPrefix: "board-export",
      targetSize: {
        width: 400,
        height: 200,
      },
    });
    expect(mainContext.drawImage).toHaveBeenCalled();
    expect(mainContext.fillText).toHaveBeenCalledWith("Board export", 0, 0);
    expect(mainContext.fillRect).toHaveBeenCalledWith(0, 0, 1000, 800);
    expect(releaseRenderSlotsMock).toHaveBeenCalledWith("export", "board-export");
    createdCanvases.forEach((canvas) => {
      expect(canvas.width).toBe(0);
      expect(canvas.height).toBe(0);
    });
  });

  it("renders explicit text line breaks without width-based wrapping", async () => {
    vi.stubGlobal("document", {
      createElement: vi.fn(() => createCanvas()),
    });

    const mainContext = createContext();
    const mainCanvas = createCanvas(mainContext);
    const canvasDocument = createCanvasDocument();
    const textElement = canvasDocument.elements[1];
    if (!textElement || textElement.type !== "text") {
      throw new Error("Expected text element.");
    }

    textElement.content = "first line\nsecond";
    textElement.width = 40;

    await renderCanvasDocumentToCanvas({
      assets: [createAsset()],
      canvas: mainCanvas as unknown as HTMLCanvasElement,
      document: canvasDocument,
      height: 1600,
      pixelRatio: 1,
      width: 2000,
    });

    expect(mainContext.fillText).toHaveBeenNthCalledWith(1, "first line", 0, 0);
    expect(mainContext.fillText).toHaveBeenNthCalledWith(2, "second", 0, 28.799999999999997);
    expect(mainContext.fillText).toHaveBeenCalledTimes(2);
  });

  it("crops rendered slice regions using the board export scale", () => {
    const sliceContext = createContext();
    const sliceCanvas = createCanvas(sliceContext);
    vi.stubGlobal("document", {
      createElement: vi.fn(() => sliceCanvas),
    });

    const boardCanvas = createCanvas();
    boardCanvas.width = 1000;
    boardCanvas.height = 800;

    const result = cropRenderedCanvasSlice({
      canvas: boardCanvas as unknown as HTMLCanvasElement,
      document: createCanvasDocument(),
      pixelRatio: 2,
      slice: {
        x: 50,
        y: 40,
        width: 100,
        height: 80,
      },
    });

    expect(result.width).toBe(200);
    expect(result.height).toBe(160);
    expect(sliceContext.drawImage).toHaveBeenCalledWith(
      boardCanvas,
      50,
      40,
      100,
      80,
      0,
      0,
      200,
      160
    );
  });
});
