import { getCurrentUserId } from "@/lib/authToken";
import { getCanvasWorkbenchSnapshot } from "@/features/canvas/documentGraph";
import {
  deleteCanvasWorkbenchRecord,
  loadCanvasWorkbench,
  loadCanvasWorkbenchListEntriesByUser,
  saveCanvasWorkbenchRecord,
} from "@/lib/db";
import type {
  CanvasWorkbench,
  CanvasWorkbenchListEntry,
  CanvasWorkbenchSnapshot,
} from "@/types";
import { materializeCanvasWorkbenchListEntry } from "./canvasWorkbenchListEntry";

export type StoredCanvasWorkbench = NonNullable<Awaited<ReturnType<typeof loadCanvasWorkbench>>>;
export type StoredCanvasWorkbenchListEntry = Awaited<
  ReturnType<typeof loadCanvasWorkbenchListEntriesByUser>
>[number];
export type CanvasWorkbenchPersistStatus =
  | "persisted"
  | "persist_failed"
  | "epoch_invalidated_before_persist"
  | "epoch_invalidated_after_persist";

interface CanvasWorkbenchPersistRecord {
  listEntry: CanvasWorkbenchListEntry;
  snapshot: CanvasWorkbenchSnapshot;
}

const pendingCanvasWorkbenchCleanupById = new Map<string, string>();
const pendingCanvasWorkbenchRestoreRecords = new Map<string, CanvasWorkbenchPersistRecord>();

const canQueueCompensation = (userId: string) => userId.trim().length > 0;

const createPersistRecord = (workbench: CanvasWorkbench): CanvasWorkbenchPersistRecord => ({
  snapshot: getCanvasWorkbenchSnapshot(workbench),
  listEntry: materializeCanvasWorkbenchListEntry(workbench),
});

export const loadCanvasWorkbenchListForCurrentUser = async (): Promise<
  StoredCanvasWorkbenchListEntry[]
> => loadCanvasWorkbenchListEntriesByUser(getCurrentUserId());

export const loadPersistedCanvasWorkbench = async (workbenchId: string) =>
  loadCanvasWorkbench(workbenchId);

export const deletePersistedCanvasWorkbenchRecord = async (workbenchId: string) =>
  deleteCanvasWorkbenchRecord(workbenchId);

export const savePersistedCanvasWorkbenchRecord = async ({
  listEntry,
  snapshot,
}: CanvasWorkbenchPersistRecord) => saveCanvasWorkbenchRecord(snapshot, listEntry);

export const savePersistedCanvasWorkbench = async (workbench: CanvasWorkbench) =>
  savePersistedCanvasWorkbenchRecord(createPersistRecord(workbench));

export const persistCanvasWorkbenchRecord = async ({
  epoch,
  getResetEpoch,
  workbench,
}: {
  epoch: number;
  getResetEpoch: () => number;
  workbench: CanvasWorkbench;
}): Promise<CanvasWorkbenchPersistStatus> => {
  if (epoch !== getResetEpoch()) {
    return "epoch_invalidated_before_persist";
  }

  const saved = await savePersistedCanvasWorkbenchRecord(createPersistRecord(workbench));
  if (!saved) {
    return "persist_failed";
  }

  if (epoch !== getResetEpoch()) {
    return "epoch_invalidated_after_persist";
  }

  return "persisted";
};

export const queueCanvasWorkbenchCleanupCompensation = ({
  userId,
  workbenchId,
}: {
  userId: string;
  workbenchId: string;
}) => {
  if (canQueueCompensation(userId)) {
    pendingCanvasWorkbenchCleanupById.set(workbenchId, userId);
  }
};

export const queueCanvasWorkbenchRestoreCompensation = ({
  workbench,
}: {
  workbench: CanvasWorkbench;
}) => {
  if (canQueueCompensation(workbench.ownerRef.userId)) {
    pendingCanvasWorkbenchRestoreRecords.set(workbench.id, createPersistRecord(workbench));
  }
};

export const flushPendingCanvasWorkbenchCompensation = async ({
  epoch,
  getResetEpoch,
}: {
  epoch: number;
  getResetEpoch: () => number;
}) => {
  const currentUserId = getCurrentUserId();
  const pendingCleanupIds = Array.from(pendingCanvasWorkbenchCleanupById.entries())
    .filter(([, userId]) => userId === currentUserId)
    .map(([workbenchId]) => workbenchId);
  const pendingRestoreRecords = Array.from(
    pendingCanvasWorkbenchRestoreRecords.values()
  ).filter((record) => record.snapshot.ownerRef.userId === currentUserId);

  if (pendingCleanupIds.length === 0 && pendingRestoreRecords.length === 0) {
    return;
  }

  for (const workbenchId of pendingCleanupIds) {
    if (epoch !== getResetEpoch() || getCurrentUserId() !== currentUserId) {
      return;
    }
    const deleted = await deleteCanvasWorkbenchRecord(workbenchId);
    if (deleted) {
      pendingCanvasWorkbenchCleanupById.delete(workbenchId);
    }
  }

  for (const record of pendingRestoreRecords) {
    if (epoch !== getResetEpoch() || getCurrentUserId() !== currentUserId) {
      return;
    }
    const existing = await loadCanvasWorkbench(record.snapshot.id);
    if (existing) {
      pendingCanvasWorkbenchRestoreRecords.delete(record.snapshot.id);
      continue;
    }
    if (epoch !== getResetEpoch() || getCurrentUserId() !== currentUserId) {
      return;
    }
    const restored = await savePersistedCanvasWorkbenchRecord(record);
    if (restored) {
      pendingCanvasWorkbenchRestoreRecords.delete(record.snapshot.id);
    }
  }
};

export const resetCanvasWorkbenchPersistenceGateway = () => {
  pendingCanvasWorkbenchCleanupById.clear();
  pendingCanvasWorkbenchRestoreRecords.clear();
};
