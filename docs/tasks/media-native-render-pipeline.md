# Media Native Render Pipeline

- Baseline: `the live repo has one canonical per-image runtime in src/render/image/*, carrier/style/overlay execution are already split, and canvas preview/export compose above that runtime; scene/global and motion-oriented styling are still outside the main pipeline`
- Scope: evolve the current render pipeline into a media-native pipeline that supports carrier transforms, signal damage, semantic overlays, analysis-driven layers, and short motion / live export without reopening removed editor-specific architecture.

## Current State

- Already in live code:
  - canonical per-image runtime entry: `src/render/image/renderSingleImage.ts`
  - carrier execution: `src/render/image/carrierExecution.ts`
  - raster/style effect execution: `src/render/image/effectExecution.ts`
  - overlay execution: `src/render/image/overlayExecution.ts`
  - board preview/export composition: `src/features/canvas/boardImageRendering.ts` and `src/features/canvas/renderCanvasDocument.ts`
- Still missing:
  - persisted semantic overlay model
  - signal-damage family as first-class authored state
  - explicit analysis-layer inputs
  - scene/global state above per-image rendering
  - motion/time render contract

## Decisions

- Keep `src/render/image/*` as the per-image execution primitive.
- Do not resurrect `src/features/editor/*` as a live render boundary.
- Keep one canonical render document boundary, but extend authored state above pure image effects.
- Split render features into explicit families instead of treating everything as one generic effect bucket:
  - `imageEffects`
  - `carrierTransforms`
  - `signalDamage`
  - `semanticOverlays`
  - `analysisLayers`
  - `motionPrograms`
- Scene/global ownership must stay above image-node-local render state and is tracked separately in `docs/tasks/scene-global-render-follow-up.md`.
- Keep preview/export differences at the scheduler or quality tier, not in a second authored-state source of truth.

## Open Slices

### 1. Semantic Overlay Layer System

- Promote current timestamp-style handling into a general overlay system.
- Support authored overlay items such as:
  - caption
  - HUD
  - browser chrome
  - chat/comment bubble
  - sticker
  - system log / timecode
- Decide ownership:
  - per-image overlay
  - board/global overlay
  - both, with explicit composition rules

### 2. Carrier And Signal Families

- ASCII already exists as a carrier transform.
- The next work should keep adding authored families instead of pushing them back into generic `effects`.
- Target families:
  - `carrierTransforms`: `ASCII`, dither, halftone, fixed-palette, textmode
  - `signalDamage`: channel drift, line displacement, row/column shift, compression artifacts, pixel sort
- Define which families are:
  - single-frame deterministic
  - analysis-dependent
  - motion-sensitive

### 3. Analysis Layer Boundary

- Introduce explicit analysis inputs instead of implicit effect-local ad hoc analysis.
- Candidate inputs:
  - segmentation
  - face landmarks
  - OCR blocks
  - object boxes
  - edge/depth-like derived maps where feasible
- Analysis layers must be render inputs, not undocumented side channels.

### 4. Motion / Live Render Contract

- Create a time-parameterized render contract above the current single-image kernel.
- Scope this to short-loop / live-card output, not full nonlinear video editing.
- Define:
  - source frame ownership
  - time parameter
  - frame-to-frame state
  - preview scheduler
  - export packaging

### 5. Preview / Export Quality Split

- Keep one conceptual pipeline, but separate:
  - interactive preview
  - quality preview
  - export render
- Move heavy analysis and high-cost diffusion/sampling work behind explicit quality tiers.

## Risks

- If carrier transforms and semantic overlays collapse back into generic `effects`, the authored model will stay under-specified.
- If motion support is forced into the current single-frame entrypoint, timing/state concerns will leak into the still-image kernel.
- If scene/global styling is mixed back into image-node-local state, ownership will become ambiguous and preview/export parity will drift.
- If preview optimization creates a second document model, canonical state will split again.

## Validation Boundary

- Every slice must define:
  - authored state ownership
  - stage ordering
  - preview/export parity expectations
  - narrow targeted regression coverage
- No current task doc should reference removed `src/features/editor/*` modules as live implementation.

## Current Focus

- `carrier-and-signal-families` remains the active slice.
- ASCII already executes as a carrier transform.
- The next implementation should add one more authored carrier or signal family without widening back into generic effect placement only.

## Files

- `src/render/image/renderSingleImage.ts`
- `src/render/image/carrierExecution.ts`
- `src/render/image/effectExecution.ts`
- `src/render/image/overlayExecution.ts`
- `src/render/image/snapshotPlan.ts`
- `src/features/canvas/boardImageRendering.ts`
- `src/features/canvas/renderCanvasDocument.ts`
  - no matches

## Handoff

- Start with Slice 1 plus a concrete overlay prototype, not the whole roadmap at once.
- The first implementation slice should avoid new media codecs or browser-worker architecture changes unless they are required for the chosen prototype.
- This task is the concrete planning follow-up for `scene-global-render-follow-up`, not a replacement for the current single-image kernel.
- Implemented in the first slice:
  - canonical stage naming is now `develop -> style -> overlay -> finalize`
  - timestamp handling now flows through a shared overlay runtime entry instead of direct per-call special casing
- Implemented in the current ASCII-first carrier sub-slice:
  - `CanvasImageRenderStateV1` now carries `carrierTransforms`
  - ASCII authoring/editing moved out of `effects[]` and into `carrierTransforms`
  - preview/export revision identity now includes carrier transforms
  - legacy ASCII effect persistence is treated as read-only compatibility input, not a write-path schema
- Still open after the first slice:
  - authored `semanticOverlays` model
  - board/global overlay ownership rules
  - non-timestamp overlay types
  - signal-damage families
  - carrier families beyond ASCII (`dither`, `halftone`, `palette`, `textmode`)
  - motion/live render contract
