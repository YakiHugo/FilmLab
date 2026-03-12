import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  GenerationJobSnapshot,
  PersistedGenerationTurn,
  PersistedImageSession,
  PersistedResultItem,
} from "../../shared/chatImageTypes";
import {
  deleteImageGenerationSession,
  loadImageGenerationSessions,
  saveImageGenerationSession,
} from "@/lib/db";

interface ImageSessionState {
  session: PersistedImageSession | null;
  isHydrated: boolean;
  hydrateSession: () => Promise<void>;
  replaceSession: (session: PersistedImageSession) => void;
  addTurnWithJob: (turn: PersistedGenerationTurn, job: GenerationJobSnapshot) => void;
  addTurn: (turn: PersistedGenerationTurn) => void;
  updateTurn: (turnId: string, patch: Partial<PersistedGenerationTurn>) => void;
  deleteTurn: (turnId: string) => void;
  addJob: (job: GenerationJobSnapshot) => void;
  updateJob: (jobId: string, patch: Partial<GenerationJobSnapshot>) => void;
  clearSession: () => void;
}

const IMAGE_SESSION_PERSIST_DEBOUNCE_MS = 300;
export const MAX_PERSISTED_IMAGE_JOBS = 200;
export const MAX_PERSISTED_IMAGE_TURNS = 500;
export const INTERRUPTED_GENERATION_ERROR = "Generation was interrupted. Please retry.";

let persistTimeout: ReturnType<typeof setTimeout> | null = null;
let hydrationPromise: Promise<void> | null = null;

const nowIso = () => new Date().toISOString();

const createSessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `image-session-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const createEmptyImageSession = (): PersistedImageSession => {
  const timestamp = nowIso();
  const id = createSessionId();
  return {
    id,
    thread: {
      id,
      creativeBrief: {
        latestPrompt: null,
        latestModelId: null,
        acceptedAssetId: null,
        selectedAssetIds: [],
        recentAssetRefIds: [],
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    turns: [],
    runs: [],
    assets: [],
    assetEdges: [],
    jobs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

const withUpdatedAt = (session: PersistedImageSession): PersistedImageSession => {
  const updatedAt = nowIso();
  return {
    ...session,
    updatedAt,
    thread: {
      ...session.thread,
      updatedAt,
    },
  };
};

const mergeProjectedResults = (
  previousResults: PersistedResultItem[],
  nextResults: PersistedResultItem[]
) => {
  const previousById = new Map(previousResults.map((result) => [result.id, result]));
  return nextResults.map((result) => {
    const previous = previousById.get(result.id);
    if (!previous) {
      return result;
    }

    return {
      ...result,
      assetId: previous.assetId ?? result.assetId,
      saved: previous.saved || result.saved,
    };
  });
};

export const mergeProjectedSession = (
  previous: PersistedImageSession | null,
  next: PersistedImageSession
): PersistedImageSession => {
  if (!previous) {
    return next;
  }

  const previousTurnsById = new Map(previous.turns.map((turn) => [turn.id, turn]));
  return {
    ...next,
    turns: next.turns.map((turn) => {
      const previousTurn = previousTurnsById.get(turn.id);
      if (!previousTurn) {
        return turn;
      }

      return {
        ...turn,
        results: mergeProjectedResults(previousTurn.results, turn.results),
      };
    }),
  };
};

export const trimSession = (session: PersistedImageSession): PersistedImageSession => {
  const nextTurns = session.turns.slice(0, MAX_PERSISTED_IMAGE_TURNS);
  const keptTurnIds = new Set(nextTurns.map((turn) => turn.id));
  const nextJobs = session.jobs
    .filter((job) => keptTurnIds.has(job.turnId))
    .slice(0, MAX_PERSISTED_IMAGE_JOBS);
  const keptJobIds = new Set(nextJobs.map((job) => job.id));
  const nextRuns = session.runs.filter((run) => keptTurnIds.has(run.turnId));
  const keptRunIds = new Set(nextRuns.map((run) => run.id));
  const nextAssets = session.assets.filter(
    (asset) =>
      (asset.turnId ? keptTurnIds.has(asset.turnId) : false) ||
      (asset.runId ? keptRunIds.has(asset.runId) : false)
  );
  const keptAssetIds = new Set(nextAssets.map((asset) => asset.id));
  const nextAssetEdges = session.assetEdges.filter(
    (edge) => keptAssetIds.has(edge.sourceAssetId) && keptAssetIds.has(edge.targetAssetId)
  );

  return {
    ...session,
    turns: nextTurns.map((turn) =>
      turn.jobId && !keptJobIds.has(turn.jobId)
        ? {
            ...turn,
            jobId: null,
          }
        : turn
    ),
    runs: nextRuns,
    assets: nextAssets,
    assetEdges: nextAssetEdges,
    jobs: nextJobs,
  };
};

export const normalizeRecoveredSession = (
  session: PersistedImageSession
): { session: PersistedImageSession; didChange: boolean } => {
  let didChange = false;
  const recoveredAt = nowIso();
  const nextTurns = session.turns.map((turn) => {
    if (turn.status !== "loading") {
      return turn;
    }

    didChange = true;
    return {
      ...turn,
      status: "error" as const,
      error: INTERRUPTED_GENERATION_ERROR,
    };
  });
  const nextJobs = session.jobs.map((job) => {
    if (job.status !== "running") {
      return job;
    }

    didChange = true;
    return {
      ...job,
      status: "failed" as const,
      error: INTERRUPTED_GENERATION_ERROR,
      completedAt: job.completedAt ?? recoveredAt,
    };
  });
  const trimmedSession = trimSession({
    ...session,
    turns: nextTurns,
    jobs: nextJobs,
  });

  if (
    trimmedSession.jobs.length !== session.jobs.length ||
    trimmedSession.turns.length !== session.turns.length ||
    trimmedSession.turns.some((turn, index) => turn.jobId !== nextTurns[index]?.jobId)
  ) {
    didChange = true;
  }

  return {
    session: didChange ? withUpdatedAt(trimmedSession) : trimmedSession,
    didChange,
  };
};

const clearPersistTimer = () => {
  if (persistTimeout) {
    clearTimeout(persistTimeout);
    persistTimeout = null;
  }
};

const persistSession = async (session: PersistedImageSession) => {
  await saveImageGenerationSession(session);
};

const schedulePersist = (session: PersistedImageSession) => {
  clearPersistTimer();
  persistTimeout = setTimeout(() => {
    persistTimeout = null;
    void persistSession(session);
  }, IMAGE_SESSION_PERSIST_DEBOUNCE_MS);
};

export const useImageSessionStore = create<ImageSessionState>()(
  devtools(
    (set, get) => {
      const commitSession = (
        updater: (session: PersistedImageSession) => PersistedImageSession,
        options?: { persistImmediately?: boolean }
      ) => {
        const currentSession = get().session ?? createEmptyImageSession();
        const nextSession = trimSession(withUpdatedAt(updater(currentSession)));
        set({
          session: nextSession,
          isHydrated: true,
        });

        if (options?.persistImmediately) {
          clearPersistTimer();
          void persistSession(nextSession);
          return;
        }

        schedulePersist(nextSession);
      };

      return {
        session: null,
        isHydrated: false,
        hydrateSession: async () => {
          if (get().isHydrated && get().session) {
            return;
          }
          if (hydrationPromise) {
            return hydrationPromise;
          }

          hydrationPromise = (async () => {
            const sessions = await loadImageGenerationSessions();
            const latestSession = sessions[0] ?? createEmptyImageSession();
            const normalizedSession =
              sessions.length > 0 ? normalizeRecoveredSession(latestSession) : null;

            if (sessions.length === 0) {
              await persistSession(latestSession);
            } else if (normalizedSession?.didChange) {
              await persistSession(normalizedSession.session);
            }

            const currentState = get();
            if (currentState.isHydrated && currentState.session) {
              return;
            }

            set({
              session: normalizedSession?.session ?? latestSession,
              isHydrated: true,
            });
          })().finally(() => {
            hydrationPromise = null;
          });

          return hydrationPromise;
        },
        replaceSession: (session) => {
          const nextSession = trimSession(
            mergeProjectedSession(get().session, {
              ...session,
            })
          );
          set({
            session: nextSession,
            isHydrated: true,
          });

          schedulePersist(nextSession);
        },
        addTurnWithJob: (turn, job) => {
          commitSession((session) => ({
            ...session,
            turns: [turn, ...session.turns],
            jobs: [job, ...session.jobs],
          }));
        },
        addTurn: (turn) => {
          commitSession((session) => ({
            ...session,
            turns: [turn, ...session.turns],
          }));
        },
        updateTurn: (turnId, patch) => {
          commitSession((session) => ({
            ...session,
            turns: session.turns.map((turn) =>
              turn.id === turnId
                ? {
                    ...turn,
                    ...patch,
                  }
                : turn
            ),
          }));
        },
        deleteTurn: (turnId) => {
          commitSession((session) => {
            const targetTurn = session.turns.find((turn) => turn.id === turnId) ?? null;
            const targetJobId = targetTurn?.jobId ?? null;
            return {
              ...session,
              turns: session.turns.filter((turn) => turn.id !== turnId),
              jobs: session.jobs.filter(
                (job) => job.turnId !== turnId && (targetJobId ? job.id !== targetJobId : true)
              ),
            };
          });
        },
        addJob: (job) => {
          commitSession((session) => ({
            ...session,
            jobs: [job, ...session.jobs],
          }));
        },
        updateJob: (jobId, patch) => {
          commitSession((session) => ({
            ...session,
            jobs: session.jobs.map((job) =>
              job.id === jobId
                ? {
                    ...job,
                    ...patch,
                  }
                : job
            ),
          }));
        },
        clearSession: () => {
          const previousSessionId = get().session?.id ?? null;
          const nextSession = createEmptyImageSession();

          clearPersistTimer();
          set({
            session: nextSession,
            isHydrated: true,
          });

          void persistSession(nextSession);
          if (previousSessionId) {
            void deleteImageGenerationSession(previousSessionId);
          }
        },
      };
    },
    { name: "ImageSessionStore", enabled: process.env.NODE_ENV === "development" }
  )
);
