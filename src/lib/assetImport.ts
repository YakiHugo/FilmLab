import { useAssetStore } from "@/stores/assetStore";
import { MAX_IMPORT_FILE_SIZE, isSupportedImportFile } from "@/stores/currentUser/constants";
import type { ImportAssetOptions, ImportAssetsResult } from "@/stores/currentUser/types";
import type { Asset } from "@/types";

type AssetFingerprintLike = Pick<Asset, "id" | "name" | "size">;
type FileFingerprintLike = Pick<File, "name" | "size">;

export interface ImportAssetFilesResult extends ImportAssetsResult {
  resolvedAssetIds: string[];
}

export const resolveAssetImportFingerprint = (input: FileFingerprintLike | AssetFingerprintLike) =>
  `${input.name}:${input.size}`;

export const resolveImportedAssetIds = ({
  filesInput,
  assetsBefore,
  assetsAfter,
  addedAssetIds,
}: {
  filesInput: File[] | FileList;
  assetsBefore: AssetFingerprintLike[];
  assetsAfter: AssetFingerprintLike[];
  addedAssetIds: string[];
}) => {
  const files = Array.isArray(filesInput) ? filesInput : Array.from(filesInput);
  const seenFingerprints = new Set<string>();
  const existingAssetIdByFingerprint = new Map(
    assetsBefore.map((asset) => [resolveAssetImportFingerprint(asset), asset.id])
  );
  const addedAssetIdSet = new Set(addedAssetIds);
  const importedAssetIdByFingerprint = new Map(
    assetsAfter
      .filter((asset) => addedAssetIdSet.has(asset.id))
      .map((asset) => [resolveAssetImportFingerprint(asset), asset.id])
  );

  return files.reduce<string[]>((resolvedAssetIds, file) => {
    if (!isSupportedImportFile(file) || file.size > MAX_IMPORT_FILE_SIZE) {
      return resolvedAssetIds;
    }

    const fingerprint = resolveAssetImportFingerprint(file);
    if (seenFingerprints.has(fingerprint)) {
      return resolvedAssetIds;
    }
    seenFingerprints.add(fingerprint);

    const matchedAssetId =
      importedAssetIdByFingerprint.get(fingerprint) ?? existingAssetIdByFingerprint.get(fingerprint);
    if (matchedAssetId) {
      resolvedAssetIds.push(matchedAssetId);
    }
    return resolvedAssetIds;
  }, []);
};

export const importAssetFiles = async (
  filesInput: File[] | FileList,
  options?: ImportAssetOptions
): Promise<ImportAssetFilesResult> => {
  const files = Array.isArray(filesInput) ? filesInput : Array.from(filesInput);
  const assetsBefore = useAssetStore.getState().assets;
  const result = await useAssetStore.getState().importAssets(files, options);
  const assetsAfter = useAssetStore.getState().assets;

  return {
    ...result,
    resolvedAssetIds: resolveImportedAssetIds({
      filesInput: files,
      assetsBefore,
      assetsAfter,
      addedAssetIds: result.addedAssetIds,
    }),
  };
};
