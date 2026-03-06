import { describe, expect, it } from "vitest";
import {
  MAX_SYNC_ATTEMPTS,
  createSyncJob,
  isSyncJobReady,
  withSyncJobFailure,
} from "./project/sync";

describe("project sync queue helpers", () => {
  it("uses deterministic job id for same asset and operation", () => {
    const a = createSyncJob({ localAssetId: "asset-0", op: "upload" });
    const b = createSyncJob({ localAssetId: "asset-0", op: "upload" });
    const c = createSyncJob({ localAssetId: "asset-0", op: "delete" });
    expect(a.jobId).toBe(b.jobId);
    expect(a.jobId).not.toBe(c.jobId);
  });

  it("creates retryable upload job", () => {
    const job = createSyncJob({ localAssetId: "asset-1", op: "upload" });
    expect(job.localAssetId).toBe("asset-1");
    expect(job.op).toBe("upload");
    expect(job.attempts).toBe(0);
    expect(isSyncJobReady(job, Date.now() + 1)).toBe(true);
  });

  it("updates retry metadata on failure", () => {
    const first = createSyncJob({ localAssetId: "asset-2", op: "upload" });
    const failed = withSyncJobFailure(first, "network");
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toBe("network");
    expect(Date.parse(failed.nextRetryAt)).toBeGreaterThan(Date.now());
    expect(Date.parse(failed.nextRetryAt) - Date.now()).toBeGreaterThanOrEqual(3_000);
    expect(Date.parse(failed.nextRetryAt) - Date.now()).toBeLessThanOrEqual(8_000);
  });

  it("caps retry window at max configured attempts", () => {
    let job = createSyncJob({ localAssetId: "asset-3", op: "delete" });
    for (let index = 0; index < MAX_SYNC_ATTEMPTS + 4; index += 1) {
      job = withSyncJobFailure(job, "failed");
    }
    expect(job.attempts).toBeGreaterThan(MAX_SYNC_ATTEMPTS);
    expect(job.lastError).toBe("failed");
  });
});
