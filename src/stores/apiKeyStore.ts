import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  getImageProviderCredentialSlot,
  type ImageProviderCredentialSlotId,
} from "@/lib/ai/imageProviders";
import type { ImageProviderId } from "@/types/imageGeneration";

type CredentialSlotApiKeys = Partial<Record<ImageProviderCredentialSlotId, string>>;
type LegacyProviderApiKeys = Partial<Record<string, string>>;

interface ApiKeyStoreState {
  keys: CredentialSlotApiKeys;
  setKey: (slot: ImageProviderCredentialSlotId, key: string) => void;
  clearKey: (slot: ImageProviderCredentialSlotId) => void;
}

const STORAGE_KEY = "filmlab-image-provider-keys";

const sanitizeKeys = (keys: CredentialSlotApiKeys): CredentialSlotApiKeys =>
  Object.entries(keys).reduce<CredentialSlotApiKeys>((accumulator, [slot, key]) => {
    if (typeof key !== "string") {
      return accumulator;
    }

    const normalized = key.trim();
    if (!normalized) {
      return accumulator;
    }

    accumulator[slot as ImageProviderCredentialSlotId] = normalized;
    return accumulator;
  }, {});

const migrateLegacyKeys = (keys: LegacyProviderApiKeys): CredentialSlotApiKeys => {
  const next: CredentialSlotApiKeys = {};

  for (const [providerId, value] of Object.entries(keys)) {
    if (typeof value !== "string") {
      continue;
    }

    const slot = getImageProviderCredentialSlot(providerId);
    if (!slot || next[slot]) {
      continue;
    }

    next[slot] = value;
  }

  return sanitizeKeys(next);
};

export const useApiKeyStore = create<ApiKeyStoreState>()(
  persist(
    (set) => ({
      keys: {},
      setKey: (slot, key) =>
        set((state) => ({
          keys: sanitizeKeys({
            ...state.keys,
            [slot]: key,
          }),
        })),
      clearKey: (slot) =>
        set((state) => {
          const nextKeys = { ...state.keys };
          delete nextKeys[slot];
          return { keys: nextKeys };
        }),
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState, version) => {
        if (!persistedState || typeof persistedState !== "object") {
          return { keys: {} };
        }

        const state = persistedState as { keys?: LegacyProviderApiKeys | CredentialSlotApiKeys };
        const rawKeys = state.keys ?? {};

        if (version < 2) {
          return {
            keys: migrateLegacyKeys(rawKeys as LegacyProviderApiKeys),
          };
        }

        return {
          keys: sanitizeKeys(rawKeys as CredentialSlotApiKeys),
        };
      },
      partialize: (state) => ({
        keys: state.keys,
      }),
    }
  )
);

export const getProviderApiKey = (provider: ImageProviderId) =>
  useApiKeyStore.getState().keys[getImageProviderCredentialSlot(provider) ?? "ark"]?.trim() ?? "";
