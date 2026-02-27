interface ImageGenerationCardProps {
  imageUrl?: string | null;
  status: "idle" | "loading" | "done" | "error";
  error?: string | null;
}

export function ImageGenerationCard({ imageUrl, status, error }: ImageGenerationCardProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-zinc-300">
      <p className="font-medium text-zinc-100">Image Generation</p>
      <p className="mt-1 text-zinc-500">Status: {status}</p>
      {error && <p className="mt-1 text-rose-300">{error}</p>}
      {imageUrl && (
        <img src={imageUrl} alt="AI generated" className="mt-2 w-full rounded-lg border border-white/10" />
      )}
    </div>
  );
}
