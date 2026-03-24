# Canvas Document V3 Rewrite

## Baseline

- Baseline commit: `bf4e949`
- Branch: `feat/canvas-optimize`
- Scope: rewrite the canvas document core to a v3 persisted model with canonical hierarchy,
  pure resolve projection, and explicit change-set based history.

## Architecture Decisions

- Persisted canvas documents stay exported as `CanvasWorkbenchSnapshot`, but move to `version: 3`.
- The persisted hierarchy uses `rootIds + groupChildren` as the only ordering/source-of-truth.
- Persisted nodes keep only local semantic data and `transform`; they no longer mirror flat
  `x/y/width/height/rotation` fields and no longer store `childIds`.
- Render/runtime nodes continue to expose `parentId`, world-space transforms, bounds, and
  effective flags, all derived by `resolve`.
- History moves from snapshot-diff patches to explicit forward/inverse change sets generated
  during command execution.
- Document validation and migration happen at the load/normalize boundary; `resolve` no longer
  repairs invalid structures.

## Critical Invariants

- Every persisted node id is unique and appears at most once in the hierarchy.
- Every id in `rootIds` and `groupChildren` must exist in `nodes`.
- Groups own ordering through `groupChildren[groupId]`; persisted group nodes do not store
  `childIds`.
- The hierarchy is acyclic.
- The runtime projection preserves current world-space semantics for move, group, ungroup, and
  reparent flows.
- Undo/redo must round-trip through forward/inverse change sets without drift.

## Risk Notes

- This refactor crosses types, migration, resolve, command execution, history, and service
  adapters.
- UI/store entry points should remain stable where practical, but any code relying on persisted
  `childIds` or flat transform mirror fields will need adaptation.
- Existing tests cover many document semantics, but several store/runtime tests also assume
  version 2 document shapes and will need coordinated updates.

## Validation Notes

- Per slice: run targeted canvas document tests first.
- Before final handoff: run `pnpm test`, `pnpm lint`, and `pnpm build`.
- Final cleanup also replaced the canvas workbench init-time persisted snapshot comparison with
  explicit deep equality instead of `JSON.stringify`.
- Post-implementation review added command guards for `GROUP_NODES` id collisions and invalid
  `REORDER_CHILDREN` sibling sets, with targeted regression tests.
- Targeted validation passed:
  - `pnpm vitest run src/features/canvas/document/commands.test.ts src/features/canvas/document/patches.test.ts src/features/canvas/document/resolve.test.ts src/features/canvas/store/canvasWorkbenchState.test.ts`
  - `pnpm vitest run src/stores/canvasStore.test.ts`
- Full validation results:
  - `pnpm test`: pass
  - `pnpm lint`: pass with pre-existing warnings outside the canvas rewrite scope
  - `pnpm build`: pass
 - Extra spot-check after review:
   - `pnpm exec tsc -p tsconfig.app.json --noEmit`: currently fails outside the canvas rewrite in
     `src/lib/ai/imageGeneration.ts` and `src/lib/ai/imageUpscale.ts` because `GeneratedImage`
     now requires `assetId`

## Handoff Notes

- Keep the JSON tracker minimal and authoritative for execution status only.
- If a slice fails validation and is not fixed immediately, mark it `blocked` and record the
  first actionable failure here.
- No blockers remain in the plan-required validation set for the canvas rewrite. The extra app
  typecheck failure above is currently outside this rewrite surface.
