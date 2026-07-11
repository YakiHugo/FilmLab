import { createCanvasImageElementFromAsset } from "@/features/canvas/image/imageNodeFactory";
import { useCanvasStore } from "@/stores/canvasStore";
import type { Asset } from "@/types";
import { resolveCanvasImageInsertionSize } from "@/utils";

const resolveWorkbenchName = (assetName: string) => {
  const withoutExtension = assetName.replace(/\.[^.]+$/, "").trim();
  return `${(withoutExtension || "Untitled").slice(0, 48)} / COMPUTE`;
};

const resolveCoverPlacement = ({
  canvasHeight,
  canvasWidth,
  imageHeight,
  imageWidth,
}: {
  canvasHeight: number;
  canvasWidth: number;
  imageHeight: number;
  imageWidth: number;
}) => {
  const scale = Math.max(canvasWidth / imageWidth, canvasHeight / imageHeight);
  const width = Math.round(imageWidth * scale);
  const height = Math.round(imageHeight * scale);

  return {
    width,
    height,
    x: Math.round((canvasWidth - width) / 2),
    y: Math.round((canvasHeight - height) / 2),
  };
};

export const createImageWorkbench = async (asset: Asset) => {
  const sourceSize = await resolveCanvasImageInsertionSize(asset, { longestEdge: 1_000 });
  const canvasStore = useCanvasStore.getState();
  await canvasStore.init();

  const workbench = await canvasStore.createWorkbench(resolveWorkbenchName(asset.name));
  if (!workbench) {
    throw new Error("无法创建作品，请重试。");
  }

  const placement = resolveCoverPlacement({
    canvasHeight: workbench.height,
    canvasWidth: workbench.width,
    imageHeight: sourceSize.height,
    imageWidth: sourceSize.width,
  });
  const imageNode = createCanvasImageElementFromAsset({
    asset,
    ...placement,
  });

  try {
    const inserted = await canvasStore.executeCommandInWorkbench(
      workbench.id,
      { type: "INSERT_NODES", nodes: [imageNode] },
      { trackHistory: false }
    );
    if (!inserted?.nodes[imageNode.id]) {
      throw new Error("图片未能写入作品，请重试。");
    }
    const committed = await canvasStore.patchWorkbench(
      workbench.id,
      { preferredCoverAssetId: asset.id },
      { trackHistory: false }
    );
    if (!committed?.nodes[imageNode.id]) {
      throw new Error("图片未能写入作品，请重试。");
    }
    const framed = await canvasStore.executeCommandInWorkbench(
      workbench.id,
      { type: "APPLY_OUTPUT_FORMAT", presetId: "social-portrait" },
      { trackHistory: false }
    );
    if (!framed?.nodes[imageNode.id]) {
      throw new Error("图片未能适配输出画幅，请重试。");
    }
  } catch (cause) {
    const removed = await useCanvasStore.getState().deleteWorkbench(workbench.id);
    if (!removed) {
      throw new Error("图片写入失败，且未能清理未完成的作品。", { cause });
    }
    throw cause;
  }

  useCanvasStore.getState().setSelectedElementIds([imageNode.id]);
  useCanvasStore.getState().setActivePanel("styles");

  return {
    workbenchId: workbench.id,
  };
};
