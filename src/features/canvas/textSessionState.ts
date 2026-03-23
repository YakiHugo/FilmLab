import type { CanvasRenderableTextElement, CanvasTextElement } from "@/types";
import {
  resolveTextCancelKind,
  resolveTextCommitKind,
  resolveTextSessionWorkbenchTransition,
  shouldMaterializeCreatedText,
  shouldSelectMaterializedCreatedText,
  type EditingTextMode,
} from "./textSession";

export type CanvasTextSessionStatus =
  | "idle"
  | "editing"
  | "waiting"
  | "persisting-source";

export interface CanvasTextSessionSnapshot {
  draft: CanvasTextElement | null;
  hasMaterializedElement: boolean;
  hasPersistedExistingDraft: boolean;
  id: string | null;
  initialElement: CanvasRenderableTextElement | CanvasTextElement | null;
  mode: EditingTextMode | null;
  sessionToken: number;
  status: CanvasTextSessionStatus;
  transitionToken: number;
  value: string;
  workbenchId: string | null;
}

export type CanvasTextSessionEffect =
  | { type: "clear-selection" }
  | {
      type: "delete-created";
      elementId: string;
      reason: "cancel" | "commit" | "persist-source";
      sessionToken: number;
      transitionToken: number | null;
      workbenchId: string;
    }
  | {
      type: "mark-existing-draft-persisted";
      sessionToken: number;
      transitionToken: number;
    }
  | {
      type: "reset-session";
      sessionToken: number;
    }
  | {
      type: "rollback-existing";
      element: CanvasRenderableTextElement | CanvasTextElement;
      sessionToken: number;
      workbenchId: string;
    }
  | { type: "select-element"; elementId: string }
  | {
      type: "upsert-draft";
      element: CanvasTextElement;
      reason: "commit" | "materialize" | "persist-source";
      sessionToken: number;
      transitionToken: number | null;
      workbenchId: string;
    };

export type CanvasTextSessionEvent =
  | {
      type: "begin";
      activeWorkbenchId: string | null;
      element: CanvasRenderableTextElement | CanvasTextElement;
      mode?: EditingTextMode;
    }
  | {
      type: "cancel";
      availableWorkbenchIds: string[];
    }
  | {
      type: "commit";
      activeWorkbenchId: string | null;
    }
  | {
      type: "change-value";
      activeWorkbenchId: string | null;
      nextValue: string;
    }
  | {
      type: "source-persist-finished";
      activeWorkbenchId: string | null;
      availableWorkbenchIds: string[];
      didPersistDraft: boolean;
      sessionToken: number;
      transitionToken: number;
    }
  | {
      type: "sync-environment";
      activeWorkbenchId: string | null;
      availableWorkbenchIds: string[];
      hasEditingTextElement: boolean;
      isEditingTextSelected: boolean;
      isSessionElementEditable: boolean;
    }
  | {
      type: "update-draft";
      activeWorkbenchId: string | null;
      updater: (element: CanvasTextElement) => CanvasTextElement;
    };

export interface CanvasTextSessionTransitionResult {
  effects: CanvasTextSessionEffect[];
  session: CanvasTextSessionSnapshot;
}

export interface CanvasTextSessionReducerOptions {
  fitDraft: <TElement extends CanvasTextElement>(element: TElement) => TElement;
}

const IDLE_TEXT_SESSION: CanvasTextSessionSnapshot = {
  draft: null,
  hasMaterializedElement: false,
  hasPersistedExistingDraft: false,
  id: null,
  initialElement: null,
  mode: null,
  sessionToken: 0,
  status: "idle",
  transitionToken: 0,
  value: "",
  workbenchId: null,
};

const isCanvasTextElementEditable = (
  element:
    | (Partial<Pick<CanvasTextElement, "locked" | "visible">> &
        Partial<Pick<CanvasRenderableTextElement, "effectiveLocked" | "effectiveVisible">>)
    | null
    | undefined
) =>
  Boolean(
    element &&
      !(element.effectiveLocked ?? element.locked) &&
      (element.effectiveVisible ?? element.visible)
  );

const hasWorkbench = (availableWorkbenchIds: string[], workbenchId: string | null) =>
  workbenchId !== null && availableWorkbenchIds.includes(workbenchId);

const createIdleSession = (
  current: CanvasTextSessionSnapshot
): CanvasTextSessionSnapshot => ({
  ...IDLE_TEXT_SESSION,
  sessionToken: current.sessionToken + 1,
  transitionToken: current.transitionToken,
});

const resolveWorkbenchTransition = ({
  activeWorkbenchId,
  availableWorkbenchIds,
  session,
}: {
  activeWorkbenchId: string | null;
  availableWorkbenchIds: string[];
  session: CanvasTextSessionSnapshot;
}) =>
  resolveTextSessionWorkbenchTransition({
    activeWorkbenchId,
    hasActiveWorkbench: hasWorkbench(availableWorkbenchIds, activeWorkbenchId),
    hasSessionWorkbench: hasWorkbench(availableWorkbenchIds, session.workbenchId),
    sessionWorkbenchId: session.workbenchId,
  });

