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

Completed 2026-07-10.

- `src/pages/studio.tsx` is now the computational entry surface: local drop/file input, global image paste, recent-library selection, and AI/library routes are visible before any canvas is created. Desktop and 390 px layouts have explicit loading, empty, busy, and failure states.
- `src/features/studio/createImageWorkbench.ts` is the single entry command. It resolves the image before persistence, creates the canonical 4:5 workbench, covers and centers the image, records the cover asset, selects the node, and compensates by deleting an incomplete workbench if insertion fails.
- `src/router.tsx`, `src/components/RoutePending.tsx`, and `src/components/layout/Header.tsx` remove the eager Canvas dependency from the shell and lazy-load Studio, Library, AI, and Canvas routes. The production entry chunk fell from about 1.08 MB to 146 KB minified; the Studio route is about 13 KB.
- `src/stores/currentUser/constants.ts` and `importPipeline.ts` now normalize supported extension-only files to a real MIME type before Blob creation, upload init, and Asset persistence. The V1 input contract is JPEG, PNG, WebP, and AVIF; TIFF import was removed because the browser render chain cannot decode it.
- `public/textures/damage/default.png` and `public/textures/borders/default.png` were losslessly re-encoded. Their invalid prior encoding caused every WebGPU preview to fail during static texture loading and left only a gray placeholder.
- Browser evidence: two distinct local uploads, a recent-library asset, a synthetic clipboard image, and a file with an empty MIME plus valid `.png` extension all created persisted workbenches with visible images; reload restored the workbench; no page errors were present; the entry remained usable at 390×844.
- Validation: `pnpm verify` passed (127 files, 645 tests, client and server builds); `pnpm dead-code` matched the main baseline with no new unused files or exports; formatting, focused ESLint, typecheck, and `git diff --check` passed. Independent review findings covering input-format truthfulness, incomplete-workbench cleanup, and shared picker drift were resolved; final result: no issues found.

### Computational Style Lab

Present authored style directions as outcome cards with compact controls. Directions are presets over canonical render families, not new renderer branches. The selected image remains the target; multi-selection and scene-global styling are deferred.

Completed 2026-07-11.

- `src/features/canvas/CanvasStyleLabPanel.tsx` publishes five outcome-led directions—Mono Terminal, Color Glyph, Print Screen, Signal Loss, and Data Mosaic—with one shared strength control, Bypass, and direct access to the existing ASCII, Halftone, and Signal panels.
- `src/features/canvas/styles/computationalStylePresets.ts` translates those directions into the canonical image `renderState`. Switching disables the previous computational carrier while preserving geometry, develop state, and semantic overlays; no parallel style document was added.
- `src/lib/gpu/passes/carrier/ascii/toneNormalize.ts` now allocates the WGSL uniform buffer at its required 64-byte boundary. The prior 48-byte binding invalidated the complete analysis/tone/selection command buffer and left ASCII foregrounds empty.
- `src/features/canvas/runtime/CanvasRuntimeProvider.tsx` reconciles assets that hydrate between render and effect subscription, closing the reload race that left persisted workbenches with a gray image placeholder.
- Browser evidence: a real landscape image produced five visibly distinct outputs; strength changed from 64% to 100% with a corresponding visual change; Bypass restored the source; a clean dev-server restart and browser reload restored Data Mosaic at 100%; the focused ASCII, Halftone, and Signal controls were reachable from Style Lab.
- Validation: `pnpm verify` passed (130 files, 653 tests, client and server builds); `pnpm dead-code` reported no new unused files or exports; focused formatting, ESLint, typecheck, and `git diff --check` passed. Independent review found one resolved-null persistence-error path, which was fixed and re-reviewed; final result: no issues found.

### Social Composition And Output

Expose semantic overlays and output framing as the finishing step. Ratio changes update the canonical workbench dimensions and existing elements through explicit commands. Export continues through the current canvas document renderer.

Completed 2026-07-12.

- `CanvasOutputPanel` makes 1:1, 4:5, and 9:16 framing, Caption, Timestamp, Watermark, and the artifact action one explicit finishing step. `APPLY_OUTPUT_FORMAT` changes the frame and preferred cover image as one persisted, undoable command; grouped covers and sliced workbenches fail as strict no-ops instead of partially mutating.
- `CanvasCaptionEditPanel`, `CanvasTimestampEditPanel`, and `CanvasWatermarkEditPanel` write semantic overlays to the selected preferred image. Preview and export use the same reference-space layout, so font size, padding, opacity, and position do not drift with render density.
- `CanvasExportDialog` and `useCanvasExport` now expose one canonical PNG/JPEG path at 1x or 2x. The dialog preview and download both use `renderCanvasWorkbenchToCanvas`; format and JPEG-quality changes re-encode one leased preview canvas instead of launching concurrent GPU renders. Missing visible assets fail visibly, and the dialog remains open on failure.
- `compositionReferenceSize` establishes the authored image coordinate system for board preview and export. ASCII analysis/composition use one exact integer-cell partition, grid lines use pixel-footprint coverage, and channel drift maps X/Y offsets into physical output pixels. Halftone frequency remains resolution-relative. The retired Konva-stage, slice-series, and TIFF UI paths were removed; the long-term 16-bit boundary is recorded in `docs/decisions.md`.
- Browser evidence from clean sessions: local upload opened an initialized 1080×1350 workbench with no initial undo; all three ratios produced clipped, edge-to-edge frames; Data Mosaic plus Caption and Timestamp survived reload; PNG and JPEG downloads completed at 1080×1350 and 2160×2700. Downsampled 2x comparison measured SSIM 0.959 for PNG and 0.944 for JPEG, with matching grid topology, RGB offset, crop, and overlay placement. A separate Watermark pass matched the main preview and canonical PNG, then restored its enabled state, text, angle, density, size, and opacity after reload.
- Validation: `pnpm verify` passed (133 files, 672 tests, client and server builds); `pnpm dead-code` reported the existing baseline with no new unused files or exports; focused typecheck, ESLint, formatting, `git diff --check`, fresh-browser WebGPU compilation, reload recovery, artifact metadata inspection, and three independent review passes succeeded. Real artifact review found and closed the density bug that mocked tests had missed; final result: no issues found.

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
