interface DownloadableImageResult {
  imageUrl: string;
  index: number;
  mimeType?: string;
}

export interface DownloadAllSummary {
  succeeded: number;
  failed: number;
  failures: Array<{
    displayIndex: number;
    imageUrl: string;
    message: string;
  }>;
}

const DOWNLOAD_GAP_MS = 200;
const OBJECT_URL_REVOKE_DELAY_MS = 30_000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const toFileExtension = (mimeType?: string) => {
  if (mimeType?.includes("jpeg")) return "jpg";
  if (mimeType?.includes("webp")) return "webp";
  return "png";
};

const triggerBrowserDownload = (blob: Blob, filename: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, OBJECT_URL_REVOKE_DELAY_MS);
};

export const getImageDownloadFilename = (displayIndex: number, mimeType?: string) =>
  `ai-image-${displayIndex}.${toFileExtension(mimeType)}`;

export const downloadImageFromUrl = async (url: string, filename: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Generated image could not be downloaded.");
  }

  const blob = await response.blob();
  triggerBrowserDownload(blob, filename);
};

export const downloadAllResults = async (
  results: DownloadableImageResult[]
): Promise<DownloadAllSummary> => {
  let succeeded = 0;
  let failed = 0;
  const failures: DownloadAllSummary["failures"] = [];

  for (const [listIndex, result] of results.entries()) {
    try {
      await downloadImageFromUrl(
        result.imageUrl,
        getImageDownloadFilename(result.index + 1, result.mimeType)
      );
      succeeded += 1;
    } catch (error) {
      failed += 1;
      const message =
        error instanceof Error ? error.message : "Generated image could not be downloaded.";
      failures.push({
        displayIndex: result.index + 1,
        imageUrl: result.imageUrl,
        message,
      });
      console.warn("Generated image download failed.", {
        error,
        imageUrl: result.imageUrl,
      });
    }

    if (listIndex < results.length - 1) {
      await sleep(DOWNLOAD_GAP_MS);
    }
  }

  return { succeeded, failed, failures };
};
