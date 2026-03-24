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
  reduceCanvasTextSession(createCanvasTextSessionSnapshot(), {
    type: "begin",
    activeWorkbenchId: "workbench-1",
    element: createRenderableTextElement(overrides),
  }, TEST_TEXT_SESSION_REDUCER_OPTIONS).session;

const expectSingleEffect = <T extends CanvasTextSessionEffect["type"]>(
  effects: CanvasTextSessionEffect[],
  type: T
): Extract<CanvasTextSessionEffect, { type: T }> => {
  expect(effects).toHaveLength(1);
  expect(effects[0]?.type).toBe(type);
  return effects[0] as Extract<CanvasTextSessionEffect, { type: T }>;
};

describe("canvas text session state", () => {
  it("starts an existing-text session with a fixed source workbench", () => {
    const result = reduceCanvasTextSession(createCanvasTextSessionSnapshot(), {
      type: "begin",
      activeWorkbenchId: "workbench-1",
      element: createRenderableTextElement(),
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS);

    expect(result.effects).toEqual([]);
    expect(result.session.id).toBe("text-1");
    expect(result.session.mode).toBe("existing");
    expect(result.session.status).toBe("editing");
    expect(result.session.workbenchId).toBe("workbench-1");
    expect(result.session.hasMaterializedElement).toBe(true);
    expect(result.session.initialElement?.id).toBe("text-1");
  });

  it("materializes create-mode text on the first non-empty input", () => {
    const createSession = reduceCanvasTextSession(createCanvasTextSessionSnapshot(), {
      type: "begin",
      activeWorkbenchId: "workbench-1",
      element: createCreateModeTextElement(),
      mode: "create",
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS).session;

    const result = reduceCanvasTextSession(createSession, {
      type: "change-value",
      activeWorkbenchId: "workbench-1",
      nextValue: "Hello",
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS);

    const effect = expectSingleEffect(result.effects, "upsert-draft");
    expect(effect.reason).toBe("materialize");
    expect(effect.element.content).toBe("Hello");
    expect(result.session.hasMaterializedElement).toBe(true);
    expect(result.session.value).toBe("Hello");
  });

  it("deletes a materialized created text when commit ends empty", () => {
    const createSession = reduceCanvasTextSession(createCanvasTextSessionSnapshot(), {
      type: "begin",
      activeWorkbenchId: "workbench-1",
      element: createCreateModeTextElement(),
      mode: "create",
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS).session;
    const materializedSession = reduceCanvasTextSession(createSession, {
      type: "change-value",
      activeWorkbenchId: "workbench-1",
      nextValue: "Hello",
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS).session;
    const emptiedSession = reduceCanvasTextSession(materializedSession, {
      type: "change-value",
      activeWorkbenchId: "workbench-1",
      nextValue: "   ",
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS).session;

    const result = reduceCanvasTextSession(emptiedSession, {
      type: "commit",
      activeWorkbenchId: "workbench-1",
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS);

    expect(result.effects.map((effect) => effect.type)).toEqual([
      "clear-selection",
      "delete-created",
      "reset-session",
    ]);
    expect(result.session.status).toBe("idle");
    expect(result.session.id).toBeNull();
  });

  it("handles noop, wait, persist-source, and reset workbench transitions explicitly", () => {
    const started = reduceWithBegin();

    const noopResult = reduceCanvasTextSession(started, {
      type: "sync-environment",
      activeWorkbenchId: "workbench-1",
      availableWorkbenchIds: ["workbench-1"],
      hasEditingTextElement: true,
      isEditingTextSelected: true,
      isSessionElementEditable: true,
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS);
    expect(noopResult.session.status).toBe("editing");
    expect(noopResult.effects).toEqual([]);

    const waitResult = reduceCanvasTextSession(started, {
      type: "sync-environment",
      activeWorkbenchId: null,
      availableWorkbenchIds: ["workbench-1"],
      hasEditingTextElement: true,
      isEditingTextSelected: false,
      isSessionElementEditable: true,
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS);
    expect(waitResult.session.status).toBe("waiting");

    const persistResult = reduceCanvasTextSession(started, {
      type: "sync-environment",
      activeWorkbenchId: "workbench-2",
      availableWorkbenchIds: ["workbench-1", "workbench-2"],
      hasEditingTextElement: true,
      isEditingTextSelected: false,
      isSessionElementEditable: true,
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS);
    const persistEffect = expectSingleEffect(persistResult.effects, "upsert-draft");
    expect(persistResult.session.status).toBe("persisting-source");
    expect(persistEffect.reason).toBe("persist-source");

    const resetResult = reduceCanvasTextSession(started, {
      type: "sync-environment",
      activeWorkbenchId: "workbench-2",
      availableWorkbenchIds: ["workbench-2"],
      hasEditingTextElement: false,
      isEditingTextSelected: false,
      isSessionElementEditable: true,
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS);
    expect(resetResult.session.status).toBe("idle");
    expect(resetResult.session.id).toBeNull();
  });

  it("rolls back existing text after a persisted draft is cancelled", () => {
    const started = reduceWithBegin();
    const changed = reduceCanvasTextSession(started, {
      type: "update-draft",
      activeWorkbenchId: "workbench-1",
      updater: (element) => ({
        ...element,
        color: "#ff5500",
      }),
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS).session;
    const persisting = reduceCanvasTextSession(changed, {
      type: "sync-environment",
      activeWorkbenchId: "workbench-2",
      availableWorkbenchIds: ["workbench-1", "workbench-2"],
      hasEditingTextElement: true,
      isEditingTextSelected: false,
      isSessionElementEditable: true,
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS).session;
    const persisted = reduceCanvasTextSession(persisting, {
      type: "source-persist-finished",
      activeWorkbenchId: "workbench-1",
      availableWorkbenchIds: ["workbench-1", "workbench-2"],
      didPersistDraft: true,
      sessionToken: persisting.sessionToken,
      transitionToken: persisting.transitionToken,
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS).session;

    const result = reduceCanvasTextSession(persisted, {
      type: "cancel",
      availableWorkbenchIds: ["workbench-1", "workbench-2"],
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS);

    const rollbackEffect = expectSingleEffect(result.effects, "rollback-existing");
    expect(rollbackEffect.element.color).toBe("#ffffff");
    expect(result.session.status).toBe("idle");
  });

  it("ignores late source-persist completions after the session token changes", () => {
    const started = reduceWithBegin();
    const persistingResult = reduceCanvasTextSession(started, {
      type: "sync-environment",
      activeWorkbenchId: "workbench-2",
      availableWorkbenchIds: ["workbench-1", "workbench-2"],
      hasEditingTextElement: true,
      isEditingTextSelected: false,
      isSessionElementEditable: true,
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS);
    const replacementResult = reduceCanvasTextSession(persistingResult.session, {
      type: "begin",
      activeWorkbenchId: "workbench-1",
      element: createRenderableTextElement({ id: "text-2" }),
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS);

    const lateCompletion = reduceCanvasTextSession(replacementResult.session, {
      type: "source-persist-finished",
      activeWorkbenchId: "workbench-1",
      availableWorkbenchIds: ["workbench-1", "workbench-2"],
      didPersistDraft: true,
      sessionToken: persistingResult.session.sessionToken,
      transitionToken: persistingResult.session.transitionToken,
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS);

    expect(lateCompletion.effects).toEqual([]);
    expect(lateCompletion.session.id).toBe("text-2");
    expect(lateCompletion.session.sessionToken).toBe(replacementResult.session.sessionToken);
  });

  it("keeps the source-persist completion alive after switching back to the source workbench", () => {
    const started = reduceWithBegin();
    const persisting = reduceCanvasTextSession(started, {
      type: "sync-environment",
      activeWorkbenchId: "workbench-2",
      availableWorkbenchIds: ["workbench-1", "workbench-2"],
      hasEditingTextElement: true,
      isEditingTextSelected: false,
      isSessionElementEditable: true,
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS).session;
    const switchedBack = reduceCanvasTextSession(persisting, {
      type: "sync-environment",
      activeWorkbenchId: "workbench-1",
      availableWorkbenchIds: ["workbench-1", "workbench-2"],
      hasEditingTextElement: true,
      isEditingTextSelected: true,
      isSessionElementEditable: true,
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS).session;

    expect(switchedBack.status).toBe("persisting-source");

    const completed = reduceCanvasTextSession(switchedBack, {
      type: "source-persist-finished",
      activeWorkbenchId: "workbench-1",
      availableWorkbenchIds: ["workbench-1", "workbench-2"],
      didPersistDraft: true,
      sessionToken: persisting.sessionToken,
      transitionToken: persisting.transitionToken,
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS).session;

    expect(completed.status).toBe("editing");
    expect(completed.hasPersistedExistingDraft).toBe(true);

    const cancelled = reduceCanvasTextSession(completed, {
      type: "cancel",
      availableWorkbenchIds: ["workbench-1", "workbench-2"],
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS);

    const rollbackEffect = expectSingleEffect(cancelled.effects, "rollback-existing");
    expect(rollbackEffect.element.id).toBe("text-1");
  });

  it("only selects a materialized created node when the active workbench owns the session", () => {
    const createSession = reduceCanvasTextSession(createCanvasTextSessionSnapshot(), {
      type: "begin",
      activeWorkbenchId: "workbench-1",
      element: createCreateModeTextElement(),
      mode: "create",
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS).session;
    const materialized = reduceCanvasTextSession(createSession, {
      type: "change-value",
      activeWorkbenchId: "workbench-1",
      nextValue: "Hello",
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS).session;

    const hiddenResult = reduceCanvasTextSession(materialized, {
      type: "sync-environment",
      activeWorkbenchId: "workbench-2",
      availableWorkbenchIds: ["workbench-1", "workbench-2"],
      hasEditingTextElement: true,
      isEditingTextSelected: false,
      isSessionElementEditable: true,
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS);
    expect(hiddenResult.effects.every((effect) => effect.type !== "select-element")).toBe(true);

    const visibleResult = reduceCanvasTextSession(materialized, {
      type: "sync-environment",
      activeWorkbenchId: "workbench-1",
      availableWorkbenchIds: ["workbench-1", "workbench-2"],
      hasEditingTextElement: true,
      isEditingTextSelected: false,
      isSessionElementEditable: true,
    }, TEST_TEXT_SESSION_REDUCER_OPTIONS);
    const selectEffect = expectSingleEffect(visibleResult.effects, "select-element");
    expect(selectEffect.elementId).toBe("text-create");
  });
});
