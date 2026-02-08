import { describe, expect, it } from "vitest";
import { resolveModuleSeed } from "./seed";

describe("resolveModuleSeed", () => {
  it("is stable for perAsset with same seed key and salt", () => {
    const module = { id: "grain" as const, seedMode: "perAsset" as const, seed: undefined };
    const first = resolveModuleSeed(module, { seedKey: "asset-1", seedSalt: 4 });
    const second = resolveModuleSeed(module, { seedKey: "asset-1", seedSalt: 4 });
    expect(first).toBe(second);
  });

  it("changes for perAsset when seed salt changes", () => {
    const module = { id: "grain" as const, seedMode: "perAsset" as const, seed: undefined };
    const first = resolveModuleSeed(module, { seedKey: "asset-1", seedSalt: 1 });
    const second = resolveModuleSeed(module, { seedKey: "asset-1", seedSalt: 2 });
    expect(first).not.toBe(second);
  });

  it("uses locked seed directly", () => {
    const module = { id: "defects" as const, seedMode: "locked" as const, seed: 12345 };
    const resolved = resolveModuleSeed(module, { seedKey: "asset-1", seedSalt: 0 });
    expect(resolved).toBe(12345);
  });
});

