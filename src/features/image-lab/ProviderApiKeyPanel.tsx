import { KeyRound } from "lucide-react";
import type { ImageRuntimeProviderEntry } from "@/lib/ai/imageModelCatalog";

interface ProviderApiKeyPanelProps {
  providers: ImageRuntimeProviderEntry[];
  currentProviderId: string | null;
}

export function ProviderApiKeyPanel({
  providers,
  currentProviderId,
}: ProviderApiKeyPanelProps) {
  return (
    <section className="rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-300/20 bg-amber-300/10 text-amber-100">
          <KeyRound className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-200">
            Runtime Credentials
          </p>
          <p className="text-[11px] text-zinc-500">
            Image runtime now uses server-configured provider credentials only.
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/8 px-3 py-2 text-[11px] text-amber-100/90">
        Local BYOK overrides are no longer used. Any older browser-stored keys are ignored by the
        runtime.
      </div>

      <div className="mt-3 space-y-2">
        {providers.map((provider) => {
          const isCurrentProvider = provider.id === currentProviderId;

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
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-zinc-100">{provider.name}</p>
                  <p className="text-[11px] text-zinc-500">
                    {provider.configured ? "Configured on server" : "Missing server credential"}
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                  Server managed
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
