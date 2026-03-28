import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { renderSingleImageToCanvas } from "@/render/image";
import type { Asset, CanvasWorkbench } from "@/types";
import { normalizeCanvasWorkbench } from "./studioPresets";
import { cropRenderedCanvasSlice, renderCanvasWorkbenchToCanvas } from "./renderCanvasWorkbench";

const releaseRenderSlotsMock = vi.fn();
vi.mock("@/render/image", async () => {
  const actual = await vi.importActual<typeof import("@/render/image")>("@/render/image");
  return {
    ...actual,
    renderSingleImageToCanvas: vi.fn(),
  };
});

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
  arcTo: vi.fn(),
  arc: vi.fn(),
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  closePath: vi.fn(),
  createLinearGradient: vi.fn(() => ({
    addColorStop: vi.fn(),
  })),
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
  set lineCap(_value: CanvasLineCap) {},
  set lineJoin(_value: CanvasLineJoin) {},
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

const createCanvasWorkbench = (): CanvasWorkbench =>
  normalizeCanvasWorkbench({
    id: "doc-1",
    name: "工作台",
    width: 1000,
    height: 800,
    presetId: "custom",
    backgroundColor: "#101010",
    elements: [
      {
        id: "image-1",
        type: "image",
        parentId: null,
        assetId: "asset-1",
        x: 100,
        y: 120,
        width: 200,
        height: 100,
        rotation: 10,
        transform: {
          x: 100,
          y: 120,
          width: 200,
          height: 100,
          rotation: 10,
        },
        opacity: 0.9,
        locked: false,
        visible: true,
      },
      {
        id: "text-1",
        type: "text",
        parentId: null,
        content: "工作台 export",
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
        transform: {
          x: 200,
          y: 260,
          width: 180,
          height: 50,
          rotation: 0,
        },
        opacity: 1,
        locked: false,
        visible: true,
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

const createNestedVisibilityDocument = (): CanvasWorkbench =>
  normalizeCanvasWorkbench({
    id: "doc-hidden",
    name: "工作台",
    width: 1000,
    height: 800,
    presetId: "custom",
    backgroundColor: "#101010",
    version: 2,
    nodes: {
      "group-1": {
        id: "group-1",
        type: "group",
        parentId: null,
        x: 120,
        y: 90,
        width: 1,
        height: 1,
        rotation: 0,
        transform: {
          x: 120,
          y: 90,
          width: 1,
          height: 1,
          rotation: 0,
        },
        opacity: 1,
        locked: false,
        visible: false,
        childIds: ["image-1"],
        name: "Hidden group",
      },
      "image-1": {
        id: "image-1",
        type: "image",
        parentId: "group-1",
        assetId: "asset-1",
        x: 24,
        y: 18,
        width: 200,
        height: 100,
        rotation: 0,
        transform: {
          x: 24,
          y: 18,
          width: 200,
          height: 100,
          rotation: 0,
        },
        opacity: 1,
        locked: false,
        visible: true,
      },
      "text-1": {
        id: "text-1",
        type: "text",
        parentId: null,
        content: "Visible copy",
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
        transform: {
          x: 200,
          y: 260,
          width: 180,
          height: 50,
          rotation: 0,
        },
        opacity: 1,
        locked: false,
        visible: true,
      },
    },
    rootIds: ["group-1", "text-1"],
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

describe("renderCanvasWorkbench", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(renderSingleImageToCanvas).mockResolvedValue({ revisionKey: "revision-1" });
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
    const canvasDocument = createCanvasWorkbench();

    await renderCanvasWorkbenchToCanvas({
      assets: [createAsset()],
      canvas: mainCanvas as unknown as HTMLCanvasElement,
      document: canvasDocument,
      height: 1600,
      pixelRatio: 1,
      width: 2000,
    });

    expect(renderSingleImageToCanvas).toHaveBeenCalledTimes(1);
    expect(vi.mocked(renderSingleImageToCanvas).mock.calls[0]?.[0]).toMatchObject({
      request: {
        intent: "export",
        quality: "full",
        renderSlotId: "board-export",
        targetSize: {
          width: 400,
          height: 200,
        },
      },
    });
    expect(mainContext.drawImage).toHaveBeenCalled();
    expect(mainContext.fillText).toHaveBeenCalledWith("工作台 export", 0, 0);
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
    const canvasDocument = createCanvasWorkbench();
    const textElement = canvasDocument.elements[1];
    if (!textElement || textElement.type !== "text") {
      throw new Error("Expected text element.");
    }

    textElement.content = "first line\nsecond";
    textElement.width = 40;

    await renderCanvasWorkbenchToCanvas({
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

  it("skips descendants of hidden groups during export rendering", async () => {
    vi.stubGlobal("document", {
      createElement: vi.fn(() => createCanvas()),
    });

    const mainContext = createContext();
    const mainCanvas = createCanvas(mainContext);

    await renderCanvasWorkbenchToCanvas({
      assets: [createAsset()],
      canvas: mainCanvas as unknown as HTMLCanvasElement,
      document: createNestedVisibilityDocument(),
      height: 1600,
      pixelRatio: 1,
      width: 2000,
    });

    expect(renderSingleImageToCanvas).not.toHaveBeenCalled();
    expect(mainContext.fillText).toHaveBeenCalledWith("Visible copy", 0, 0);
    expect(mainContext.fillText).toHaveBeenCalledTimes(1);
  });

  it("renders shape gradients through the export fill pipeline", async () => {
    const gradient = {
      addColorStop: vi.fn(),
    };
    const mainContext = createContext();
    mainContext.createLinearGradient = vi.fn(() => gradient);
    const mainCanvas = createCanvas(mainContext);
    vi.stubGlobal("document", {
      createElement: vi.fn(() => createCanvas()),
    });

    const canvasDocument = normalizeCanvasWorkbench({
      id: "doc-shape-gradient",
      version: 3,
      name: "Gradient Shape",
      width: 1000,
      height: 800,
      presetId: "custom",
      backgroundColor: "#101010",
      nodes: {
        "shape-1": {
          id: "shape-1",
          type: "shape",
          parentId: null,
          shapeType: "rect",
          fill: "#ff0066",
          fillStyle: {
            kind: "linear-gradient",
            angle: 0,
            from: "#ff0066",
            to: "#1e90ff",
          },
          stroke: "#ffffff",
          strokeWidth: 2,
          x: 120,
          y: 140,
          width: 240,
          height: 160,
          rotation: 0,
          transform: {
            x: 120,
            y: 140,
            width: 240,
            height: 160,
            rotation: 0,
          },
          opacity: 1,
          locked: false,
          visible: true,
        },
      },
      rootIds: ["shape-1"],
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

    await renderCanvasWorkbenchToCanvas({
      assets: [],
      canvas: mainCanvas as unknown as HTMLCanvasElement,
      document: canvasDocument,
      height: 800,
      pixelRatio: 1,
      width: 1000,
    });

    expect(mainContext.createLinearGradient).toHaveBeenCalledTimes(1);
    expect(gradient.addColorStop).toHaveBeenNthCalledWith(1, 0, "#ff0066");
    expect(gradient.addColorStop).toHaveBeenNthCalledWith(2, 1, "#1e90ff");
    expect(mainContext.fillRect).toHaveBeenCalledWith(0, 0, 240, 160);
  });

  it("crops rendered slice regions using the 工作台 export scale", () => {
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
      document: createCanvasWorkbench(),
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

  it("keeps line and arrow export styling aligned with the stage renderer", async () => {
    const mainContext = createContext();
    const mainCanvas = createCanvas(mainContext);
    vi.stubGlobal("document", {
      createElement: vi.fn(() => createCanvas()),
    });

    const canvasDocument = normalizeCanvasWorkbench({
      id: "doc-shape-line-arrow",
      version: 3,
      name: "Line Arrow",
      width: 400,
      height: 300,
      presetId: "custom",
      backgroundColor: "#101010",
      nodes: {
        "line-1": {
          id: "line-1",
          type: "shape",
          parentId: null,
          shapeType: "line",
          fill: "transparent",
          stroke: "#ff0066",
          strokeWidth: 6,
          points: [
            { x: 0, y: 40 },
            { x: 120, y: 40 },
          ],
          x: 20,
          y: 20,
          width: 120,
          height: 80,
          rotation: 0,
          transform: {
            x: 20,
            y: 20,
            width: 120,
            height: 80,
            rotation: 0,
          },
          opacity: 1,
          locked: false,
          visible: true,
        },
        "arrow-1": {
          id: "arrow-1",
          type: "shape",
          parentId: null,
          shapeType: "arrow",
          fill: "transparent",
          stroke: "#1e90ff",
          strokeWidth: 4,
          points: [
            { x: 0, y: 40 },
            { x: 120, y: 40 },
          ],
          arrowHead: {
            start: false,
            end: true,
          },
          x: 20,
          y: 120,
          width: 120,
          height: 80,
          rotation: 0,
          transform: {
            x: 20,
            y: 120,
            width: 120,
            height: 80,
            rotation: 0,
          },
          opacity: 1,
          locked: false,
          visible: true,
        },
      },
      rootIds: ["line-1", "arrow-1"],
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

    await renderCanvasWorkbenchToCanvas({
      assets: [],
      canvas: mainCanvas as unknown as HTMLCanvasElement,
      document: canvasDocument,
      height: 300,
      pixelRatio: 1,
      width: 400,
    });

    expect(mainContext.stroke).toHaveBeenCalledTimes(3);
    expect(mainContext.fill).toHaveBeenCalledTimes(1);
    expect(mainContext.closePath).toHaveBeenCalledTimes(1);
  });

  it("exports rounded rect shapes through a rounded path", async () => {
    const mainContext = createContext();
    const mainCanvas = createCanvas(mainContext);
    vi.stubGlobal("document", {
      createElement: vi.fn(() => createCanvas()),
    });

    const canvasDocument = normalizeCanvasWorkbench({
      id: "doc-shape-rounded-rect",
      version: 3,
      name: "Rounded Rect",
      width: 400,
      height: 300,
      presetId: "custom",
      backgroundColor: "#101010",
      nodes: {
        "shape-1": {
          id: "shape-1",
          type: "shape",
          parentId: null,
          shapeType: "rect",
          fill: "#ff0066",
          stroke: "#ffffff",
          strokeWidth: 2,
          radius: 24,
          x: 20,
          y: 20,
          width: 120,
          height: 80,
          rotation: 0,
          transform: {
            x: 20,
            y: 20,
            width: 120,
            height: 80,
            rotation: 0,
          },
          opacity: 1,
          locked: false,
          visible: true,
        },
      },
      rootIds: ["shape-1"],
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

    await renderCanvasWorkbenchToCanvas({
      assets: [],
      canvas: mainCanvas as unknown as HTMLCanvasElement,
      document: canvasDocument,
      height: 300,
      pixelRatio: 1,
      width: 400,
    });

    expect(mainContext.arcTo).toHaveBeenCalledTimes(4);
  });
});
