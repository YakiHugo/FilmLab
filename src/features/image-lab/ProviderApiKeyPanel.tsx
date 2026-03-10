import { useEffect } from "react";
import { KeyRound } from "lucide-react";
import {
  getImageProviderCredentialSlot,
  type ImageProviderCredentialSlotId,
} from "@/lib/ai/imageProviders";
import type { ImageProviderId } from "@/types/imageGeneration";

interface ProviderApiKeyPanelProps {
  providers: Array<{
    id: ImageProviderId;
    name: string;
  }>;
  currentProvider: ImageProviderId;
}

const LEGACY_IMAGE_PROVIDER_STORAGE_KEY = "filmlab-image-provider-keys";

const SLOT_LABELS: Record<ImageProviderCredentialSlotId, string> = {
  ark: "Ark",
  dashscope: "DashScope",
  kling: "Kling",
};

export function ProviderApiKeyPanel({
  providers,
  currentProvider,
}: ProviderApiKeyPanelProps) {
  const currentSlot = getImageProviderCredentialSlot(currentProvider);
  const slots = Object.values(
    providers.reduce<
      Partial<
        Record<
          ImageProviderCredentialSlotId,
          {
            id: ImageProviderCredentialSlotId;
            title: string;
            providerNames: string[];
          }
        >
      >
    >((accumulator, provider) => {
      const slot = getImageProviderCredentialSlot(provider.id);
      if (!slot) {
        return accumulator;
      }

      const existing = accumulator[slot];
      if (existing) {
        existing.providerNames.push(provider.name);
        return accumulator;
      }

      accumulator[slot] = {
        id: slot,
        title: SLOT_LABELS[slot],
        providerNames: [provider.name],
      };
      return accumulator;
    }, {})
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(LEGACY_IMAGE_PROVIDER_STORAGE_KEY);
  }, []);

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
        Local BYOK overrides are no longer used. Any previously stored browser keys have been
        cleared from this session.
      </div>

      <div className="mt-3 space-y-2">
        {slots.map((slot) => {
          if (!slot) {
            return null;
          }

          const isCurrentProvider = slot.id === currentSlot;

          return (
            <div
              key={slot.id}
              className={[
                "rounded-xl border px-2.5 py-2",
                isCurrentProvider
                  ? "border-amber-300/35 bg-amber-300/8"
                  : "border-white/10 bg-black/25",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-zinc-100">{slot.title}</p>
                  <p className="text-[11px] text-zinc-500">{slot.providerNames.join(" / ")}</p>
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
