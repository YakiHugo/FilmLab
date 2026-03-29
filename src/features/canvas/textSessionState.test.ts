import { describe, expect, it } from "vitest";
import type { CanvasRenderableTextElement, CanvasTextElement } from "@/types";
import {
  createCanvasTextSessionSnapshot,
  reduceCanvasTextSession,
  type CanvasTextSessionEffect,
  type CanvasTextSessionReducerOptions,
  type CanvasTextSessionSnapshot,
} from "./textSessionState";

const TEST_TEXT_SESSION_REDUCER_OPTIONS: CanvasTextSessionReducerOptions = {
  fitDraft: (element) => element,
};

const createRenderableTextElement = (
  overrides: Partial<CanvasRenderableTextElement> = {}
): CanvasRenderableTextElement => ({
  id: "text-1",
  type: "text",
  parentId: null,
  content: "Persisted",
  fontFamily: "Georgia",
  fontSize: 36,
  fontSizeTier: "medium",
  color: "#ffffff",
  textAlign: "left",
  x: 40,
  y: 60,
  width: 120,
  height: 48,
  rotation: 0,
  transform: {
    x: 40,
    y: 60,
    width: 120,
    height: 48,
    rotation: 0,
  },
  zIndex: 1,
  depth: 0,
  bounds: {
    x: 40,
    y: 60,
    width: 120,
    height: 48,
  },
  childIds: [],
  opacity: 1,
  worldOpacity: 1,
  locked: false,
  visible: true,
  effectiveLocked: false,
  effectiveVisible: true,
  ...overrides,
});

const createCreateModeTextElement = (
  overrides: Partial<CanvasTextElement> = {}
): CanvasTextElement => ({
  id: "text-create",
  type: "text",
  parentId: null,
  content: "",
  fontFamily: "Georgia",
  fontSize: 36,
  fontSizeTier: "medium",
  color: "#ffffff",
  textAlign: "left",
  x: 40,
  y: 60,
  width: 120,
  height: 48,
  rotation: 0,
  transform: {
    x: 40,
    y: 60,
    width: 120,
    height: 48,
    rotation: 0,
  },
  opacity: 1,
  locked: false,
  visible: true,
  ...overrides,
});

const reduceWithBegin = (
  overrides?: Partial<CanvasRenderableTextElement>
): CanvasTextSessionSnapshot =>
  reduceCanvasTextSession(
    createCanvasTextSessionSnapshot(),
    {
      type: "begin",
      activeWorkbenchId: "workbench-1",
      element: createRenderableTextElement(overrides),
    },
    TEST_TEXT_SESSION_REDUCER_OPTIONS
  ).session;

const expectEffectTypes = (effects: CanvasTextSessionEffect[]) => effects.map((effect) => effect.type);

