import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { emit } from "@/lib/storeEvents";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { useEditorStore } from "@/stores/editorStore";
import type { ChatToolResult } from "../types";

interface ToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

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
          const matchedIds = assets
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
            .slice(0, Number.isFinite(limit) ? limit : 12)
            .map((asset) => asset.id);
          useAssetStore.getState().setSelectedAssetIds(matchedIds);
          return {
            toolName: toolCall.toolName,
            ok: true,
            args: {
              ...toolCall.args,
              matchedCount: matchedIds.length,
              matchedAssetIds: matchedIds,
            },
          };
        }

        if (toolCall.toolName === "openInEditor") {
          const assetId = String(toolCall.args.assetId ?? "").trim();
          if (!assetId) {
            return {
              toolName: toolCall.toolName,
              ok: false,
              args: toolCall.args,
              error: "Missing assetId.",
            };
          }
          const assetExists = useAssetStore.getState().assets.some((asset) => asset.id === assetId);
          if (!assetExists) {
            return {
              toolName: toolCall.toolName,
              ok: false,
              args: toolCall.args,
              error: "Asset not found.",
            };
          }
          useEditorStore.getState().setSelectedAssetId(assetId);
          await navigate({
            to: "/editor",
            search: { assetId },
          });
          return {
            toolName: toolCall.toolName,
            ok: true,
            args: toolCall.args,
          };
        }

        if (toolCall.toolName === "createCanvas") {
          const name = String(toolCall.args.name ?? "Untitled board");
          const document = await useCanvasStore.getState().createDocument(name);
          await navigate({
            to: "/canvas/$documentId",
            params: { documentId: document.id },
          });
          return {
            toolName: toolCall.toolName,
            ok: true,
            args: {
              ...toolCall.args,
              documentId: document.id,
            },
          };
        }

        if (toolCall.toolName === "generateImage") {
          return {
            toolName: toolCall.toolName,
            ok: false,
            args: toolCall.args,
            error: "Image generation dispatch is not wired in this phase.",
          };
        }

        return {
          toolName: toolCall.toolName,
          ok: false,
          args: toolCall.args,
          error: `Unsupported tool: ${toolCall.toolName}`,
        };
      } catch (error) {
        return {
          toolName: toolCall.toolName,
          ok: false,
          args: toolCall.args,
          error: error instanceof Error ? error.message : "Tool dispatch failed.",
        };
      }
    },
    [navigate]
  );

  return { dispatchTool };
}
