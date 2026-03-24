# Canvas Document V3 Rewrite

This note serves two purposes:

- Sections above `Execution Record` capture the current stable canvas document architecture.
- Sections from `Execution Record` downward capture this rewrite task's execution history.

## Task Scope

- Baseline commit: `bf4e949`
- Branch: `feat/canvas-optimize`
- Scope: rewrite the canvas document core to a v3 persisted model with canonical hierarchy,
  pure resolve projection, and explicit change-set based history.

## Stable Architecture

### Core Decisions

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

### Architecture Surface

This section captures the current post-rewrite canvas document architecture so later sessions do
not need to reconstruct it from commits.

#### Persisted Source Of Truth

- `CanvasWorkbenchSnapshot` is `version: 3`.
- Persisted hierarchy truth is `rootIds + groupChildren`.
- Persisted nodes store local semantic data plus `transform`; they do not persist runtime
  `parentId`, world coordinates, bounds, or effective flags.

#### Runtime Projection

- `resolveCanvasWorkbench` is a pure projection from persisted snapshot to runtime workbench.
- Runtime nodes expose derived `parentId`, world `x/y/rotation`, `bounds`,
  `effectiveLocked`, `effectiveVisible`, and `worldOpacity`.
- Resolve does not repair invalid hierarchy. Validation happens before runtime projection.

#### Write Path

- External writes still enter through `CanvasCommand`.
- `executeCanvasCommand` emits explicit forward and inverse `CanvasDocumentChangeSet`
  operations instead of snapshot diffs.
- The minimum document operations are:
  - `patchDocumentMeta`
  - `putNode`
  - `deleteNode`
  - `setRootOrder`
  - `setGroupChildren`

#### History And Replay

- History entries store `forwardChangeSet` and `inverseChangeSet`.
- Undo and redo replay change sets through `applyCanvasDocumentChangeSet`.
- Replay reapplies persisted changes and then reruns resolve so the runtime projection stays in
  sync with persisted truth.

#### Service Boundary

- `canvasWorkbenchService` remains the orchestration layer, not the semantic source of truth.
- The service is responsible for:
  - loading and normalizing stored workbenches
  - persisting snapshots
  - adapting editable/renderable nodes into command inputs
  - queueing mutations
  - duplicate/group/delete convenience flows
  - undo/redo integration

#### Compatibility Boundary

- Editable `CanvasNode` ingress values still carry `parentId` and optional `childIds` so the UI
  surface did not need a full rewrite.
- Those fields are compatibility hints only. Persistence normalizes them into v3 hierarchy
  semantics before saving.

### Module Map

- `src/types/canvas.ts`
  - Defines the v3 persisted schema, runtime renderable types, command protocol, and change-set
    contracts.
- `src/features/canvas/document/hierarchy.ts`
  - Normalizes legacy hierarchy hints into canonical `rootIds + groupChildren` and validates
    runtime hierarchy invariants.
- `src/features/canvas/document/migration.ts`
  - Converts legacy documents into v3 snapshots and immediately resolves them into runtime
    workbenches.
- `src/features/canvas/document/model.ts`
  - Provides snapshot extraction, node normalization, and shared document traversal helpers.
- `src/features/canvas/document/resolve.ts`
  - Projects persisted snapshots into runtime nodes with world transforms, bounds, and effective
    flags.
- `src/features/canvas/document/commands.ts`
  - Executes semantic commands and records explicit forward and inverse document change sets.
- `src/features/canvas/document/patches.ts`
  - Replays persisted change sets and reruns resolve.
- `src/features/canvas/store/canvasWorkbenchState.ts`
  - Maintains history stack semantics for command commits and undo/redo transitions.
- `src/features/canvas/store/canvasWorkbenchService.ts`
  - Orchestrates load, normalize, persist, adapter conversion, mutation queueing, and history
    replay.

### Critical Invariants

- Every persisted node id is unique and appears at most once in the hierarchy.
- Every id in `rootIds` and `groupChildren` must exist in `nodes`.
- Groups own ordering through `groupChildren[groupId]`; persisted group nodes do not store
  `childIds`.
- The hierarchy is acyclic.
- The runtime projection preserves current world-space semantics for move, group, ungroup, and
  reparent flows.
- Undo/redo must round-trip through forward/inverse change sets without drift.

## Execution Record

### Risk Notes

- This refactor crosses types, migration, resolve, command execution, history, and service
  adapters.
- UI/store entry points should remain stable where practical, but any code relying on persisted
  `childIds` or flat transform mirror fields will need adaptation.
- Existing tests cover many document semantics, but several store/runtime tests also assume
  version 2 document shapes and will need coordinated updates.

### Validation Notes

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

### Handoff Notes

- Keep the JSON tracker minimal and authoritative for execution status only.
- If a slice fails validation and is not fixed immediately, mark it `blocked` and record the
  first actionable failure here.
- No blockers remain in the plan-required validation set for the canvas rewrite. The extra app
  typecheck failure above is currently outside this rewrite surface.