describe("canvas text session state", () => {
  it("starts an existing-text session on the active workbench", () => {
    const result = reduceCanvasTextSession(
      createCanvasTextSessionSnapshot(),
      {
        type: "begin",
        activeWorkbenchId: "workbench-1",
        element: createRenderableTextElement(),
      },
      TEST_TEXT_SESSION_REDUCER_OPTIONS
    );

    expect(result.effects).toEqual([]);
    expect(result.session.id).toBe("text-1");
    expect(result.session.mode).toBe("existing");
    expect(result.session.status).toBe("editing");
    expect(result.session.workbenchId).toBe("workbench-1");
    expect(result.session.hasMaterializedElement).toBe(true);
    expect(result.session.draft).not.toBeNull();
  });

  it("materializes create-mode text on the first non-empty input", () => {
    const createSession = reduceCanvasTextSession(
      createCanvasTextSessionSnapshot(),
      {
        type: "begin",
        activeWorkbenchId: "workbench-1",
        element: createCreateModeTextElement(),
        mode: "create",
      },
      TEST_TEXT_SESSION_REDUCER_OPTIONS
    ).session;

    const result = reduceCanvasTextSession(
      createSession,
      {
        type: "change-value",
        activeWorkbenchId: "workbench-1",
        nextValue: "Hello",
      },
      TEST_TEXT_SESSION_REDUCER_OPTIONS
    );

    expect(expectEffectTypes(result.effects)).toEqual(["upsert-draft", "select-element"]);
    expect(result.session.hasMaterializedElement).toBe(true);
    expect(result.session.value).toBe("Hello");
  });

  it("deletes a materialized created text when commit ends empty", () => {
    const createSession = reduceCanvasTextSession(
      createCanvasTextSessionSnapshot(),
      {
        type: "begin",
        activeWorkbenchId: "workbench-1",
        element: createCreateModeTextElement(),
        mode: "create",
      },
      TEST_TEXT_SESSION_REDUCER_OPTIONS
    ).session;
    const materializedSession = reduceCanvasTextSession(
      createSession,
      {
        type: "change-value",
        activeWorkbenchId: "workbench-1",
        nextValue: "Hello",
      },
      TEST_TEXT_SESSION_REDUCER_OPTIONS
    ).session;
    const emptiedSession = reduceCanvasTextSession(
      materializedSession,
      {
        type: "change-value",
        activeWorkbenchId: "workbench-1",
        nextValue: "   ",
      },
      TEST_TEXT_SESSION_REDUCER_OPTIONS
    ).session;

    const result = reduceCanvasTextSession(
      emptiedSession,
      {
        type: "prepare-commit",
        activeWorkbenchId: "workbench-1",
      },
      TEST_TEXT_SESSION_REDUCER_OPTIONS
    );

    expect(result.outcome).toBe("pending");
    expect(expectEffectTypes(result.effects)).toEqual(["clear-selection", "delete-created"]);
    expect(result.session.status).toBe("committing");
  });

  it("resets empty unmaterialized create-mode text on commit as a noop", () => {
    const createSession = reduceCanvasTextSession(
      createCanvasTextSessionSnapshot(),
      {
        type: "begin",
        activeWorkbenchId: "workbench-1",
        element: createCreateModeTextElement(),
        mode: "create",
      },
      TEST_TEXT_SESSION_REDUCER_OPTIONS
    ).session;

    const result = reduceCanvasTextSession(
      createSession,
      {
        type: "prepare-commit",
        activeWorkbenchId: "workbench-1",
      },
      TEST_TEXT_SESSION_REDUCER_OPTIONS
    );

    expect(result.outcome).toBe("noop");
    expect(result.effects).toEqual([]);
    expect(result.session.status).toBe("idle");
  });

  it("returns to editing when a commit fails", () => {
    const started = reduceWithBegin();
    const prepared = reduceCanvasTextSession(
      started,
      {
        type: "prepare-commit",
        activeWorkbenchId: "workbench-1",
      },
      TEST_TEXT_SESSION_REDUCER_OPTIONS
    );

    const finished = reduceCanvasTextSession(
      prepared.session,
      {
        type: "finish-commit",
        didCommit: false,
        sessionToken: prepared.session.sessionToken,
      },
      TEST_TEXT_SESSION_REDUCER_OPTIONS
    );

    expect(finished.session.status).toBe("editing");
    expect(finished.session.id).toBe("text-1");
  });

  it("does not start a new session while a commit is still in flight", () => {
    const started = reduceWithBegin();
    const prepared = reduceCanvasTextSession(
      started,
      {
        type: "prepare-commit",
        activeWorkbenchId: "workbench-1",
      },
      TEST_TEXT_SESSION_REDUCER_OPTIONS
    );

    const result = reduceCanvasTextSession(
      prepared.session,
      {
        type: "begin",
        activeWorkbenchId: "workbench-1",
        element: createRenderableTextElement({
          id: "text-2",
          content: "Next",
        }),
      },
      TEST_TEXT_SESSION_REDUCER_OPTIONS
    );

    expect(result.outcome).toBe("skipped");
    expect(result.session.id).toBe("text-1");
    expect(result.session.status).toBe("committing");
  });

  it("does not reselect existing text on commit", () => {
    const started = reduceWithBegin();

    const result = reduceCanvasTextSession(
      started,
      {
        type: "prepare-commit",
        activeWorkbenchId: "workbench-1",
      },
      TEST_TEXT_SESSION_REDUCER_OPTIONS
    );

    expect(expectEffectTypes(result.effects)).toEqual(["upsert-draft"]);
  });

  it("resets the session when the active workbench changes", () => {
    const started = reduceWithBegin();

    const result = reduceCanvasTextSession(
      started,
      {
        type: "sync-active-workbench",
        activeWorkbenchId: "workbench-2",
      },
      TEST_TEXT_SESSION_REDUCER_OPTIONS
    );

    expect(result.session.status).toBe("idle");
    expect(result.session.id).toBeNull();
  });
});
