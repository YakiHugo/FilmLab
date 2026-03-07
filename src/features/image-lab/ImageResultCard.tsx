import { Check, Layers } from "lucide-react";
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
  onAddToCanvas: (assetId: string | null) => void;
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
}: ImageResultCardProps) {
  return (
    <article
      className={cn(
        "group overflow-hidden border border-white/8 bg-[#0c0e13] shadow-[0_16px_34px_rgba(0,0,0,0.26)] transition duration-300 hover:border-white/14",
        compact ? "rounded-[22px]" : "rounded-[26px]"
      )}
    >
      <div className="relative">
        <img
          src={imageUrl}
          alt="AI generated"
          className={cn(
            "w-full object-cover transition duration-500 group-hover:scale-[1.02]",
            compact ? "aspect-square" : "aspect-[4/5]"
          )}
        />

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

      <div className={cn("grid grid-cols-2 gap-2 border-t border-white/6 bg-[#090b10]/94 p-2.5", compact && "gap-1.5 p-2")}>
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
          <Check className={cn("mr-1.5", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
          {compact ? "Save" : selected ? "Selected" : "Save"}
        </button>

        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center rounded-full border font-medium transition",
            compact ? "h-8 text-[11px]" : "h-9 text-xs",
            assetId
              ? "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/16 hover:bg-white/[0.08]"
              : "cursor-not-allowed border-white/8 bg-white/[0.02] text-zinc-500"
          )}
          onClick={() => onAddToCanvas(assetId)}
          disabled={!assetId}
        >
          <Layers className={cn("mr-1.5", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
          {compact ? "Canvas" : "Canvas"}
        </button>
      </div>
    </article>
  );
}
