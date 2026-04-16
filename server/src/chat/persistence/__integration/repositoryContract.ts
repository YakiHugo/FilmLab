import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ChatConversationNotFoundError,
  ChatPromptStateConflictError,
} from "../types";
import type { ChatStateRepository } from "../types";
import { createGenerationInput } from "./contractFixtures";

export interface RepositoryContractOptions {
  make: () => Promise<ChatStateRepository> | ChatStateRepository;
  teardown?: (repository: ChatStateRepository) => Promise<void> | void;
}

export const describeRepositoryContract = (
  name: string,
  options: RepositoryContractOptions
): void => {
  describe(`${name} - ChatStateRepository contract`, () => {
    let repository: ChatStateRepository;

    beforeEach(async () => {
      repository = await options.make();
    });

    afterEach(async () => {
      if (options.teardown) {
        await options.teardown(repository);
      } else {
        await repository.close();
      }
    });

    describe("conversation lifecycle", () => {
      it("reuses the active conversation across calls for the same user", async () => {
        const first = await repository.getOrCreateActiveConversation("user-1");
        const second = await repository.getOrCreateActiveConversation("user-1");
        const other = await repository.getOrCreateActiveConversation("user-2");

        expect(second.id).toBe(first.id);
        expect(other.id).not.toBe(first.id);
      });

      it("returns null when looking up a conversation the caller does not own", async () => {
        const owned = await repository.getOrCreateActiveConversation("user-1");

        expect(await repository.getConversationById("user-1", owned.id)).not.toBeNull();
        expect(await repository.getConversationById("user-2", owned.id)).toBeNull();
      });

      it("clears the active conversation and preserves prior turns in the archived snapshot", async () => {
        const current = await repository.getOrCreateActiveConversation("user-1");
        await repository.createGeneration(
          createGenerationInput({ conversationId: current.id, runId: "run-1" })
        );

        const cleared = await repository.clearActiveConversation("user-1");
        const archived = await repository.getConversationSnapshot("user-1", current.id);

        expect(cleared.id).not.toBe(current.id);
        expect(cleared.turns).toEqual([]);
        expect(cleared.jobs).toEqual([]);
        expect(archived.id).toBe(current.id);
        expect(archived.turns).toHaveLength(1);
      });
    });

    describe("turn and generation lifecycle", () => {
      it("persists successful generations with provider warnings and final results", async () => {
        const conversation = await repository.getOrCreateActiveConversation("user-1");

        await repository.createGeneration(
          createGenerationInput({
            conversationId: conversation.id,
            turnId: "turn-1",
            jobId: "job-1",
            runId: "run-1",
            attemptId: "attempt-1",
          })
        );
        await repository.completeGenerationSuccess({
          conversationId: conversation.id,
          turnId: "turn-1",
          jobId: "job-1",
          runId: "run-1",
          attemptId: "attempt-1",
          logicalModel: "image.seedream.v5",
          deploymentId: "ark-seedream-v5-primary",
          runtimeProvider: "ark",
          providerModel: "doubao-seedream-5-0-260128",
          providerRequestId: "req-1",
          warnings: ["provider warning"],
          completedAt: "2026-03-12T00:00:05.000Z",
          assets: [
            {
              id: "thread-asset-1",
              turnId: "turn-1",
              runId: "run-1",
              assetType: "image",
              label: "Generated image 1",
              metadata: {},
              locators: [],
              createdAt: "2026-03-12T00:00:05.000Z",
            },
          ],
          assetEdges: [],
          run: {
            status: "completed",
            prompt: {
              originalPrompt: "Studio portrait",
              compiledPrompt: "Studio portrait",
              dispatchedPrompt: "Studio portrait",
              providerEffectivePrompt: "Studio portrait",
              semanticLosses: [],
              warnings: [],
            },
            assetIds: ["thread-asset-1"],
            referencedAssetIds: [],
            telemetry: {
              traceId: "trace-run-1",
              providerRequestId: "req-1",
              providerTaskId: null,
              latencyMs: 5000,
            },
            executedTarget: {
              modelId: "seedream-v5",
              logicalModel: "image.seedream.v5",
              deploymentId: "ark-seedream-v5-primary",
              runtimeProvider: "ark",
              providerModel: "doubao-seedream-5-0-260128",
              pinned: false,
            },
          },
          results: [
            {
              id: "result-1",
              imageUrl: "/api/assets/thread-asset-1/original?token=secret-token",
              imageId: null,
              runtimeProvider: "ark",
              providerModel: "doubao-seedream-5-0-260128",
              mimeType: "image/png",
              revisedPrompt: null,
              index: 0,
              assetId: "thread-asset-1",
              saved: true,
            },
          ],
        });

        const snapshot = await repository.getConversationSnapshot("user-1", conversation.id);
        const turn = snapshot.turns.find((entry) => entry.id === "turn-1");

        expect(turn).toMatchObject({
          status: "done",
          warnings: ["provider warning"],
          results: [
            expect.objectContaining({
              id: "result-1",
              assetId: "thread-asset-1",
              saved: true,
            }),
          ],
        });
        expect(snapshot.assets.find((asset) => asset.id === "thread-asset-1")).toBeTruthy();
      });

      it("records the retry lineage when a retry fails", async () => {
        const conversation = await repository.getOrCreateActiveConversation("user-1");

        await repository.createGeneration(
          createGenerationInput({
            conversationId: conversation.id,
            turnId: "turn-1",
            jobId: "job-1",
            runId: "run-1",
            attemptId: "attempt-1",
          })
        );
        await repository.completeGenerationSuccess({
          conversationId: conversation.id,
          turnId: "turn-1",
          jobId: "job-1",
          runId: "run-1",
          attemptId: "attempt-1",
          logicalModel: "image.seedream.v5",
          deploymentId: "ark-seedream-v5-primary",
          runtimeProvider: "ark",
          providerModel: "doubao-seedream-5-0-260128",
          warnings: [],
          completedAt: "2026-03-12T00:00:05.000Z",
          assets: [],
          assetEdges: [],
          run: {
            status: "completed",
            prompt: null,
            assetIds: [],
            referencedAssetIds: [],
            telemetry: {
              traceId: "trace-run-1",
              providerRequestId: null,
              providerTaskId: null,
              latencyMs: 100,
            },
            executedTarget: null,
          },
          results: [],
        });

        await repository.createGeneration(
          createGenerationInput({
            conversationId: conversation.id,
            turnId: "turn-2",
            jobId: "job-2",
            runId: "run-2",
            attemptId: "attempt-2",
            retryOfTurnId: "turn-1",
          })
        );
        await repository.completeGenerationFailure({
          conversationId: conversation.id,
          turnId: "turn-2",
          jobId: "job-2",
          runId: "run-2",
          attemptId: "attempt-2",
          error: "provider blocked",
          completedAt: "2026-03-12T00:01:00.000Z",
        });

        const snapshot = await repository.getConversationSnapshot("user-1", conversation.id);
        const retry = snapshot.turns.find((entry) => entry.id === "turn-2");

        expect(retry).toMatchObject({
          retryOfTurnId: "turn-1",
          status: "error",
          error: "provider blocked",
          results: [],
        });
      });

      it("hides deleted turns from the snapshot without breaking completion of an in-flight run", async () => {
        const conversation = await repository.getOrCreateActiveConversation("user-1");

        await repository.createGeneration(
          createGenerationInput({ conversationId: conversation.id })
        );

        const deletedSnapshot = await repository.deleteTurn("user-1", "turn-1");
        expect(deletedSnapshot?.turns).toEqual([]);
        expect(await repository.turnExists("user-1", conversation.id, "turn-1")).toBe(false);

        await repository.completeGenerationFailure({
          conversationId: conversation.id,
          turnId: "turn-1",
          jobId: "job-1",
          runId: "run-1",
          attemptId: "attempt-1",
          error: "provider blocked",
          completedAt: "2026-03-12T00:00:30.000Z",
        });

        const refreshed = await repository.getConversationSnapshot("user-1", conversation.id);
        expect(refreshed.turns).toEqual([]);
        expect(refreshed.jobs).toEqual([]);
      });
    });

    describe("asset and edge persistence", () => {
      it("returns assets and edges scoped to visible runs in the snapshot", async () => {
        const conversation = await repository.getOrCreateActiveConversation("user-1");

        await repository.createGeneration(
          createGenerationInput({ conversationId: conversation.id })
        );
        await repository.completeGenerationSuccess({
          conversationId: conversation.id,
          turnId: "turn-1",
          jobId: "job-1",
          runId: "run-1",
          attemptId: "attempt-1",
          logicalModel: "image.seedream.v5",
          deploymentId: "ark-seedream-v5-primary",
          runtimeProvider: "ark",
          providerModel: "doubao-seedream-5-0-260128",
          warnings: [],
          completedAt: "2026-03-12T00:00:05.000Z",
          assets: [
            {
              id: "asset-a",
              turnId: "turn-1",
              runId: "run-1",
              assetType: "image",
              label: null,
              metadata: {},
              locators: [
                {
                  id: "locator-a",
                  assetId: "asset-a",
                  locatorType: "generated_image_store",
                  locatorValue: "store/asset-a",
                  mimeType: "image/png",
                  expiresAt: null,
                },
              ],
              createdAt: "2026-03-12T00:00:05.000Z",
            },
            {
              id: "asset-b",
              turnId: "turn-1",
              runId: "run-1",
              assetType: "image",
              label: null,
              metadata: {},
              locators: [],
              createdAt: "2026-03-12T00:00:05.000Z",
            },
          ],
          assetEdges: [
            {
              id: "edge-1",
              sourceAssetId: "asset-a",
              targetAssetId: "asset-b",
              edgeType: "variant_of",
              turnId: "turn-1",
              runId: "run-1",
              createdAt: "2026-03-12T00:00:05.000Z",
            },
          ],
          run: {
            status: "completed",
            prompt: null,
            assetIds: ["asset-a", "asset-b"],
            referencedAssetIds: [],
            telemetry: {
              traceId: "trace-run-1",
              providerRequestId: null,
              providerTaskId: null,
              latencyMs: 5000,
            },
            executedTarget: null,
          },
          results: [],
        });

        const snapshot = await repository.getConversationSnapshot("user-1", conversation.id);
        expect(snapshot.assets.map((asset) => asset.id).sort()).toEqual(["asset-a", "asset-b"]);
        expect(snapshot.assetEdges).toHaveLength(1);
        expect(snapshot.assetEdges[0]).toMatchObject({
          sourceAssetId: "asset-a",
          targetAssetId: "asset-b",
          edgeType: "variant_of",
        });

        await repository.deleteTurn("user-1", "turn-1");
        const hidden = await repository.getConversationSnapshot("user-1", conversation.id);
        expect(hidden.assets).toEqual([]);
        expect(hidden.assetEdges).toEqual([]);
      });
    });

    describe("prompt-version audit", () => {
      it("returns ordered prompt artifacts only for visible turns owned by the caller", async () => {
        const conversation = await repository.getOrCreateActiveConversation("user-1");
        const otherConversation = await repository.getOrCreateActiveConversation("user-2");

        await repository.createGeneration(
          createGenerationInput({
            conversationId: conversation.id,
            turnId: "turn-1",
            runId: "run-1",
          })
        );
        await repository.createPromptVersions({
          conversationId: conversation.id,
          versions: [
            {
              id: "artifact-2",
              runId: "run-1",
              turnId: "turn-1",
              traceId: "trace-run-1",
              version: 2,
              stage: "dispatch",
              targetKey: "dashscope:qwen-image-2.0-pro",
              attempt: 1,
              compilerVersion: "prompt-compiler.v1.2",
              capabilityVersion: "prompt-capabilities.v1.2",
              originalPrompt: "Studio portrait",
              promptIntent: null,
              turnDelta: null,
              committedStateBefore: null,
              candidateStateAfter: null,
              promptIR: null,
              compiledPrompt: "dispatch prompt",
              dispatchedPrompt: "dispatch prompt",
              providerEffectivePrompt: null,
              semanticLosses: [],
              warnings: [],
              hashes: {
                stateHash: "state-2",
                irHash: "ir-2",
                prefixHash: "prefix-2",
                payloadHash: "payload-2",
              },
              createdAt: "2026-03-12T00:00:02.000Z",
            },
            {
              id: "artifact-1",
              runId: "run-1",
              turnId: "turn-1",
              traceId: "trace-run-1",
              version: 1,
              stage: "rewrite",
              targetKey: null,
              attempt: null,
              compilerVersion: "prompt-compiler.v1.2",
              capabilityVersion: "prompt-capabilities.v1.2",
              originalPrompt: "Studio portrait",
              promptIntent: null,
              turnDelta: null,
              committedStateBefore: null,
              candidateStateAfter: null,
              promptIR: null,
              compiledPrompt: null,
              dispatchedPrompt: null,
              providerEffectivePrompt: null,
              semanticLosses: [],
              warnings: [],
              hashes: {
                stateHash: "state-1",
                irHash: "ir-1",
                prefixHash: "prefix-1",
                payloadHash: "payload-1",
              },
              createdAt: "2026-03-12T00:00:01.000Z",
            },
          ],
        });

        await repository.createGeneration(
          createGenerationInput({
            conversationId: otherConversation.id,
            turnId: "turn-2",
            runId: "run-2",
          })
        );
        await repository.createPromptVersions({
          conversationId: otherConversation.id,
          versions: [
            {
              id: "artifact-other",
              runId: "run-2",
              turnId: "turn-2",
              traceId: "trace-run-2",
              version: 1,
              stage: "rewrite",
              targetKey: null,
              attempt: null,
              compilerVersion: "prompt-compiler.v1.2",
              capabilityVersion: "prompt-capabilities.v1.2",
              originalPrompt: "Other prompt",
              promptIntent: null,
              turnDelta: null,
              committedStateBefore: null,
              candidateStateAfter: null,
              promptIR: null,
              compiledPrompt: null,
              dispatchedPrompt: null,
              providerEffectivePrompt: null,
              semanticLosses: [],
              warnings: [],
              hashes: {
                stateHash: "state-other",
                irHash: "ir-other",
                prefixHash: "prefix-other",
                payloadHash: "payload-other",
              },
              createdAt: "2026-03-12T00:00:03.000Z",
            },
          ],
        });

        const artifacts = await repository.getPromptArtifactsForTurn("user-1", "turn-1");
        expect(artifacts).toEqual({
          turnId: "turn-1",
          versions: [
            expect.objectContaining({ id: "artifact-1", version: 1, stage: "rewrite" }),
            expect.objectContaining({ id: "artifact-2", version: 2, stage: "dispatch" }),
          ],
        });

        expect(await repository.getPromptArtifactsForTurn("user-1", "turn-2")).toBeNull();

        await repository.deleteTurn("user-1", "turn-1");
        expect(await repository.getPromptArtifactsForTurn("user-1", "turn-1")).toBeNull();
      });

      it("aggregates artifact-level semantic loss occurrences separately from turn counts", async () => {
        const conversation = await repository.getOrCreateActiveConversation("user-1");

        await repository.createGeneration(
          createGenerationInput({
            conversationId: conversation.id,
            turnId: "turn-1",
            jobId: "job-1",
            runId: "run-1",
            attemptId: "attempt-1",
          })
        );
        await repository.createPromptVersions({
          conversationId: conversation.id,
          versions: [
            {
              id: "artifact-compile",
              runId: "run-1",
              turnId: "turn-1",
              traceId: "trace-run-1",
              version: 1,
              stage: "compile",
              targetKey: "dashscope:qwen-image-2.0-pro",
              attempt: null,
              compilerVersion: "prompt-compiler.v1.3",
              capabilityVersion: "prompt-compiler-facts.v1",
              originalPrompt: "Studio portrait",
              promptIntent: null,
              turnDelta: null,
              committedStateBefore: null,
              candidateStateAfter: null,
              promptIR: null,
              compiledPrompt: null,
              dispatchedPrompt: null,
              providerEffectivePrompt: null,
              semanticLosses: [
                {
                  code: "NEGATIVE_PROMPT_DEGRADED_TO_TEXT",
                  severity: "warn",
                  fieldPath: "promptIR.negativeConstraints",
                  degradeMode: "merged",
                  userMessage: "Negative constraints were merged.",
                },
              ],
              warnings: [],
              hashes: {
                stateHash: "state-1",
                irHash: "ir-1",
                prefixHash: "prefix-1",
                payloadHash: "payload-1",
              },
              createdAt: "2026-03-12T00:00:01.000Z",
            },
            {
              id: "artifact-dispatch",
              runId: "run-1",
              turnId: "turn-1",
              traceId: "trace-run-1",
              version: 2,
              stage: "dispatch",
              targetKey: "dashscope:qwen-image-2.0-pro",
              attempt: 1,
              compilerVersion: "prompt-compiler.v1.3",
              capabilityVersion: "prompt-compiler-facts.v1",
              originalPrompt: "Studio portrait",
              promptIntent: null,
              turnDelta: null,
              committedStateBefore: null,
              candidateStateAfter: null,
              promptIR: null,
              compiledPrompt: null,
              dispatchedPrompt: null,
              providerEffectivePrompt: null,
              semanticLosses: [
                {
                  code: "NEGATIVE_PROMPT_DEGRADED_TO_TEXT",
                  severity: "warn",
                  fieldPath: "promptIR.negativeConstraints",
                  degradeMode: "merged",
                  userMessage: "Negative constraints were merged.",
                },
              ],
              warnings: [],
              hashes: {
                stateHash: "state-2",
                irHash: "ir-2",
                prefixHash: "prefix-2",
                payloadHash: "payload-2",
              },
              createdAt: "2026-03-12T00:00:02.000Z",
            },
          ],
        });

        const summary = await repository.getPromptObservabilityForConversation(
          "user-1",
          conversation.id
        );

        expect(summary?.overview).toEqual({
          totalTurns: 1,
          turnsWithArtifacts: 1,
          degradedTurns: 1,
          fallbackTurns: 0,
        });
        expect(summary?.semanticLosses).toEqual([
          {
            code: "NEGATIVE_PROMPT_DEGRADED_TO_TEXT",
            occurrenceCount: 2,
            turnCount: 1,
            latestCreatedAt: "2026-03-12T00:00:02.000Z",
          },
        ]);
        expect(summary?.targets).toEqual([
          {
            targetKey: "dashscope:qwen-image-2.0-pro",
            compileArtifactCount: 1,
            dispatchArtifactCount: 1,
            degradedDispatchCount: 1,
            latestCreatedAt: "2026-03-12T00:00:02.000Z",
          },
        ]);
      });

      it("returns null observability when no active conversation exists for the user", async () => {
        expect(await repository.getPromptObservabilityForConversation("user-1")).toBeNull();
      });

      it("returns a zeroed observability overview for a conversation with only hidden turns", async () => {
        const conversation = await repository.getOrCreateActiveConversation("user-1");
        await repository.createGeneration(
          createGenerationInput({
            conversationId: conversation.id,
            turnId: "turn-hidden",
            jobId: "job-hidden",
            runId: "run-hidden",
            attemptId: "attempt-hidden",
          })
        );
        await repository.deleteTurn("user-1", "turn-hidden");

        const summary = await repository.getPromptObservabilityForConversation(
          "user-1",
          conversation.id
        );
        expect(summary).toEqual({
          conversationId: conversation.id,
          overview: {
            totalTurns: 0,
            turnsWithArtifacts: 0,
            degradedTurns: 0,
            fallbackTurns: 0,
          },
          semanticLosses: [],
          targets: [],
          turns: [],
        });
      });
    });

    describe("prompt-state CAS and accept-turn", () => {
      it("guards prompt-state updates with the expected revision and surfaces conflicts", async () => {
        const conversation = await repository.getOrCreateActiveConversation("user-1");

        await repository.updateConversationPromptState({
          conversationId: conversation.id,
          promptState: {
            committed: {
              prompt: "first",
              preserve: [],
              avoid: [],
              styleDirectives: [],
              continuityTargets: [],
              editOps: [],
              referenceAssetIds: [],
            },
            candidate: null,
            baseAssetId: null,
            candidateTurnId: null,
            revision: 1,
          },
          expectedRevision: 0,
          updatedAt: "2026-03-12T00:00:10.000Z",
        });

        await expect(
          repository.updateConversationPromptState({
            conversationId: conversation.id,
            promptState: {
              committed: {
                prompt: "second",
                preserve: [],
                avoid: [],
                styleDirectives: [],
                continuityTargets: [],
                editOps: [],
                referenceAssetIds: [],
              },
              candidate: null,
              baseAssetId: null,
              candidateTurnId: null,
              revision: 2,
            },
            expectedRevision: 0,
            updatedAt: "2026-03-12T00:00:20.000Z",
          })
        ).rejects.toBeInstanceOf(ChatPromptStateConflictError);

        await expect(
          repository.updateConversationPromptState({
            conversationId: "missing-conversation",
            promptState: {
              committed: {
                prompt: null,
                preserve: [],
                avoid: [],
                styleDirectives: [],
                continuityTargets: [],
                editOps: [],
                referenceAssetIds: [],
              },
              candidate: null,
              baseAssetId: null,
              candidateTurnId: null,
              revision: 0,
            },
            expectedRevision: 0,
            updatedAt: "2026-03-12T00:00:30.000Z",
          })
        ).rejects.toBeInstanceOf(ChatConversationNotFoundError);
      });

      it("accepts an older turn by restoring its compiler state as the committed base", async () => {
        const conversation = await repository.getOrCreateActiveConversation("user-1");

        await repository.createGeneration(
          createGenerationInput({
            conversationId: conversation.id,
            turnId: "turn-1",
            jobId: "job-1",
            runId: "run-1",
            attemptId: "attempt-1",
          })
        );
        await repository.completeGenerationSuccess({
          conversationId: conversation.id,
          turnId: "turn-1",
          jobId: "job-1",
          runId: "run-1",
          attemptId: "attempt-1",
          logicalModel: "image.seedream.v5",
          deploymentId: "ark-seedream-v5-primary",
          runtimeProvider: "ark",
          providerModel: "doubao-seedream-5-0-260128",
          warnings: [],
          completedAt: "2026-03-12T00:00:05.000Z",
          assets: [
            {
              id: "thread-asset-1",
              turnId: "turn-1",
              runId: "run-1",
              assetType: "image",
              label: "Generated image 1",
              metadata: {},
              locators: [],
              createdAt: "2026-03-12T00:00:05.000Z",
            },
          ],
          assetEdges: [],
          run: {
            status: "completed",
            prompt: {
              originalPrompt: "Prompt one",
              compiledPrompt: "Prompt one",
              dispatchedPrompt: "Prompt one",
              providerEffectivePrompt: "Prompt one",
              semanticLosses: [],
              warnings: [],
            },
            assetIds: ["thread-asset-1"],
            referencedAssetIds: [],
            telemetry: {
              traceId: "trace-run-1",
              providerRequestId: null,
              providerTaskId: null,
              latencyMs: 5000,
            },
            executedTarget: {
              modelId: "seedream-v5",
              logicalModel: "image.seedream.v5",
              deploymentId: "ark-seedream-v5-primary",
              runtimeProvider: "ark",
              providerModel: "doubao-seedream-5-0-260128",
              pinned: false,
            },
          },
          results: [
            {
              id: "result-1",
              imageUrl: "/api/assets/thread-asset-1/original?token=secret-token",
              imageId: null,
              runtimeProvider: "ark",
              providerModel: "doubao-seedream-5-0-260128",
              mimeType: "image/png",
              revisedPrompt: null,
              index: 0,
              assetId: "thread-asset-1",
              saved: true,
            },
          ],
        });
        await repository.createPromptVersions({
          conversationId: conversation.id,
          versions: [
            {
              id: "prompt-version-1",
              runId: "run-1",
              turnId: "turn-1",
              traceId: "trace-run-1",
              version: 1,
              stage: "dispatch",
              targetKey: "ark:doubao-seedream-5-0-260128",
              attempt: 1,
              compilerVersion: "prompt-compiler.v1.1",
              capabilityVersion: "prompt-capabilities.v1",
              originalPrompt: "Prompt one",
              promptIntent: null,
              turnDelta: null,
              committedStateBefore: null,
              candidateStateAfter: {
                prompt: "Prompt one",
                preserve: ["keep face"],
                avoid: ["extra text"],
                styleDirectives: ["watercolor"],
                continuityTargets: ["subject"],
                editOps: [],
                referenceAssetIds: ["thread-asset-1"],
              },
              promptIR: null,
              compiledPrompt: "Prompt one",
              dispatchedPrompt: "Prompt one",
              providerEffectivePrompt: null,
              semanticLosses: [],
              warnings: [],
              hashes: {
                stateHash: "state-1",
                irHash: "ir-1",
                prefixHash: "prefix-1",
                payloadHash: "payload-1",
              },
              createdAt: "2026-03-12T00:00:05.000Z",
            },
          ],
        });
        await repository.updateConversationPromptState({
          conversationId: conversation.id,
          promptState: {
            committed: {
              prompt: "Later prompt",
              preserve: ["later preserve"],
              avoid: [],
              styleDirectives: [],
              continuityTargets: ["style"],
              editOps: [],
              referenceAssetIds: [],
            },
            candidate: {
              prompt: "Unaccepted candidate",
              preserve: ["candidate preserve"],
              avoid: [],
              styleDirectives: [],
              continuityTargets: ["composition"],
              editOps: [],
              referenceAssetIds: [],
            },
            baseAssetId: null,
            candidateTurnId: "turn-2",
            revision: 1,
          },
          expectedRevision: 0,
          updatedAt: "2026-03-12T00:01:00.000Z",
        });

        const accepted = await repository.acceptConversationTurn({
          userId: "user-1",
          turnId: "turn-1",
          assetId: "thread-asset-1",
          acceptedAt: "2026-03-12T00:02:00.000Z",
        });

        expect(accepted.thread.promptState).toMatchObject({
          committed: {
            prompt: "Prompt one",
            preserve: ["keep face"],
            avoid: ["extra text"],
            styleDirectives: ["watercolor"],
            continuityTargets: ["subject"],
            editOps: [],
            referenceAssetIds: ["thread-asset-1"],
          },
          candidate: null,
          candidateTurnId: null,
          baseAssetId: "thread-asset-1",
        });
        expect(
          accepted.assetEdges.some((edge) => edge.edgeType === "accepted_as_final")
        ).toBe(true);
      });
    });
  });
};
