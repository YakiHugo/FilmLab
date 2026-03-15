import { describe, expect, it, vi } from "vitest";
import { PostgresChatStateRepository } from "./postgres";

describe("PostgresChatStateRepository#getPromptArtifactsForTurn", () => {
  it("maps stored prompt artifacts into the shared response shape", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ conversation_id: "conversation-1" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "artifact-1",
              run_id: "run-1",
              turn_id: "turn-1",
              version: 1,
              stage: "rewrite",
              target_key: null,
              attempt: null,
              compiler_version: "prompt-compiler.v1.2",
              capability_version: "prompt-capabilities.v1.2",
              original_prompt: "Studio portrait",
              prompt_intent: {
                preserve: ["face"],
                avoid: ["extra text"],
                styleDirectives: ["watercolor"],
                continuityTargets: ["subject"],
                editOps: [{ op: "remove", target: "cup" }],
              },
              turn_delta: {
                prompt: "Studio portrait",
                preserve: ["face"],
                avoid: [],
                styleDirectives: [],
                continuityTargets: ["subject"],
                editOps: [],
                referenceAssetIds: ["thread-asset-1"],
              },
              committed_state_before: null,
              candidate_state_after: {
                prompt: "Studio portrait",
                preserve: ["face"],
                avoid: [],
                styleDirectives: [],
                continuityTargets: ["subject"],
                editOps: [],
                referenceAssetIds: ["thread-asset-1"],
              },
              prompt_ir: {
                operation: "image.generate",
                goal: "Studio portrait",
                preserve: ["face"],
                negativeConstraints: ["extra text"],
                styleDirectives: ["watercolor"],
                continuityTargets: ["subject"],
                editOps: [{ op: "remove", target: "cup" }],
                sourceAssets: [],
                referenceAssets: [{ assetId: "thread-asset-1", role: "reference" }],
                assetRefs: [{ assetId: "thread-asset-1", role: "reference" }],
                referenceImages: [],
                output: {
                  aspectRatio: "1:1",
                  width: 1024,
                  height: 1024,
                  batchSize: 1,
                  style: "none",
                  stylePreset: null,
                },
              },
              compiled_prompt: "compiled prompt",
              dispatched_prompt: "dispatch prompt",
              provider_effective_prompt: "provider prompt",
              semantic_losses: [
                {
                  code: "NEGATIVE_PROMPT_DEGRADED_TO_TEXT",
                  severity: "warn",
                  fieldPath: "promptIR.negativeConstraints",
                  degradeMode: "merged",
                  userMessage: "Negative constraints were merged into the main prompt.",
                },
              ],
              warnings: ["Rewrite warning"],
              hashes: {
                stateHash: "state-1",
                irHash: "ir-1",
                prefixHash: "prefix-1",
                payloadHash: "payload-1",
              },
              created_at: "2026-03-15T00:00:00.000Z",
            },
            {
              id: "artifact-2",
              run_id: "run-1",
              turn_id: "turn-1",
              version: 2,
              stage: "dispatch",
              target_key: "dashscope:qwen-image-2.0-pro",
              attempt: 1,
              compiler_version: "prompt-compiler.v1.2",
              capability_version: "prompt-capabilities.v1.2",
              original_prompt: "Studio portrait",
              prompt_intent: null,
              turn_delta: null,
              committed_state_before: null,
              candidate_state_after: null,
              prompt_ir: null,
              compiled_prompt: "compiled prompt",
              dispatched_prompt: "dispatch prompt",
              provider_effective_prompt: "provider prompt",
              semantic_losses: [],
              warnings: [],
              hashes: {
                stateHash: "state-2",
                irHash: "ir-2",
                prefixHash: "prefix-2",
                payloadHash: "payload-2",
              },
              created_at: "2026-03-15T00:00:01.000Z",
            },
          ],
        }),
      end: vi.fn(),
    };

    const repository = new PostgresChatStateRepository(pool as never);
    (
      repository as unknown as {
        ensureReady: ReturnType<typeof vi.fn>;
      }
    ).ensureReady = vi.fn().mockResolvedValue(undefined);

    const artifacts = await repository.getPromptArtifactsForTurn("user-1", "turn-1");

    expect(artifacts).toEqual({
      turnId: "turn-1",
      versions: [
        expect.objectContaining({
          id: "artifact-1",
          version: 1,
          stage: "rewrite",
          promptIntent: {
            preserve: ["face"],
            avoid: ["extra text"],
            styleDirectives: ["watercolor"],
            continuityTargets: ["subject"],
            editOps: [{ op: "remove", target: "cup" }],
          },
          turnDelta: expect.objectContaining({
            prompt: "Studio portrait",
            referenceAssetIds: ["thread-asset-1"],
          }),
          promptIR: expect.objectContaining({
            operation: "image.generate",
            goal: "Studio portrait",
          }),
          warnings: ["Rewrite warning"],
        }),
        expect.objectContaining({
          id: "artifact-2",
          version: 2,
          stage: "dispatch",
          targetKey: "dashscope:qwen-image-2.0-pro",
          attempt: 1,
        }),
      ],
    });
  });

  it("returns null for hidden turns without loading prompt versions", async () => {
    const pool = {
      query: vi.fn().mockResolvedValueOnce({
        rows: [],
      }),
      end: vi.fn(),
    };

    const repository = new PostgresChatStateRepository(pool as never);
    (
      repository as unknown as {
        ensureReady: ReturnType<typeof vi.fn>;
      }
    ).ensureReady = vi.fn().mockResolvedValue(undefined);

    const artifacts = await repository.getPromptArtifactsForTurn("user-1", "turn-hidden");

    expect(artifacts).toBeNull();
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("AND t.is_hidden = FALSE"),
      ["turn-hidden", "user-1"]
    );
  });
});
