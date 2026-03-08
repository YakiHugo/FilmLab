import { KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ImageProviderId } from "@/types/imageGeneration";
import { useApiKeyStore } from "@/stores/apiKeyStore";

interface ProviderApiKeyPanelProps {
  providers: Array<{
    id: ImageProviderId;
    name: string;
  }>;
  currentProvider: ImageProviderId;
}

const getPlaceholder = (providerId: ImageProviderId, providerName: string) => {
  if (providerId === "seedream") {
    return "Enter Ark API Key or leave blank for server fallback (ARK_API_KEY)";
  }

  return `Use a ${providerName} key or leave blank for server fallback`;
};

export function ProviderApiKeyPanel({
  providers,
  currentProvider,
}: ProviderApiKeyPanelProps) {
  const keys = useApiKeyStore((state) => state.keys);
  const setKey = useApiKeyStore((state) => state.setKey);
  const clearKey = useApiKeyStore((state) => state.clearKey);

  return (
    <section className="rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-300/20 bg-amber-300/10 text-amber-100">
          <KeyRound className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-200">
            API Keys
          </p>
          <p className="text-[11px] text-zinc-500">
            Stored locally. User keys override server keys when present.
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {providers.map((provider) => {
          const isCurrentProvider = provider.id === currentProvider;
          const value = keys[provider.id] ?? "";

          return (
            <div
              key={provider.id}
              className={[
                "rounded-xl border px-2.5 py-2",
                isCurrentProvider
                  ? "border-amber-300/35 bg-amber-300/8"
                  : "border-white/10 bg-black/25",
              ].join(" ")}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-zinc-100">{provider.name}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-zinc-400 hover:text-zinc-100"
                  onClick={() => clearKey(provider.id)}
                  disabled={!keys[provider.id]}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Clear
                </Button>
              </div>

              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={value}
                placeholder={getPlaceholder(provider.id, provider.name)}
                className="h-8 border-white/10 bg-black/35 text-xs"
                onChange={(event) => setKey(provider.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") {
                    return;
                  }
                  event.preventDefault();
                  setKey(provider.id, value);
                  event.currentTarget.blur();
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
