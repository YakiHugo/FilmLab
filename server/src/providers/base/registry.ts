import type { RuntimeProviderId } from "../../gateway/router/types";
import { generateArkSeedream } from "../ark/models/seedream";
import type { PlatformModelAdapter } from "./adapter";
import { generateDashscopeQwen } from "../dashscope/models/qwen";
import { generateDashscopeZImage } from "../dashscope/models/zimage";
import { generateKlingImage } from "../kling/models/image";

const createAdapterKey = (provider: RuntimeProviderId, providerModel: string) =>
  `${provider}:${providerModel}`;

const PLATFORM_MODEL_ADAPTERS: PlatformModelAdapter[] = [
  {
    provider: "ark",
    providerModel: "doubao-seedream-5-0-260128",
    transport: "http",
    generate: generateArkSeedream,
  },
  {
    provider: "ark",
    providerModel: "doubao-seedream-4-0-250828",
    transport: "http",
    generate: generateArkSeedream,
  },
  {
    provider: "dashscope",
    providerModel: "qwen-image-2.0-pro",
    transport: "http",
    generate: generateDashscopeQwen,
  },
  {
    provider: "dashscope",
    providerModel: "qwen-image-2.0",
    transport: "http",
    generate: generateDashscopeQwen,
  },
  {
    provider: "dashscope",
    providerModel: "z-image-turbo",
    transport: "http",
    generate: generateDashscopeZImage,
  },
  {
    provider: "kling",
    providerModel: "kling-v2-1",
    transport: "http",
    generate: generateKlingImage,
  },
  {
    provider: "kling",
    providerModel: "kling-v3",
    transport: "http",
    generate: generateKlingImage,
  },
];

const adaptersByKey = new Map(
  PLATFORM_MODEL_ADAPTERS.map((adapter) => [
    createAdapterKey(adapter.provider, adapter.providerModel),
    adapter,
  ])
);

export const getPlatformModelAdapters = () => [...PLATFORM_MODEL_ADAPTERS];

export const getPlatformModelAdapter = (
  provider: RuntimeProviderId,
  providerModel: string
) => adaptersByKey.get(createAdapterKey(provider, providerModel)) ?? null;
