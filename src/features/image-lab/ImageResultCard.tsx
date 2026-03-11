import {
  ArrowUpFromLine,
  Download,
  Ellipsis,
  Expand,
  Loader2,
  Shuffle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  onVary?: () => void;
  onFullscreen?: () => void;
  isUpscaling?: boolean;
  upscaleError?: string | null;
}

export function ImageResultCard({
  imageUrl,
  compact = false,
  onDownload,
  onUpscale,
  onVary,
  onFullscreen,
  isUpscaling = false,
  upscaleError = null,
}: ImageResultCardProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHasImageError(false);
  }, [imageUrl]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const iconSm = "h-3.5 w-3.5";

  return (
    <article
      className={cn(
        "group/card overflow-hidden rounded-xl bg-[#0c0e13] transition duration-300",
        compact ? "h-[227.5px] w-[227.5px]" : "h-[227.5px] w-[227.5px]"
      )}
    >
      <div className="relative h-full w-full">
        {hasImageError ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),rgba(10,12,18,0.98)_62%)] px-4 text-center">
            <span className="rounded-full border border-amber-300/20 bg-amber-500/12 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-amber-100">
              Image expired
            </span>
            <p className="max-w-[18rem] text-[11px] text-zinc-200">
              This cached preview is no longer available. Retry to generate a fresh result.
            </p>
          </div>
        ) : (
          <img
            src={imageUrl}
            alt="AI generated"
            className="h-full w-full object-cover transition duration-500 group-hover/card:scale-[1.02]"
            onError={() => {
              setHasImageError(true);
            }}
          />
        )}

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_50%,rgba(4,5,8,0.7))]" />

        {/* Top-right "more" button */}
        <div className="absolute right-2 top-2" ref={menuRef}>
          <button
            type="button"
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition",
              menuOpen
                ? "bg-black/50 backdrop-blur"
                : "opacity-0 hover:bg-black/50 hover:backdrop-blur group-hover/card:opacity-100"
            )}
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="More actions"
            title="More actions"
          >
            <Ellipsis className="h-4 w-4" />
          </button>

          {/* Dropdown panel — same actions as bottom bar + fullscreen */}
          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1.5 w-40 overflow-hidden rounded-xl border border-white/10 bg-[#141619]/95 py-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl">
              {onFullscreen && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] text-zinc-200 transition hover:bg-white/[0.06]"
                  onClick={() => {
                    setMenuOpen(false);
                    onFullscreen();
                  }}
                >
                  <Expand className={iconSm} />
                  Fullscreen
                </button>
              )}
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] text-zinc-200 transition hover:bg-white/[0.06] disabled:text-zinc-500"
                onClick={() => {
                  setMenuOpen(false);
                  onUpscale?.();
                }}
                disabled={!onUpscale || isUpscaling}
              >
                {isUpscaling ? (
                  <Loader2 className={cn("animate-spin", iconSm)} />
                ) : (
                  <ArrowUpFromLine className={iconSm} />
                )}
                {isUpscaling ? "Upscaling..." : "Upscale"}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] text-zinc-200 transition hover:bg-white/[0.06] disabled:text-zinc-500"
                onClick={() => {
                  setMenuOpen(false);
                  onVary?.();
                }}
                disabled={!onVary}
              >
                <Shuffle className={iconSm} />
                Vary
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] text-zinc-200 transition hover:bg-white/[0.06] disabled:text-zinc-500"
                onClick={() => {
                  setMenuOpen(false);
                  onDownload?.();
                }}
                disabled={!onDownload}
              >
                <Download className={iconSm} />
                Download
              </button>
            </div>
          )}
        </div>

        {/* Hover ghost action bar — bottom center, only on card hover */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-2.5 opacity-0 transition-opacity duration-200 group-hover/card:pointer-events-auto group-hover/card:opacity-100">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-medium text-white/80 transition hover:bg-white/10 hover:text-white disabled:text-white/40"
              onClick={onUpscale}
              disabled={!onUpscale || isUpscaling}
            >
              {isUpscaling ? (
                <Loader2 className={cn("animate-spin", iconSm)} />
              ) : (
                <ArrowUpFromLine className={iconSm} />
              )}
              {isUpscaling ? "Upscaling" : "Upscale"}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-medium text-white/80 transition hover:bg-white/10 hover:text-white disabled:text-white/40"
              onClick={onVary}
              disabled={!onVary}
            >
              <Shuffle className={iconSm} />
              Vary
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-medium text-white/80 transition hover:bg-white/10 hover:text-white disabled:text-white/40"
              onClick={onDownload}
              disabled={!onDownload}
            >
              <Download className={iconSm} />
              Download
            </button>
          </div>
        </div>

        {/* Upscale error — always visible when present */}
        {upscaleError && (
          <div className="absolute inset-x-3 bottom-3 rounded-xl bg-rose-500/10 px-3 py-2 text-[11px] text-rose-100 backdrop-blur">
            {upscaleError}
          </div>
        )}
      </div>
    </article>
  );
}
