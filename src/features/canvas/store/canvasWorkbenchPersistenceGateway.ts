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

const pendingCanvasWorkbenchCleanupById = new Map<string, string>();
const pendingCanvasWorkbenchRestoreSnapshots = new Map<string, CanvasWorkbenchSnapshot>();

const canQueueCompensation = ({
  epoch,
  getResetEpoch,
  userId,
}: {
  epoch: number;
  getResetEpoch: () => number;
  userId: string;
}) => epoch === getResetEpoch() && getCurrentUserId() === userId;

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
}): Promise<boolean> => {
  if (epoch !== getResetEpoch()) {
    return false;
  }

  const saved = await saveCanvasWorkbench(getCanvasWorkbenchSnapshot(workbench));
  if (!saved) {
    return false;
  }

  if (epoch !== getResetEpoch()) {
    await deleteCanvasWorkbench(workbench.id);
    return false;
  }

  return true;
};

export const queueCanvasWorkbenchCleanupCompensation = ({
  epoch,
  getResetEpoch,
  userId,
  workbenchId,
}: {
  epoch: number;
  getResetEpoch: () => number;
  userId: string;
  workbenchId: string;
}) => {
  if (canQueueCompensation({ epoch, getResetEpoch, userId })) {
    pendingCanvasWorkbenchCleanupById.set(workbenchId, userId);
  }
};

export const queueCanvasWorkbenchRestoreCompensation = ({
  epoch,
  getResetEpoch,
  snapshot,
}: {
  epoch: number;
  getResetEpoch: () => number;
  snapshot: CanvasWorkbenchSnapshot;
}) => {
  if (canQueueCompensation({ epoch, getResetEpoch, userId: snapshot.ownerRef.userId })) {
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
