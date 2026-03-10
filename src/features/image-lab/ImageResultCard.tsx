import { ArrowUpFromLine, Check, Download, Layers, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ImageResultCardProps {
  imageUrl: string;
  provider: string;
  model: string;
  assetId: string | null;
  saved: boolean;
  selected: boolean;
  compact?: boolean;
  onToggleSelection: () => void;
  onAddToCanvas: () => void;
  onDownload?: () => void;
  onUpscale?: () => void;
  isUpscaling?: boolean;
  upscaleError?: string | null;
}

export function ImageResultCard({
  imageUrl,
  provider,
  model,
  assetId,
  saved,
  selected,
  compact = false,
  onToggleSelection,
  onAddToCanvas,
  onDownload,
  onUpscale,
  isUpscaling = false,
  upscaleError = null,
}: ImageResultCardProps) {
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [imageUrl]);

  return (
    <article
      className={cn(
        "group overflow-hidden border border-white/8 bg-[#0c0e13] shadow-[0_16px_34px_rgba(0,0,0,0.26)] transition duration-300 hover:border-white/14",
        compact ? "rounded-[22px]" : "rounded-[26px]"
      )}
    >
      <div className="relative">
        {hasImageError ? (
          <div
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),rgba(10,12,18,0.98)_62%)] px-4 text-center",
              compact ? "aspect-square" : "aspect-[4/5]"
            )}
          >
            <span className="rounded-full border border-amber-300/20 bg-amber-500/12 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-amber-100">
              Image expired
            </span>
            <p className={cn("max-w-[18rem] text-zinc-200", compact ? "text-[11px]" : "text-sm")}>
              This cached preview is no longer available. Retry to generate a fresh result.
            </p>
          </div>
        ) : (
          <img
            src={imageUrl}
            alt="AI generated"
            className={cn(
              "w-full object-cover transition duration-500 group-hover:scale-[1.02]",
              compact ? "aspect-square" : "aspect-[4/5]"
            )}
            onError={() => {
              setHasImageError(true);
            }}
          />
        )}

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(4,5,8,0.04),rgba(4,5,8,0.02)_34%,rgba(4,5,8,0.84))]" />

        <div className="absolute inset-x-3 top-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[10px] font-medium text-zinc-100 backdrop-blur">
            {provider}
          </span>
          {!compact ? (
            <span className="rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[10px] font-medium text-zinc-300 backdrop-blur">
              {model}
            </span>
          ) : null}
          {saved ? (
            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/18 px-2 py-1 text-[10px] font-medium text-emerald-100 backdrop-blur">
              Saved
            </span>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "space-y-2 border-t border-white/6 bg-[#090b10]/94 p-2.5",
          compact && "space-y-1.5 p-2"
        )}
      >
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={cn(
              "inline-flex items-center justify-center rounded-full border font-medium transition",
              compact ? "h-8 text-[11px]" : "h-9 text-xs",
              saved
                ? "cursor-not-allowed border-white/8 bg-white/[0.02] text-zinc-500"
                : selected
                  ? "border-white/16 bg-white/[0.1] text-zinc-100 hover:bg-white/[0.14]"
                  : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/16 hover:bg-white/[0.08]"
            )}
            onClick={onToggleSelection}
            disabled={saved}
          >
            <Check className={cn(compact ? "h-3.5 w-3.5" : "mr-1.5 h-4 w-4")} />
            {compact ? <span className="sr-only">Save</span> : selected ? "Selected" : "Save"}
          </button>

          <button
            type="button"
            className={cn(
              "inline-flex items-center justify-center rounded-full border font-medium transition",
              compact ? "h-8 text-[11px]" : "h-9 text-xs",
              isUpscaling
                ? "cursor-not-allowed border-white/8 bg-white/[0.02] text-zinc-500"
                : "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/16 hover:bg-white/[0.08]"
            )}
            onClick={onAddToCanvas}
            disabled={isUpscaling}
          >
            <Layers className={cn(compact ? "h-3.5 w-3.5" : "mr-1.5 h-4 w-4")} />
            {compact ? (
              <span className="sr-only">Add to canvas</span>
            ) : assetId ? (
              "Canvas"
            ) : (
              "Save + Canvas"
            )}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={cn(
              "inline-flex items-center justify-center rounded-full border font-medium transition",
              compact ? "h-8 text-[11px]" : "h-9 text-xs",
              "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/16 hover:bg-white/[0.08]"
            )}
            onClick={onDownload}
            disabled={!onDownload}
            aria-label="Download image"
            title="Download image"
          >
            <Download className={cn(compact ? "h-3.5 w-3.5" : "mr-1.5 h-4 w-4")} />
            {compact ? <span className="sr-only">Download</span> : "Download"}
          </button>

          <button
            type="button"
            className={cn(
              "inline-flex items-center justify-center rounded-full border font-medium transition",
              compact ? "h-8 text-[11px]" : "h-9 text-xs",
              onUpscale && !isUpscaling
                ? "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/16 hover:bg-white/[0.08]"
                : "cursor-not-allowed border-white/8 bg-white/[0.02] text-zinc-500"
            )}
            onClick={onUpscale}
            disabled={!onUpscale || isUpscaling}
            aria-label="Upscale image"
            title={
              isUpscaling
                ? "Upscaling image"
                : onUpscale
                  ? "Upscale image"
                  : "Upscale is not available for this result"
            }
          >
            {isUpscaling ? (
              <Loader2 className={cn("animate-spin", compact ? "h-3.5 w-3.5" : "mr-1.5 h-4 w-4")} />
            ) : (
              <ArrowUpFromLine className={cn(compact ? "h-3.5 w-3.5" : "mr-1.5 h-4 w-4")} />
            )}
            {compact ? (
              <span className="sr-only">Upscale</span>
            ) : isUpscaling ? (
              "Upscaling"
            ) : (
              "Upscale"
            )}
          </button>
        </div>

        {upscaleError ? (
          <div
            className={cn(
              "rounded-2xl border border-rose-400/14 bg-rose-500/10 px-3 py-2 text-rose-100",
              compact ? "text-[10px]" : "text-[11px]"
            )}
          >
            {upscaleError}
          </div>
        ) : null}
      </div>
    </article>
  );
}
