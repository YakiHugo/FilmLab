import { getCurrentUserId } from "@/lib/authToken";
import {
  deleteCanvasWorkbench,
  loadCanvasWorkbench,
  loadCanvasWorkbenchesByUser,
  saveCanvasWorkbench,
} from "@/lib/db";
import { getCanvasWorkbenchSnapshot } from "@/features/canvas/documentGraph";
import type { CanvasWorkbench, CanvasWorkbenchSnapshot } from "@/types";

export type StoredCanvasWorkbench = Awaited<ReturnType<typeof loadCanvasWorkbenchesByUser>>[number];
export type CanvasWorkbenchPersistStatus =
  | "persisted"
  | "persist_failed"
  | "epoch_invalidated_before_persist"
  | "epoch_invalidated_after_persist";

const pendingCanvasWorkbenchCleanupById = new Map<string, string>();
const pendingCanvasWorkbenchRestoreSnapshots = new Map<string, CanvasWorkbenchSnapshot>();

const canQueueCompensation = (userId: string) => userId.trim().length > 0;

export const loadCanvasWorkbenchesForCurrentUser = async (): Promise<StoredCanvasWorkbench[]> => {
  return loadCanvasWorkbenchesByUser(getCurrentUserId());
};

export const deletePersistedCanvasWorkbench = async (workbenchId: string) => {
  return deleteCanvasWorkbench(workbenchId);
};

export const savePersistedCanvasWorkbenchSnapshot = async (
  snapshot: CanvasWorkbenchSnapshot
) => {
  return saveCanvasWorkbench(snapshot);
};

export const persistCanvasWorkbenchSnapshot = async ({
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

  const saved = await saveCanvasWorkbench(getCanvasWorkbenchSnapshot(workbench));
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
  snapshot,
}: {
  snapshot: CanvasWorkbenchSnapshot;
}) => {
  if (canQueueCompensation(snapshot.ownerRef.userId)) {
    pendingCanvasWorkbenchRestoreSnapshots.set(snapshot.id, snapshot);
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
  const pendingRestoreSnapshots = Array.from(
    pendingCanvasWorkbenchRestoreSnapshots.values()
  ).filter((snapshot) => snapshot.ownerRef.userId === currentUserId);

  if (pendingCleanupIds.length === 0 && pendingRestoreSnapshots.length === 0) {
    return;
  }

  for (const workbenchId of pendingCleanupIds) {
    if (epoch !== getResetEpoch() || getCurrentUserId() !== currentUserId) {
      return;
    }
    const deleted = await deleteCanvasWorkbench(workbenchId);
    if (deleted) {
      pendingCanvasWorkbenchCleanupById.delete(workbenchId);
    }
  }

  for (const snapshot of pendingRestoreSnapshots) {
    if (epoch !== getResetEpoch() || getCurrentUserId() !== currentUserId) {
      return;
    }
    const existing = await loadCanvasWorkbench(snapshot.id);
    if (existing) {
      pendingCanvasWorkbenchRestoreSnapshots.delete(snapshot.id);
      continue;
    }
    if (epoch !== getResetEpoch() || getCurrentUserId() !== currentUserId) {
      return;
    }
    const restored = await saveCanvasWorkbench(snapshot);
    if (restored) {
      pendingCanvasWorkbenchRestoreSnapshots.delete(snapshot.id);
    }
  }
};

export const resetCanvasWorkbenchPersistenceGateway = () => {
  pendingCanvasWorkbenchCleanupById.clear();
  pendingCanvasWorkbenchRestoreSnapshots.clear();
};
