# Product Continuity V1.1

## Outcome

FilmLab should treat a saved workbench as a product artifact, not merely as hidden reload state. The Studio entry will expose recent persisted workbenches for direct continuation, while starting a new creation from Canvas will return to the image-first input surface instead of creating an empty board.

## Product Boundary

This task adds local project continuity only. It does not add cross-device workbench sync, collaboration, folders, project duplication, cloud thumbnails, or a second persistence model. Local upload, paste, library selection, and optional AI generation remain the ways to start a new workbench.

## Decisions

- Reuse `CanvasWorkbenchListEntry` as the recent-project read model. Do not add a project repository or duplicate workbench metadata in the asset store.
- Open an existing project through `/canvas/$workbenchId`; route-first activation remains responsible for loading the full document.
- Route the Canvas new-creation action through the existing transition guard and back to Studio. It must not call `createWorkbench` before an image has been selected.
- Extend the existing industrial visual-compute language with compact project cards. Use the cover asset when available and a deterministic typographic fallback when it is not.
- Do not implement the old incremental Canvas preview proposal under the current single-image product boundary. A browser micro-benchmark measured one `MOVE_NODES` preview at roughly 0.07 ms for one node, 0.34 ms for ten, 2.78 ms for one hundred, 14.38 ms for five hundred, and 29.82 ms for one thousand. Revisit only when a reachable product flow regularly creates large scenes or an interaction trace shows missed frames.
- Keep scene/global rendering deferred until one concrete whole-scene use case defines state ownership, stage ordering, preview/export parity, and validation. Do not retain a generic implementation bucket as active work.

## Slice Notes

### Discovery

- The full V1 input-to-export flow passed browser inspection and the repository baseline passed `pnpm verify`.
- The Studio entry can create from recent assets but cannot reopen saved workbenches, even though the local store already maintains a workbench list.
- `CanvasAppBar` currently creates an empty workbench, contradicting the image-first product boundary.
- `CanvasWorkbenchPanel` is unreachable and reported by `pnpm dead-code`; its English sequence-oriented copy belongs to the retired general-canvas direction.
- `index.html` still identifies the product as an AI film-retouching coach and uses the Vite starter favicon.

### Project continuity

- Studio now derives recent-project cards from the existing workbench list and optional asset covers. Cards keep working when the source asset is still loading, missing, or fails to render.
- Existing projects open by canonical route. Canvas keeps the current runtime mounted behind an opaque route-loading state until the requested document becomes authoritative, preventing an old project from flashing or accepting input during a switch.
- New creation returns through the workbench transition guard to Studio. Route synchronization explicitly stops once navigation leaves `/canvas`, avoiding a race that previously restored the old document, and an unavailable deep link is excluded from fallback selection.
- Focused unit tests, TypeScript, and lint passed. Browser validation resumed persisted projects, returned to Studio without increasing the workbench count, and forced a delayed A/B switch that exposed only the loading state followed by the requested project.

### Release surface hygiene

- The document title and favicon now identify FilmLab Visual Compute rather than the retired AI film-coach prototype.
- Removed the unreachable workbench panel and only the new/switch/delete/sequence branches that existed to support it. Shared document patching remains because the separate story-panel model still consumes it.
- Focused tests, TypeScript, lint, and formatting passed. Browser inspection confirmed the new title, icon path, and recent-project surface. `pnpm dead-code` reduced the known unused-file baseline from 15 to 14 without adding a finding.

### Task ledger reconciliation

- Migrated the completed sensor harness into long-lived diagnostic, trace, baseline-review, and persisted-error decisions, then removed its finished task pair.
- Retired the generic Canvas preview and scene/global planning buckets. Preview keeps a single document authority and reopens only on reachable large scenes or measured missed frames; scene/global work reopens only from a concrete whole-scene use case with explicit ownership and parity boundaries.
- `docs/tasks` now contains only this active task pair.

### Validation and independent review

- The first independent semantic review found four real bugs: same-route recovery could be invalidated by its own mutation queue, the pending Canvas still accepted hidden input, IndexedDB read failure looked like a valid empty state, and only four persisted workbenches were reachable. Each finding was fixed with focused regression coverage.
- A follow-up review found one remaining global-input path in the text overlay. Route readiness now disables the overlay, text toolbar, viewport keyboard lifecycle, and document-level text-session listeners while preserving the transition guard. The final independent review returned `Approve` with no unresolved real bugs or rule violations.
- Browser validation reopened the fifth persisted workbench, recovered an unavailable deep link to the current valid workbench, and returned through “new work” without changing the persisted workbench count. The Studio surface exposed all five workbenches through its explicit expansion control.
- `pnpm verify` passed across lint, the complete test suite, and client/server builds. `pnpm dead-code` remained at the improved task baseline of 14 unused files and 84 unused exports, with no new finding from this slice.

## Validation Boundary

- Unit or component coverage protects any new pure project-card state derivation.
- Browser validation proves local project resume, guarded new-creation navigation, no blank-workbench side effect, empty/loading states, and the existing new-image path.
- Full validation remains `pnpm verify` plus `pnpm dead-code`; dead-code output is compared with the pre-task baseline because the repository already has known findings.

## Handoff

Keep each slice independently validated and committed. Record modified files, browser evidence, and the first actionable failure here before advancing the next slice.
