interface DownloadableImageResult {
  imageUrl: string;
  index: number;
  mimeType?: string;
}

const DOWNLOAD_GAP_MS = 200;

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
  }, 0);
};

export const getImageDownloadFilename = (index: number, mimeType?: string) =>
  `ai-image-${index}.${toFileExtension(mimeType)}`;

export const downloadImageFromUrl = async (url: string, filename: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Generated image could not be downloaded.");
  }

  const blob = await response.blob();
  triggerBrowserDownload(blob, filename);
};

export const downloadAllResults = async (results: DownloadableImageResult[]) => {
  for (const result of results) {
    await downloadImageFromUrl(
      result.imageUrl,
      getImageDownloadFilename(result.index + 1, result.mimeType)
    );
    await sleep(DOWNLOAD_GAP_MS);
  }
};
