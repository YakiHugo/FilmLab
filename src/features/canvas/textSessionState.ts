import type {
  CanvasEditableTextElement,
  CanvasRenderableTextElement,
  CanvasTextElement,
} from "@/types";
import {
  resolveTextCancelKind,
  resolveTextCommitKind,
  shouldMaterializeCreatedText,
  type EditingTextMode,
} from "./textSession";

export type CanvasTextSessionStatus = "idle" | "editing" | "committing";

const toCanvasEditableTextElement = (
  element: CanvasTextElement | CanvasRenderableTextElement
): CanvasEditableTextElement => ({
  id: element.id,
  type: "text",
  parentId: element.parentId,
  transform: {
    ...element.transform,
  },
  x: element.transform.x,
  y: element.transform.y,
  width: element.transform.width,
  height: element.transform.height,
  rotation: element.transform.rotation,
  zIndex: element.zIndex,
  opacity: element.opacity,
  locked: element.locked,
  visible: element.visible,
  color: element.color,
  content: element.content,
  fontFamily: element.fontFamily,
  fontSize: element.fontSize,
  fontSizeTier: element.fontSizeTier,
  textAlign: element.textAlign,
});

const fitCanvasEditableTextDraft = (
  options: CanvasTextSessionReducerOptions,
  element: CanvasTextElement | CanvasRenderableTextElement
): CanvasEditableTextElement =>
  options.fitDraft(toCanvasEditableTextElement(element));

export interface CanvasTextSessionSnapshot {
  draft: CanvasEditableTextElement | null;
  hasMaterializedElement: boolean;
  id: string | null;
  mode: EditingTextMode | null;
  sessionToken: number;
  status: CanvasTextSessionStatus;
  value: string;
  workbenchId: string | null;
}

export type CanvasTextSessionEffect =
  | { type: "clear-selection" }
  | {
      type: "delete-created";
      elementId: string;
      reason: "cancel" | "commit";
      workbenchId: string;
    }
  | { type: "select-element"; elementId: string }
  | {
      type: "upsert-draft";
      element: CanvasEditableTextElement;
      reason: "commit" | "materialize";
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
    }
  | {
      type: "change-value";
      activeWorkbenchId: string | null;
      nextValue: string;
    }
  | {
      type: "finish-commit";
      didCommit: boolean;
      sessionToken: number;
    }
  | {
      type: "prepare-commit";
      activeWorkbenchId: string | null;
    }
  | {
      type: "sync-active-workbench";
      activeWorkbenchId: string | null;
    }
  | {
      type: "update-draft";
      activeWorkbenchId: string | null;
      updater: (element: CanvasTextElement) => CanvasTextElement;
    };

export interface CanvasTextSessionTransitionResult {
  effects: CanvasTextSessionEffect[];
  outcome?: "noop" | "pending" | "skipped";
  session: CanvasTextSessionSnapshot;
}

export interface CanvasTextSessionReducerOptions {
  fitDraft: <TElement extends CanvasTextElement>(element: TElement) => TElement;
}

