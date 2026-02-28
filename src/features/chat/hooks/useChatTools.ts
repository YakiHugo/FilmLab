import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { presets } from "@/data/presets";
import { emit } from "@/lib/storeEvents";
import type { Asset, CanvasElement, CanvasTextElement } from "@/types";
import { getRegisteredCanvasStage } from "@/features/canvas/hooks/canvasStageRegistry";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { useEditorStore } from "@/stores/editorStore";
import type { ChatToolResult } from "../types";
import { generateAndImportImage } from "./useImageGeneration";

interface ToolCall {
  toolName: string;
  args: Record<string, unknown>;
  toolCallId?: string;
}

const createElementId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `canvas-el-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const asStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

const buildAssetSummary = (asset: Asset) => ({
  id: asset.id,
  name: asset.name,
  tags: asset.tags ?? [],
  importDay: asset.importDay ?? asset.createdAt.slice(0, 10),
  source: asset.source ?? "imported",
  size: asset.size,
  width: asset.metadata?.width ?? null,
  height: asset.metadata?.height ?? null,
});

const toolSuccess = (
  toolCall: ToolCall,
  data: Record<string, unknown> = {}
): ChatToolResult => ({
  toolName: toolCall.toolName,
  success: true,
  args: toolCall.args,
  data,
  toolCallId: toolCall.toolCallId,
  source: "client-dispatch",
});

const toolFailure = (toolCall: ToolCall, error: string, data?: Record<string, unknown>): ChatToolResult => ({
  toolName: toolCall.toolName,
  success: false,
  args: toolCall.args,
  data,
  error,
  toolCallId: toolCall.toolCallId,
  source: "client-dispatch",
});

export function useChatTools() {
  const navigate = useNavigate();

  const dispatchTool = useCallback(
    async (toolCall: ToolCall): Promise<ChatToolResult> => {
      emit("chat:tool-dispatch", {
        toolName: toolCall.toolName,
        args: toolCall.args,
      });

      try {
        if (toolCall.toolName === "selectAssets") {
          const query = String(toolCall.args.query ?? "").trim().toLowerCase();
          const limit = Number(toolCall.args.limit ?? 12);
          const assets = useAssetStore.getState().assets;
          const matchedAssets = assets
            .filter((asset) => {
              if (!query) {
                return true;
              }
              const tags = (asset.tags ?? []).join(" ").toLowerCase();
              return (
                asset.name.toLowerCase().includes(query) ||
                tags.includes(query) ||
                (asset.importDay ?? "").includes(query)
              );
            })
            .slice(0, Number.isFinite(limit) ? limit : 12);

          const matchedIds = matchedAssets.map((asset) => asset.id);
          useAssetStore.getState().setSelectedAssetIds(matchedIds);

          return toolSuccess(toolCall, {
            matchedCount: matchedIds.length,
            matchedAssetIds: matchedIds,
            matchedAssets: matchedAssets.map(buildAssetSummary),
          });
        }

        if (toolCall.toolName === "openInEditor") {
          const assetId = String(toolCall.args.assetId ?? "").trim();
          if (!assetId) {
            return toolFailure(toolCall, "Missing assetId.");
          }
          const asset = useAssetStore.getState().assets.find((item) => item.id === assetId);
          if (!asset) {
            return toolFailure(toolCall, "Asset not found.", { assetId });
          }
          useEditorStore.getState().setSelectedAssetId(assetId);
          await navigate({
            to: "/editor",
            search: { assetId },
          });
          return toolSuccess(toolCall, {
            assetId,
            assetName: asset.name,
          });
        }

        if (toolCall.toolName === "createCanvas") {
          const name = String(toolCall.args.name ?? "Untitled board").trim() || "Untitled board";
          const assetIds = asStringArray(toolCall.args.assetIds);
          const document = await useCanvasStore.getState().createDocument(name);

          if (assetIds.length > 0) {
            const elements: CanvasElement[] = assetIds.map((assetId, index) => ({
              id: createElementId(),
              type: "image",
              assetId,
              x: 120 + index * 40,
              y: 120 + index * 40,
              width: 320,
              height: 320,
              rotation: 0,
              opacity: 1,
              locked: false,
              visible: true,
              zIndex: index + 1,
            }));
            await useCanvasStore.getState().upsertElements(document.id, elements);
          }

          await navigate({
            to: "/canvas/$documentId",
            params: { documentId: document.id },
          });

          return toolSuccess(toolCall, {
            documentId: document.id,
            name: document.name,
            importedAssetCount: assetIds.length,
          });
        }

        if (toolCall.toolName === "generateImage") {
          const prompt = String(toolCall.args.prompt ?? "").trim();
          if (!prompt) {
            return toolFailure(toolCall, "Missing prompt.");
          }
          const provider = String(toolCall.args.provider ?? "openai") as "openai" | "stability";
          const model = String(
            toolCall.args.model ?? (provider === "stability" ? "stable-image-core" : "gpt-image-1")
          );
          const size = String(toolCall.args.size ?? "1024x1024");

          const generation = await generateAndImportImage({
            prompt,
            provider,
            model,
            size,
          });
          return toolSuccess(toolCall, {
            prompt,
            provider,
            model,
            size,
            imageUrl: generation.imageUrl,
            importedAssetIds: generation.importedAssetIds,
          });
        }

        if (toolCall.toolName === "applyPresetToAssets") {
          const presetId = String(toolCall.args.presetId ?? "").trim();
          if (!presetId) {
            return toolFailure(toolCall, "Missing presetId.");
          }
          const intensity = Number(toolCall.args.intensity);
          const targetIds = asStringArray(toolCall.args.assetIds);
          const selectedIds = useAssetStore.getState().selectedAssetIds;
          const finalAssetIds = targetIds.length > 0 ? targetIds : selectedIds;
          if (finalAssetIds.length === 0) {
            return toolFailure(toolCall, "No target assets found.");
          }
          const preset = presets.find((item) => item.id === presetId);
          useAssetStore
            .getState()
            .applyPresetToSelection(
              finalAssetIds,
              presetId,
              Number.isFinite(intensity) ? intensity : 100
            );
          return toolSuccess(toolCall, {
            presetId,
            presetName: preset?.name ?? presetId,
            updatedCount: finalAssetIds.length,
            assetIds: finalAssetIds,
          });
        }

        if (toolCall.toolName === "tagAssets") {
          const tags = asStringArray(toolCall.args.tags);
          if (tags.length === 0) {
            return toolFailure(toolCall, "Missing tags.");
          }
          const action = String(toolCall.args.action ?? "add");
          const targetIds = asStringArray(toolCall.args.assetIds);
          const finalAssetIds =
            targetIds.length > 0 ? targetIds : useAssetStore.getState().selectedAssetIds;
          if (finalAssetIds.length === 0) {
            return toolFailure(toolCall, "No target assets found.");
          }
          if (action === "remove") {
            useAssetStore.getState().removeTagsFromAssets(finalAssetIds, tags);
          } else {
            useAssetStore.getState().addTagsToAssets(finalAssetIds, tags);
          }
          return toolSuccess(toolCall, {
            action,
            tags,
            updatedCount: finalAssetIds.length,
            assetIds: finalAssetIds,
          });
        }

        if (toolCall.toolName === "deleteAssets") {
          const confirmed = Boolean(toolCall.args.confirm);
          const targetIds = asStringArray(toolCall.args.assetIds);
          const finalAssetIds =
            targetIds.length > 0 ? targetIds : useAssetStore.getState().selectedAssetIds;
          if (finalAssetIds.length === 0) {
            return toolFailure(toolCall, "No target assets found.");
          }
          if (!confirmed) {
            return toolFailure(toolCall, "Deletion requires explicit confirm=true.", {
              pendingAssetIds: finalAssetIds,
            });
          }
          await useAssetStore.getState().deleteAssets(finalAssetIds);
          return toolSuccess(toolCall, {
            deletedCount: finalAssetIds.length,
            deletedAssetIds: finalAssetIds,
          });
        }

        if (toolCall.toolName === "addTextToCanvas") {
          const content = String(toolCall.args.content ?? "").trim();
          if (!content) {
            return toolFailure(toolCall, "Missing text content.");
          }
          const documentId =
            String(toolCall.args.documentId ?? "").trim() || useCanvasStore.getState().activeDocumentId;
          if (!documentId) {
            return toolFailure(toolCall, "No active canvas document.");
          }
          const x = Number(toolCall.args.x ?? 160);
          const y = Number(toolCall.args.y ?? 160);
          const fontSize = Number(toolCall.args.fontSize ?? 40);

          const textElement: CanvasTextElement = {
            id: createElementId(),
            type: "text",
            content,
            x: Number.isFinite(x) ? x : 160,
            y: Number.isFinite(y) ? y : 160,
            width: Math.max(220, content.length * Math.max(fontSize * 0.5, 18)),
            height: Math.max(64, fontSize * 1.6),
            rotation: 0,
            opacity: 1,
            locked: false,
            visible: true,
            zIndex: 999,
            fontFamily: String(toolCall.args.fontFamily ?? "Georgia"),
            fontSize: Number.isFinite(fontSize) ? fontSize : 40,
            color: String(toolCall.args.color ?? "#f5f5f5"),
            textAlign: "left",
          };

          await useCanvasStore.getState().upsertElement(documentId, textElement);
          useCanvasStore.getState().setSelectedElementIds([textElement.id]);
          await navigate({
            to: "/canvas/$documentId",
            params: { documentId },
          });
          return toolSuccess(toolCall, {
            documentId,
            elementId: textElement.id,
          });
        }

        if (toolCall.toolName === "exportCanvas") {
          const stage = getRegisteredCanvasStage();
          if (!stage) {
            return toolFailure(toolCall, "Canvas stage is not ready for export.");
          }
          const format = String(toolCall.args.format ?? "png").toLowerCase();
          const width = Number(toolCall.args.width ?? stage.width());
          const height = Number(toolCall.args.height ?? stage.height());
          const quality = Math.min(1, Math.max(0.1, Number(toolCall.args.quality ?? 0.92)));
          const pixelRatio = Number(toolCall.args.pixelRatio ?? 2);
          const mimeType = format === "jpeg" || format === "jpg" ? "image/jpeg" : "image/png";
          const dataUrl = stage.toDataURL({
            mimeType,
            quality,
            pixelRatio: Number.isFinite(pixelRatio) ? pixelRatio : 2,
            width: Number.isFinite(width) ? width : stage.width(),
            height: Number.isFinite(height) ? height : stage.height(),
          });

          if (toolCall.args.download !== false) {
            const link = document.createElement("a");
            link.href = dataUrl;
            link.download = `filmlab-canvas.${mimeType === "image/jpeg" ? "jpg" : "png"}`;
            link.click();
          }

          return toolSuccess(toolCall, {
            format: mimeType,
            width: Number.isFinite(width) ? width : stage.width(),
            height: Number.isFinite(height) ? height : stage.height(),
          });
        }

        if (toolCall.toolName === "describeAssets") {
          const targetIds = asStringArray(toolCall.args.assetIds);
          const selectedIds = useAssetStore.getState().selectedAssetIds;
          const finalAssetIds = targetIds.length > 0 ? targetIds : selectedIds;
          const assets = useAssetStore.getState().assets;
          const described =
            finalAssetIds.length > 0
              ? assets.filter((asset) => finalAssetIds.includes(asset.id))
              : assets.slice(0, 12);
          return toolSuccess(toolCall, {
            count: described.length,
            assets: described.map(buildAssetSummary),
          });
        }

        return toolFailure(toolCall, `Unsupported tool: ${toolCall.toolName}`);
      } catch (error) {
        return toolFailure(
          toolCall,
          error instanceof Error ? error.message : "Tool dispatch failed."
        );
      }
    },
    [navigate]
  );

  return { dispatchTool };
}
