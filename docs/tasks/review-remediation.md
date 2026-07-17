# Review Remediation

## Scope

Fix the concrete bugs, dead code, and hotspots found in the 2026-07 codebase review. Nine slices live in the sibling JSON. `blockedBy` may reference task ids from `test-system-overhaul.json`; the DAG is global across both task files.

## Decisions

- Upscale is removed whole (front-end implementation, both schemas, router stub, UI branches, dead config knobs). Confirmed by the project owner over restoring it; consistent with the aggressive-retire rule. If upscale returns, it will be rebuilt on the model-registry architecture.
- Double sRGB decode fix: prefer deleting the two `srgb_to_linear` calls in `src/lib/gpu/wgsl/develop/geometry.wgsl` (its input is always the linear output of the inputDecode pass) after re-checking every geometry call site; the alternative is restoring the inputDecode/geometry mutual exclusion in `src/lib/gpu/orchestrator.ts::buildDevelopPasses`. Presets are re-tuned on the corrected baseline after the fix (owner-confirmed); no compensation curve on top of the bug.
- Signed chat image URLs: snapshots store asset references, not token-bearing URLs; the conversation projection signs fresh URLs via the asset service. Pre-launch, so no dual-read compatibility path.
- Cleanup boundaries: `dead-code-and-hygiene` deletes only code with no future consumer; the persistence-gateway reset and the pseudo-batch `upsertElementsInWorkbench` belong to `workbench-data-correctness` (they get wired or truly merged, not deleted); upscale has its own slice.
- Key fixes (`decode-double-srgb-fix`, `persistence-correctness`, `workbench-data-correctness`) follow the new test-authoring rules once `test-authoring-rules` lands: behavior tests by a non-implementer agent, adversarial cases first.

## Findings source

The review reports live in session history; each slice in JSON maps to a reviewed finding with file anchors. Notable anchors: `src/lib/gpu/orchestrator.ts::buildDevelopPasses` (decode chain), `src/features/canvas/store/canvasWorkbenchPersistenceGateway.ts` (unwired reset), `server/src/chat/application/imageGeneration/generatedAssets.ts` (URL freezing), `server/src/assets/repository.ts::saveAsset` (nested transaction).

## Handoff

- 2026-07-17: task pair created from the review plan. `dead-code-and-hygiene` claimed.