const IDLE_TEXT_SESSION: CanvasTextSessionSnapshot = {
  draft: null,
  hasMaterializedElement: false,
  id: null,
  mode: null,
  sessionToken: 0,
  status: "idle",
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

const createIdleSession = (
  current: CanvasTextSessionSnapshot
): CanvasTextSessionSnapshot => ({
  ...IDLE_TEXT_SESSION,
  sessionToken: current.sessionToken + 1,
});

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
      if (
        session.status === "committing" ||
        !event.activeWorkbenchId ||
        !isCanvasTextElementEditable(event.element)
      ) {
        return { effects: [], outcome: "skipped", session };
      }

      const mode = event.mode ?? "existing";
      const nextDraft = fitCanvasEditableTextDraft(options, event.element);
      return {
        effects: [],
        session: {
          draft: nextDraft,
          hasMaterializedElement: mode === "existing",
          id: nextDraft.id,
          mode,
          sessionToken: session.sessionToken + 1,
          status: "editing",
          value: nextDraft.content,
          workbenchId: event.activeWorkbenchId,
        },
      };
    }
    case "cancel": {
      if (!session.id || !session.draft || session.status === "committing") {
        return {
          effects: [],
          outcome: session.id ? "skipped" : undefined,
          session,
        };
      }

      const effects: CanvasTextSessionEffect[] = [];
      const cancelKind = resolveTextCancelKind({
        hasCreatedElement: session.hasMaterializedElement,
        mode: session.mode,
      });

      if (
        cancelKind === "rollback-delete" &&
        session.workbenchId &&
        isCanvasTextElementEditable(session.draft)
      ) {
        effects.push(
          { type: "clear-selection" },
          {
            type: "delete-created",
            elementId: session.draft.id,
            reason: "cancel",
            workbenchId: session.workbenchId,
          }
        );
      }

      return {
        effects,
        session: createIdleSession(session),
      };
    }
    case "change-value": {
      if (
        !session.id ||
        !session.draft ||
        session.status !== "editing" ||
        !event.activeWorkbenchId ||
        session.workbenchId !== event.activeWorkbenchId
      ) {
        return { effects: [], outcome: "skipped", session };
      }

      const nextDraft = fitCanvasEditableTextDraft(options, {
        ...session.draft,
        content: event.nextValue,
      });
      const shouldMaterialize = shouldMaterializeCreatedText({
        activeWorkbenchId: event.activeWorkbenchId,
        hasCreatedElement: session.hasMaterializedElement,
        mode: session.mode,
        nextValue: event.nextValue,
        sessionWorkbenchId: session.workbenchId,
      });
      const effects: CanvasTextSessionEffect[] =
        shouldMaterialize && session.workbenchId
          ? [
              {
                type: "upsert-draft",
                element: nextDraft,
                reason: "materialize",
                workbenchId: session.workbenchId,
              },
              {
                type: "select-element",
                elementId: nextDraft.id,
              },
            ]
          : [];

      return {
        effects,
        session: {
          ...session,
          draft: nextDraft,
          hasMaterializedElement: session.hasMaterializedElement || shouldMaterialize,
          value: event.nextValue,
        },
      };
    }
    case "update-draft": {
      if (
        !session.id ||
        !session.draft ||
        session.status !== "editing" ||
        !event.activeWorkbenchId ||
        session.workbenchId !== event.activeWorkbenchId
      ) {
        return { effects: [], outcome: "skipped", session };
      }

      const updatedDraft = fitCanvasEditableTextDraft(options, event.updater(session.draft));
      return {
        effects: [],
        session: {
          ...session,
          draft: updatedDraft,
          value: updatedDraft.content,
        },
      };
    }
    case "prepare-commit": {
      if (!session.id || !session.draft || session.status !== "editing") {
        return { effects: [], outcome: "skipped", session };
      }

      if (
        !event.activeWorkbenchId ||
        session.workbenchId !== event.activeWorkbenchId ||
        !isCanvasTextElementEditable(session.draft)
      ) {
        return {
          effects: [],
          outcome: "skipped",
          session: createIdleSession(session),
        };
      }

      const commitKind = resolveTextCommitKind({
        hasCreatedElement: session.hasMaterializedElement,
        mode: session.mode,
        value: session.value,
      });
      if (commitKind === "noop") {
        return {
          effects: [],
          outcome: "noop",
          session: createIdleSession(session),
        };
      }

      if (commitKind === "delete") {
        return {
          effects: [
            { type: "clear-selection" },
            {
              type: "delete-created",
              elementId: session.draft.id,
              reason: "commit",
              workbenchId: session.workbenchId,
            },
          ],
          outcome: "pending",
          session: {
            ...session,
            status: "committing",
          },
        };
      }

      const committedDraft = fitCanvasEditableTextDraft(options, {
        ...session.draft,
        content: session.value.trim(),
      });
      const effects: CanvasTextSessionEffect[] = [
        {
          type: "upsert-draft",
          element: committedDraft,
          reason: "commit",
          workbenchId: session.workbenchId,
        },
      ];
      if (session.mode === "create") {
        effects.push({
          type: "select-element",
          elementId: committedDraft.id,
        });
      }
      return {
        effects,
        outcome: "pending",
        session: {
          ...session,
          draft: committedDraft,
          status: "committing",
        },
      };
    }
    case "finish-commit": {
      if (session.status !== "committing" || event.sessionToken !== session.sessionToken) {
        return { effects: [], outcome: "skipped", session };
      }

      return {
        effects: [],
        session: event.didCommit
          ? createIdleSession(session)
          : {
              ...session,
              status: "editing",
            },
      };
    }
    case "sync-active-workbench": {
      if (!session.id) {
        return { effects: [], session };
      }

      return session.workbenchId === event.activeWorkbenchId
        ? { effects: [], session }
        : {
            effects: [],
            session: createIdleSession(session),
          };
    }
    default:
      return { effects: [], session };
  }
};
