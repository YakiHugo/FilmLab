import { Check, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ImageResultCardProps {
  imageUrl: string;
  provider: string;
  model: string;
  assetId: string | null;
  saved: boolean;
  selected: boolean;
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
  onToggleSelection,
  onAddToCanvas,
}: ImageResultCardProps) {
  return (
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.06)]">
      <img src={imageUrl} alt="AI generated" className="aspect-square w-full object-cover" />
      <div className="space-y-2 p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge size="sm" variant="secondary">
            {provider}
          </Badge>
          <Badge size="sm" variant="outline" className="border-white/15">
            {model}
          </Badge>
          {saved ? (
            <Badge size="sm" variant="secondary" className="bg-emerald-500/15 text-emerald-700">
              Saved
            </Badge>
          ) : null}
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 w-full text-xs"
          onClick={onToggleSelection}
          disabled={saved}
        >
          <Check className="mr-1 h-3.5 w-3.5" />
          {selected ? "Selected" : "Select to Save"}
        </Button>

        <Button
          type="button"
          variant="default"
          size="sm"
          className="h-8 w-full bg-blue-600 text-xs text-white hover:bg-blue-500"
          onClick={() => onAddToCanvas(assetId)}
          disabled={!assetId}
        >
          <Layers className="mr-1 h-3.5 w-3.5" />
          Add to Canvas
        </Button>
      </div>
    </article>
  );
}