const buildDeleteCreatedEffect = ({
  reason,
  session,
}: {
  reason: "cancel" | "commit" | "persist-source";
  session: CanvasTextSessionSnapshot;
}): CanvasTextSessionEffect[] =>
  session.draft && session.workbenchId
    ? [
        {
          type: "delete-created",
          elementId: session.draft.id,
          reason,
          sessionToken: session.sessionToken,
          transitionToken: reason === "persist-source" ? session.transitionToken : null,
          workbenchId: session.workbenchId,
        },
      ]
    : [];

const buildUpsertDraftEffect = ({
  element,
  reason,
  session,
}: {
  element: CanvasTextElement;
  reason: "commit" | "materialize" | "persist-source";
  session: CanvasTextSessionSnapshot;
}): CanvasTextSessionEffect[] =>
  session.workbenchId
    ? [
        {
          type: "upsert-draft",
          element,
          reason,
          sessionToken: session.sessionToken,
          transitionToken: reason === "persist-source" ? session.transitionToken : null,
          workbenchId: session.workbenchId,
        },
      ]
    : [];

const buildPersistSourceEffects = (
  session: CanvasTextSessionSnapshot,
  options: CanvasTextSessionReducerOptions
): CanvasTextSessionEffect[] => {
  if (!session.draft) {
    return [];
  }

  const commitKind = resolveTextCommitKind({
    hasCreatedElement: session.hasMaterializedElement,
    mode: session.mode,
    value: session.value,
  });

  if (commitKind === "delete") {
    return buildDeleteCreatedEffect({
      reason: "persist-source",
      session,
    });
  }

  if (commitKind !== "upsert") {
    return [];
  }

  return buildUpsertDraftEffect({
    element: options.fitDraft({
      ...session.draft,
      content: session.value.trim(),
    }),
    reason: "persist-source",
    session,
  });
};

export const createCanvasTextSessionSnapshot = (): CanvasTextSessionSnapshot => ({
  ...IDLE_TEXT_SESSION,
});

