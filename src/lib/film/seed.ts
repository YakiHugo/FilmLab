import type { FilmModuleConfig } from "@/types";
import { hashString } from "./utils";

export interface FilmSeedContext {
  seedKey?: string;
  seedSalt?: number;
  renderSeed?: number;
  exportSeed?: number;
}

const resolvePerAssetSeed = (moduleId: string, context: FilmSeedContext) => {
  const key = context.seedKey ?? "filmlab-default-seed";
  const salt = context.seedSalt ?? 0;
  return hashString(`${moduleId}:${key}:${salt}`) >>> 0;
};

export const resolveModuleSeed = (
  module: Pick<FilmModuleConfig, "id" | "seedMode" | "seed">,
  context: FilmSeedContext
) => {
  if (module.seedMode === "locked" && typeof module.seed === "number") {
    return module.seed >>> 0;
  }
  if (module.seedMode === "perExport") {
    return (context.exportSeed ?? context.renderSeed ?? 1337) >>> 0;
  }
  if (module.seedMode === "perRender") {
    return (context.renderSeed ?? Date.now()) >>> 0;
  }
  return resolvePerAssetSeed(module.id, context);
};

