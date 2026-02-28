import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ImageGenerationCardProps {
  prompt: string;
  provider: "openai" | "stability";
  model: string;
  size: string;
  status: "idle" | "loading" | "done" | "error";
  imageUrl: string | null;
  error: string | null;
  onPromptChange: (value: string) => void;
  onProviderChange: (provider: "openai" | "stability") => void;
  onModelChange: (model: string) => void;
  onSizeChange: (size: string) => void;
  onGenerate: () => void;
  onAddToCanvas: () => void;
}

const OPENAI_MODELS = ["gpt-image-1", "dall-e-3"];
const STABILITY_MODELS = ["stable-image-core", "stable-image-ultra"];

export function ImageGenerationCard({
  prompt,
  provider,
  model,
  size,
  status,
  imageUrl,
  error,
  onPromptChange,
  onProviderChange,
  onModelChange,
  onSizeChange,
  onGenerate,
  onAddToCanvas,
}: ImageGenerationCardProps) {
  const modelOptions = provider === "openai" ? OPENAI_MODELS : STABILITY_MODELS;

  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-zinc-300">
      <div className="flex items-center gap-2 text-zinc-100">
        <Sparkles className="h-4 w-4 text-sky-300" />
        <p className="font-medium">Image Generation</p>
      </div>

      <div className="mt-3 space-y-2">
        <Input
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="Describe the image..."
          className="h-9 rounded-xl border-white/10 bg-black/35 text-xs"
        />

        <div className="grid grid-cols-2 gap-2">
          <Select value={provider} onValueChange={(value) => onProviderChange(value as "openai" | "stability")}>
            <SelectTrigger className="h-9 rounded-xl text-xs">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="stability">Stability</SelectItem>
            </SelectContent>
          </Select>

          <Select value={model} onValueChange={onModelChange}>
            <SelectTrigger className="h-9 rounded-xl text-xs">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Select value={size} onValueChange={onSizeChange}>
          <SelectTrigger className="h-9 rounded-xl text-xs">
            <SelectValue placeholder="Size" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1024x1024">1024 x 1024</SelectItem>
            <SelectItem value="1024x1536">1024 x 1536</SelectItem>
            <SelectItem value="1536x1024">1536 x 1024</SelectItem>
          </SelectContent>
        </Select>

        <Button
          type="button"
          className="h-9 w-full rounded-xl bg-sky-400 text-black hover:bg-sky-300"
          disabled={status === "loading"}
          onClick={onGenerate}
        >
          {status === "loading" ? "Generating..." : "Generate"}
        </Button>
      </div>

      <p className="mt-2 text-zinc-500">Status: {status}</p>
      {error && <p className="mt-1 text-rose-300">{error}</p>}
      {imageUrl && (
        <div className="mt-2 space-y-2">
          <img src={imageUrl} alt="AI generated" className="w-full rounded-lg border border-white/10" />
          <Button
            type="button"
            variant="secondary"
            className="h-9 w-full rounded-xl border border-white/10 bg-black/45"
            onClick={onAddToCanvas}
          >
            Add to Canvas
          </Button>
        </div>
      )}
    </div>
  );
}
