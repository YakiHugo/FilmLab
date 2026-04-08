import { describe, expect, it } from "vitest";
import { toPromptArtifactRecord, type ChatPromptArtifactRow } from "./postgres/rows";

describe("prompt artifact row parsing", () => {
  it("reads canonical prompt IR input assets without legacy normalization", () => {
    const record = toPromptArtifactRecord({
      id: "artifact-1",
      run_id: "run-1",
      turn_id: "turn-1",
      trace_id: "trace-1",
      version: 1,
      stage: "rewrite",
      target_key: null,
      attempt: null,
      compiler_version: "prompt-compiler.v1.2",
      capability_version: "prompt-capabilities.v1.2",
      original_prompt: "Studio portrait",
      prompt_intent: null,
      turn_delta: null,
      committed_state_before: null,
      candidate_state_after: null,
      prompt_ir: {
        operation: "image.generate",
        goal: "Studio portrait",
        preserve: [],
        negativeConstraints: [],
        styleDirectives: [],
        continuityTargets: [],
        editOps: [],
        inputAssets: [
          {
            assetId: "thread-asset-1",
            binding: "guide",
            guideType: "style",
            weight: 0.25,
          },
        ],
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
      provider_effective_prompt: null,
      semantic_losses: [],
      warnings: [],
      hashes: {
        stateHash: "state-1",
        irHash: "ir-1",
        prefixHash: "prefix-1",
        payloadHash: "payload-1",
      },
      created_at: "2026-03-28T00:00:00.000Z",
    } satisfies ChatPromptArtifactRow);

    expect(record.promptIR?.inputAssets).toEqual([
      {
        assetId: "thread-asset-1",
        binding: "guide",
        guideType: "style",
        weight: 0.25,
      },
    ]);
    expect(record.promptIR?.referenceAssets).toEqual([
      {
        assetId: "thread-asset-1",
        binding: "guide",
        guideType: "style",
        weight: 0.25,
      },
    ]);
  });
});
