import { KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getImageProviderCredentialSlot,
  type ImageProviderCredentialSlotId,
} from "@/lib/ai/imageProviders";
import { useApiKeyStore } from "@/stores/apiKeyStore";
import type { ImageProviderId } from "@/types/imageGeneration";

interface ProviderApiKeyPanelProps {
  providers: Array<{
    id: ImageProviderId;
    name: string;
  }>;
  currentProvider: ImageProviderId;
}

const SLOT_LABELS: Record<ImageProviderCredentialSlotId, string> = {
  ark: "Ark",
  dashscope: "DashScope",
  kling: "Kling",
};

const SLOT_PLACEHOLDERS: Record<ImageProviderCredentialSlotId, string> = {
  ark: "Enter Ark API Key or leave blank for server fallback (ARK_API_KEY)",
  dashscope:
    "Enter DashScope API Key or leave blank for server fallback (DASHSCOPE_API_KEY)",
  kling: "Enter Kling API Key or leave blank for server fallback (KLING_API_KEY)",
};

export function ProviderApiKeyPanel({
  providers,
  currentProvider,
}: ProviderApiKeyPanelProps) {
  const keys = useApiKeyStore((state) => state.keys);
  const setKey = useApiKeyStore((state) => state.setKey);
  const clearKey = useApiKeyStore((state) => state.clearKey);
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
        {slots.map((slot) => {
          if (!slot) {
            return null;
          }

          const isCurrentProvider = slot.id === currentSlot;
          const value = keys[slot.id] ?? "";

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
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-zinc-100">{slot.title}</p>
                  <p className="text-[11px] text-zinc-500">
                    {slot.providerNames.join(" / ")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-zinc-400 hover:text-zinc-100"
                  onClick={() => clearKey(slot.id)}
                  disabled={!keys[slot.id]}
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
                placeholder={SLOT_PLACEHOLDERS[slot.id]}
                className="h-8 border-white/10 bg-black/35 text-xs"
                onChange={(event) => setKey(slot.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") {
                    return;
                  }
                  event.preventDefault();
                  setKey(slot.id, value);
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
