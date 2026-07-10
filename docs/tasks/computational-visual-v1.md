# Computational Visual V1

## Outcome

FilmLab V1 is an image-first computational visual studio. A first-time user can start from a local image, clipboard image, library asset, or AI generation; choose a visibly distinct computational direction; add lightweight semantic expression; select a social output ratio; and export a result that matches the preview. The canvas remains the compositor behind this flow instead of being the product's empty starting point.

## Product Boundary

The first version includes still images only. Its canonical loop is:

`input -> computational style -> semantic overlay -> social ratio -> export -> restore`

The published style surface is intentionally limited to four to six designed directions composed from the existing ASCII, halftone, signal-damage, develop, and palette capabilities. Controls expose only parameters that materially change the visual language.

Video timelines, general-purpose layout tooling, additional providers, 16-bit export, scene-global effects, and a broad professional color-grading surface are outside this task. Existing lower-level capabilities may remain, but they do not define V1 completion unless they are reachable through the canonical loop.

## Decisions

- Base all implementation on `origin/main` and its WebGPU renderer. The pre-restart worktree is preserved in `stash@{0}` with message `pre-main-restart computational-style WIP 2026-07-10`; it is reference material, not a patch queue to replay.
- Treat generated tests as regression hints only. Product completion requires browser interaction, fixed-asset visual review, persistence recovery, and exported artifact inspection in addition to automated checks.
- Keep `CanvasWorkbench` as the persisted composition document and `src/render/image/*` as the single-image authority. The new product surface orchestrates these boundaries rather than introducing a second authored state model.
- AI generation is an input source. The product must remain fully usable with local images and without provider credentials.
- Continue using the existing Tailwind v3 and UI primitives. Establish product tokens in CSS and reuse existing primitives instead of adding a parallel component system or upgrading Tailwind during this task.
- Route-level code splitting is part of the product baseline because the renderer, canvas, library, and AI surfaces have materially different dependency graphs.

## Slice Notes

### Foundation Reliability

Re-establish a trustworthy mainline before product work. Fix the image-lab conversation lifecycle, binary asset upload parsing, current build gates, and route loading boundaries. Add behavior-level coverage only for the real failures being removed.

Completed 2026-07-10.

- `src/features/image-lab/hooks/useImageLabConversation.ts` now owns request cancellation and versioning so StrictMode performs one initial load and stale refreshes cannot replace an accepted or cleared conversation.
- `server/src/routes/assets.ts` and `server/src/assets/service.ts` now accept scoped binary image bodies, normalize MIME types at both request boundaries, and map expected session failures to stable 404/409/415 responses.
- The new hook and route integration tests protect the observed lifecycle, authenticated prepare/upload/complete/readback flow, MIME parameters, client failures, and configured body limit.
- Browser evidence: `/assist` made exactly one conversation request and remained idle; a real library image completed both original and thumbnail upload and appeared in the asset list.
- Validation: `pnpm verify` passed (127 files, 644 tests, client and server builds); `pnpm dead-code` matched the main baseline with no new unused files or exports; focused ESLint, Prettier, and `git diff --check` passed.
- Independent review found four lifecycle and upload-boundary issues. All were resolved; the final MIME normalization case was reproduced through the real route and added to the readback test.

### Image-First Entry

Replace the blank-canvas first impression with a focused start surface. Reuse the existing asset import and workbench command paths so every input creates canonical persisted state. Clipboard input is handled as an image import, not a new asset type.

### Computational Style Lab

Present authored style directions as outcome cards with compact controls. Directions are presets over canonical render families, not new renderer branches. The selected image remains the target; multi-selection and scene-global styling are deferred.

### Social Composition And Output

Expose semantic overlays and output framing as the finishing step. Ratio changes update the canonical workbench dimensions and existing elements through explicit commands. Export continues through the current canvas document renderer.

### Product Validation

Validate the complete flow with a clean browser profile and fixed assets. Automated checks prove contracts; screenshots, exported files, network behavior, reload recovery, and human visual comparison prove the product result.

## Validation Boundary

- Unit tests cover pure preset/state transforms only.
- Component or route tests cover effect lifecycles, asset upload, and persistence boundaries.
- `agent-browser` covers the full user flow, network quietness, narrow viewport usability, and reload recovery.
- Fixed sample assets cover portrait, landscape, fine texture, faces, and high-contrast edges.
- Preview/export agreement is decided by rendered artifact comparison and human review, not by state snapshots alone.

## Handoff

Before leaving a slice, record its modified files, the product behavior now reachable, validation results, and the first unresolved failure if any. Do not advance the next slice while an earlier dependency remains unproven.
