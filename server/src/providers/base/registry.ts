import type { RuntimeProviderId } from "../../gateway/router/types";
import { arkProvider } from "../ark/provider";
import type { PlatformProviderAdapter } from "./adapter";
import { dashscopeProvider } from "../dashscope/provider";
import { klingProvider } from "../kling/provider";

const PLATFORM_ADAPTERS: Record<RuntimeProviderId, PlatformProviderAdapter> = {
  ark: arkProvider,
  dashscope: dashscopeProvider,
  kling: klingProvider,
};

export const getPlatformProviderAdapter = (providerId: RuntimeProviderId) =>
  PLATFORM_ADAPTERS[providerId];