export const reduceCanvasTextSession = (
  session: CanvasTextSessionSnapshot,
  event: CanvasTextSessionEvent,
  options: CanvasTextSessionReducerOptions
): CanvasTextSessionTransitionResult => {
  switch (event.type) {
    case "begin": {
      if (!event.activeWorkbenchId || !isCanvasTextElementEditable(event.element)) {
        return { effects: [], session };
      }

      const mode = event.mode ?? "existing";
      const nextDraft = options.fitDraft(event.element);
      return {
        effects: [],
        session: {
          draft: nextDraft,
          hasMaterializedElement: mode === "existing",
          hasPersistedExistingDraft: false,
          id: nextDraft.id,
          initialElement: mode === "existing" ? event.element : null,
          mode,
          sessionToken: session.sessionToken + 1,
          status: "editing",
          transitionToken: session.transitionToken,
          value: nextDraft.content,
          workbenchId: event.activeWorkbenchId,
        },
      };
    }
    case "cancel": {
      if (!session.id) {
        return { effects: [], session };
      }

      const effects: CanvasTextSessionEffect[] = [];
      const hasSessionWorkbench = hasWorkbench(event.availableWorkbenchIds, session.workbenchId);
      const cancelKind = resolveTextCancelKind({
        hasCreatedElement: session.hasMaterializedElement,
        mode: session.mode,
      });

      if (
        cancelKind === "rollback-delete" &&
        session.draft &&
        session.workbenchId &&
        hasSessionWorkbench &&
        isCanvasTextElementEditable(session.draft)
      ) {
        effects.push({ type: "clear-selection" });
        effects.push(
          ...buildDeleteCreatedEffect({
            reason: "cancel",
            session,
          })
        );
      } else if (
        session.mode === "existing" &&
        (session.hasPersistedExistingDraft || session.status === "persisting-source") &&
        session.initialElement &&
        session.workbenchId &&
        hasSessionWorkbench &&
        isCanvasTextElementEditable(session.initialElement)
      ) {
        effects.push({
          type: "rollback-existing",
          element: session.initialElement,
          sessionToken: session.sessionToken,
          workbenchId: session.workbenchId,
        });
      }

      return {
        effects,
        session: createIdleSession(session),
      };
    }
    case "commit": {
      if (
        !session.id ||
        !session.draft ||
        !event.activeWorkbenchId ||
        session.workbenchId !== event.activeWorkbenchId ||
        !isCanvasTextElementEditable(session.draft)
      ) {
        return {
          effects: session.id ? [{ type: "reset-session", sessionToken: session.sessionToken }] : [],
          session: session.id ? createIdleSession(session) : session,
        };
      }

      const effects: CanvasTextSessionEffect[] = [];
      const commitKind = resolveTextCommitKind({
        hasCreatedElement: session.hasMaterializedElement,
        mode: session.mode,
        value: session.value,
      });

      if (commitKind === "delete") {
        effects.push({ type: "clear-selection" });
        effects.push(
          ...buildDeleteCreatedEffect({
            reason: "commit",
            session,
          })
        );
      } else if (commitKind === "upsert") {
        const nextDraft = options.fitDraft({
          ...session.draft,
          content: session.value.trim(),
        });
        effects.push(
          ...buildUpsertDraftEffect({
            element: nextDraft,
            reason: "commit",
            session,
          })
        );
        effects.push({
          type: "select-element",
          elementId: nextDraft.id,
        });
      }

      effects.push({ type: "reset-session", sessionToken: session.sessionToken });
      return {
        effects,
        session: createIdleSession(session),
      };
    }
    case "change-value": {
      if (!session.id || !session.draft) {
        return { effects: [], session };
      }

      const nextDraft = options.fitDraft({
        ...session.draft,
        content: event.nextValue,
      });
      const nextSession: CanvasTextSessionSnapshot = {
        ...session,
        draft: nextDraft,
        value: event.nextValue,
      };

      if (
        !shouldMaterializeCreatedText({
          activeWorkbenchId: event.activeWorkbenchId,
          hasCreatedElement: session.hasMaterializedElement,
          mode: session.mode,
          nextValue: event.nextValue,
          sessionWorkbenchId: session.workbenchId,
        })
      ) {
        return { effects: [], session: nextSession };
      }

      const materializedSession = {
        ...nextSession,
        hasMaterializedElement: true,
      };
      return {
        effects: buildUpsertDraftEffect({
          element: nextDraft,
          reason: "materialize",
          session: materializedSession,
        }),
        session: materializedSession,
      };
    }
    case "source-persist-finished": {
      if (
        event.sessionToken !== session.sessionToken ||
        event.transitionToken !== session.transitionToken ||
        session.status !== "persisting-source"
      ) {
        return { effects: [], session };
      }

      const nextSession =
        event.didPersistDraft && session.mode === "existing"
          ? {
              ...session,
              hasPersistedExistingDraft: true,
            }
          : session;
      const transition = resolveWorkbenchTransition({
        activeWorkbenchId: event.activeWorkbenchId,
        availableWorkbenchIds: event.availableWorkbenchIds,
        session: nextSession,
      });

      if (transition === "persist-source" || transition === "reset") {
        return {
          effects: [],
          session: createIdleSession(nextSession),
        };
      }

      return {
        effects:
          event.didPersistDraft && session.mode === "existing"
            ? [
                {
                  type: "mark-existing-draft-persisted",
                  sessionToken: session.sessionToken,
                  transitionToken: session.transitionToken,
                },
              ]
            : [],
        session: {
          ...nextSession,
          status: transition === "wait" ? "waiting" : "editing",
        },
      };
    }
    case "sync-environment": {
      if (!session.id) {
        return { effects: [], session };
      }

      if (!event.isSessionElementEditable) {
        return {
          effects: [],
          session: createIdleSession(session),
        };
      }

      const effects: CanvasTextSessionEffect[] = [];
      if (
        shouldSelectMaterializedCreatedText({
          activeWorkbenchId: event.activeWorkbenchId,
          editingTextId: session.id,
          hasEditingTextElement: event.hasEditingTextElement,
          isEditingTextSelected: event.isEditingTextSelected,
          mode: session.mode,
          sessionWorkbenchId: session.workbenchId,
        })
      ) {
        effects.push({
          type: "select-element",
          elementId: session.id,
        });
      }

      const transition = resolveWorkbenchTransition({
        activeWorkbenchId: event.activeWorkbenchId,
        availableWorkbenchIds: event.availableWorkbenchIds,
        session,
      });

      if (session.status === "persisting-source") {
        if (transition === "reset") {
          return {
            effects: [],
            session: createIdleSession(session),
          };
        }

        return { effects, session };
      }

      if (transition === "persist-source" && session.workbenchId) {
        const nextSession = {
          ...session,
          status: "persisting-source" as const,
          transitionToken: session.transitionToken + 1,
        };
        return {
          effects: [...effects, ...buildPersistSourceEffects(nextSession, options)],
          session: nextSession,
        };
      }

      if (transition === "reset") {
        return {
          effects: [],
          session: createIdleSession(session),
        };
      }

      const nextStatus = transition === "wait" ? "waiting" : "editing";
      return nextStatus === session.status
        ? { effects, session }
        : {
            effects,
            session: {
              ...session,
              status: nextStatus,
            },
          };
    }
    case "update-draft": {
      if (
        !session.id ||
        !session.draft ||
        !event.activeWorkbenchId ||
        (session.workbenchId !== null && session.workbenchId !== event.activeWorkbenchId) ||
        !isCanvasTextElementEditable(session.draft)
      ) {
        return { effects: [], session };
      }

      const nextDraft = options.fitDraft(event.updater(session.draft));
      return {
        effects: [],
        session: {
          ...session,
          draft: nextDraft,
          value: nextDraft.content,
        },
      };
    }
    default:
      return { effects: [], session };
  }
};
