import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "@/types";
import { MAX_IMPORT_BATCH_SIZE, MAX_IMPORT_FILE_SIZE } from "./project/constants";

vi.mock("@/lib/assetMetadata", () => ({
  prepareAssetPayload: vi.fn(async () => ({ metadata: {}, thumbnailBlob: undefined })),
}));

vi.mock("@/lib/db", () => ({
  saveAsset: vi.fn(async () => true),
}));

import { prepareAssetPayload } from "@/lib/assetMetadata";
import { saveAsset } from "@/lib/db";
import { runImportPipeline } from "./project/importPipeline";

const createFile = (name: string, type = "image/jpeg", bytes = 3) =>
  new File([new Uint8Array(bytes)], name, { type, lastModified: Date.now() });

describe("project import pipeline", () => {
  beforeEach(() => {
    vi.mocked(prepareAssetPayload).mockClear();
    vi.mocked(saveAsset).mockClear();
  });

  it("returns empty result when no files are provided", async () => {
    const result = await runImportPipeline({ files: [], existingAssets: [] });

    expect(result.requested).toBe(0);
    expect(result.accepted).toBe(0);
    expect(result.added).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.addedAssetIds).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("filters unsupported/oversized/duplicate files and truncates over 500", async () => {
    const validFiles = Array.from({ length: MAX_IMPORT_BATCH_SIZE + 2 }, (_, index) =>
      createFile(`valid-${index}.jpg`)
    );

    const unsupported = {
      name: "bad.txt",
      type: "text/plain",
      size: 12,
      lastModified: 1,
    } as File;

    const oversized = {
      name: "big.jpg",
      type: "image/jpeg",
      size: MAX_IMPORT_FILE_SIZE + 1,
      lastModified: 1,
    } as File;

    const duplicateExisting = createFile("existing.jpg");
    const duplicateA = createFile("dup.jpg");
    const duplicateB = createFile("dup.jpg");

    const existingAssets = [
      {
        id: "existing-1",
        name: "existing.jpg",
        size: duplicateExisting.size,
      },
    ] as Asset[];

    const result = await runImportPipeline({
      files: [unsupported, oversized, duplicateExisting, duplicateA, duplicateB, ...validFiles],
      existingAssets,
    });

    expect(result.requested).toBe(MAX_IMPORT_BATCH_SIZE + 7);
    expect(result.accepted).toBe(MAX_IMPORT_BATCH_SIZE);
    expect(result.added).toBe(MAX_IMPORT_BATCH_SIZE);
    expect(result.failed).toBe(0);

    expect(result.skipped).toEqual({
      unsupported: 1,
      oversized: 1,
      duplicated: 2,
      overflow: 3,
    });
  });

  it("reports final import progress", async () => {
    const progress: Array<{ current: number; total: number }> = [];

    const result = await runImportPipeline({
      files: [createFile("a.jpg"), createFile("b.jpg"), createFile("c.jpg")],
      existingAssets: [],
      onProgress: (value) => {
        progress.push(value);
      },
    });

    expect(result.added).toBe(3);
    expect(result.failed).toBe(0);
    expect(progress.length).toBeGreaterThanOrEqual(2);
    expect(progress[0]).toEqual({ current: 0, total: 3 });
    expect(progress[progress.length - 1]).toEqual({ current: 3, total: 3 });
  });
});

