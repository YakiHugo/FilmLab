import type { RuntimeProviderId } from "../../gateway/router/types";
import { arkPlatformAdapter } from "../ark/adapter";
import type { PlatformProviderAdapter } from "./adapter";
import { dashscopePlatformAdapter } from "../dashscope/adapter";
import { klingPlatformAdapter } from "../kling/adapter";

const PLATFORM_ADAPTERS: Record<RuntimeProviderId, PlatformProviderAdapter> = {
  ark: arkPlatformAdapter,
  dashscope: dashscopePlatformAdapter,
  kling: klingPlatformAdapter,
};

export const getPlatformProviderAdapter = (providerId: RuntimeProviderId) =>
  PLATFORM_ADAPTERS[providerId];
