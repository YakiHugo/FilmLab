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

## Validation Boundary

- Unit or component coverage protects any new pure project-card state derivation.
- Browser validation proves local project resume, guarded new-creation navigation, no blank-workbench side effect, empty/loading states, and the existing new-image path.
- Full validation remains `pnpm verify` plus `pnpm dead-code`; dead-code output is compared with the pre-task baseline because the repository already has known findings.

## Handoff

Keep each slice independently validated and committed. Record modified files, browser evidence, and the first actionable failure here before advancing the next slice.
