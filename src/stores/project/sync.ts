import type { AssetSyncJob, AssetSyncJobOperation } from "@/types";

export const SYNC_RETRY_DELAYS_MS = [
  5_000,
  30_000,
  2 * 60_000,
  10 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  6 * 60 * 60_000,
  24 * 60 * 60_000,
] as const;

export const MAX_SYNC_ATTEMPTS = SYNC_RETRY_DELAYS_MS.length;

const createJobId = (localAssetId: string, op: AssetSyncJobOperation) => `${op}:${localAssetId}`;

export const nextRetryAtForAttempt = (attempts: number) => {
  const index = Math.max(0, Math.min(attempts - 1, SYNC_RETRY_DELAYS_MS.length - 1));
  return new Date(Date.now() + SYNC_RETRY_DELAYS_MS[index]).toISOString();
};

export const createSyncJob = (params: {
  localAssetId: string;
  op: AssetSyncJobOperation;
  remoteAssetId?: string;
  nextRetryAt?: string;
}): AssetSyncJob => {
  const now = new Date().toISOString();
  return {
    jobId: createJobId(params.localAssetId, params.op),
    localAssetId: params.localAssetId,
    op: params.op,
    attempts: 0,
    nextRetryAt: params.nextRetryAt ?? now,
    remoteAssetId: params.remoteAssetId,
    createdAt: now,
    updatedAt: now,
  };
};

export const isSyncJobReady = (job: AssetSyncJob, now = Date.now()) =>
  Date.parse(job.nextRetryAt) <= now;

export const withSyncJobFailure = (job: AssetSyncJob, errorMessage: string): AssetSyncJob => {
  const attempts = job.attempts + 1;
  return {
    ...job,
    attempts,
    lastError: errorMessage,
    nextRetryAt: nextRetryAtForAttempt(attempts),
    updatedAt: new Date().toISOString(),
  };
};
