import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ImageProviderId } from "@/types/imageGeneration";

type ProviderApiKeys = Partial<Record<ImageProviderId, string>>;

interface ApiKeyStoreState {
  keys: ProviderApiKeys;
  setKey: (provider: ImageProviderId, key: string) => void;
  clearKey: (provider: ImageProviderId) => void;
}

const STORAGE_KEY = "filmlab-image-provider-keys";

const sanitizeKeys = (keys: ProviderApiKeys): ProviderApiKeys =>
  Object.entries(keys).reduce<ProviderApiKeys>((accumulator, [provider, key]) => {
    if (typeof key !== "string") {
      return accumulator;
    }

    const normalized = key.trim();
    if (!normalized) {
      return accumulator;
    }

    accumulator[provider as ImageProviderId] = normalized;
    return accumulator;
  }, {});

export const useApiKeyStore = create<ApiKeyStoreState>()(
  persist(
    (set) => ({
      keys: {},
      setKey: (provider, key) =>
        set((state) => ({
          keys: sanitizeKeys({
            ...state.keys,
            [provider]: key,
          }),
        })),
      clearKey: (provider) =>
        set((state) => {
          const nextKeys = { ...state.keys };
          delete nextKeys[provider];
          return { keys: nextKeys };
        }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        keys: state.keys,
      }),
    }
  )
);

export const getProviderApiKey = (provider: ImageProviderId) =>
  useApiKeyStore.getState().keys[provider]?.trim() ?? "";
