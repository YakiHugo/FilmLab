import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { useAssetStore } from "@/stores/assetStore";
import type { ChatToolResult } from "./types";

interface ChatToolResultCardProps {
  result: ChatToolResult;
}

const asString = (value: unknown) => (typeof value === "string" ? value : "");
const asStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export function ChatToolResultCard({ result }: ChatToolResultCardProps) {
  const assets = useAssetStore((state) => state.assets);

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const matchedAssetIds = asStringArray(result.data?.matchedAssetIds ?? result.data?.importedAssetIds);
  const matchedAssets = matchedAssetIds.map((id) => assetById.get(id)).filter(Boolean);
  const cardTone = result.success
    ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
    : "border-rose-300/25 bg-rose-300/10 text-rose-100";
  const hasCustomBody =
    result.toolName === "selectAssets" ||
    result.toolName === "openInEditor" ||
    result.toolName === "createCanvas" ||
    result.toolName === "generateImage";
  const shouldShowFallback = !hasCustomBody || !result.success;

  return (
    <div className={["rounded-xl border p-3 text-xs", cardTone].join(" ")}>
      <p className="font-medium">
        Tool: {result.toolName} ({result.success ? "success" : "failed"})
      </p>
      {result.error && <p className="mt-1 text-[11px]">{result.error}</p>}

      {result.toolName === "selectAssets" && matchedAssets.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {matchedAssets.slice(0, 6).map((asset) => (
            <div key={asset?.id} className="overflow-hidden rounded-md border border-white/10 bg-black/35">
              <img src={asset?.thumbnailUrl || asset?.objectUrl} alt={asset?.name} className="aspect-square w-full object-cover" />
              <p className="truncate px-1.5 py-1 text-[10px] text-zinc-200">{asset?.name}</p>
            </div>
          ))}
        </div>
      )}

      {result.toolName === "openInEditor" && result.success && (
        <Link
          to="/editor"
          search={{ assetId: asString(result.data?.assetId) }}
          className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-100 underline underline-offset-2"
        >
          Open editor <ExternalLink className="h-3 w-3" />
        </Link>
      )}

      {result.toolName === "createCanvas" && result.success && (
        <Link
          to="/canvas/$documentId"
          params={{ documentId: asString(result.data?.documentId) }}
          className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-100 underline underline-offset-2"
        >
          Open canvas <ExternalLink className="h-3 w-3" />
        </Link>
      )}

      {result.toolName === "generateImage" && result.success && asString(result.data?.imageUrl) && (
        <img
          src={asString(result.data?.imageUrl)}
          alt="Generated from tool"
          className="mt-2 w-full rounded-lg border border-white/10"
        />
      )}

      {shouldShowFallback && (
        <pre className="mt-2 overflow-x-auto rounded-lg bg-black/35 p-2 text-[11px]">
          {JSON.stringify(result.data ?? result.args ?? {}, null, 2)}
        </pre>
      )}
    </div>
  );
}
