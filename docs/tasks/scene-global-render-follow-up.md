# Scene Global Render Follow-up

- Baseline: `single-image kernel complete; board/global styling and scene-level effect orchestration still separate`
- Scope: track the post-kernel work for board-wide styling, scene-level effect graph orchestration, and any future whole-scene render contract that sits above per-image rendering

## Decisions

- Do not reopen the single-image runtime task for scene/global work.
- Keep single-image rendering as the per-image execution primitive.
- Any scene/global feature must define:
  - where whole-scene state lives
  - when it executes relative to per-image rendering and board composition
  - whether it affects preview only, export only, or both
- Do not reintroduce asset-level or image-node-level legacy bridges to carry scene/global behavior.

## Open Work

- Define the authored state model for board/global styling.
- Decide whether scene-level effects run:
  - before layer/image compositing
  - after board compositing
  - or as explicit staged buckets with both options
- Inventory which existing requests are actually scene/global:
  - board-wide stylization
  - cross-image shared effects
  - scene-level effect graph / orchestration
- Decide the runtime boundary:
  - extend the current board export/preview composition path
  - or add a dedicated scene-level render contract above `renderSingleImageToCanvas(...)`

## Validation Gate

- A follow-up implementation slice should not start until it defines:
  - state ownership
  - stage ordering
  - preview/export parity expectations
  - a bounded regression plan

## Handoff

- Current status is planning only.
- The next implementation agent should start by turning one concrete scene/global use case into a scoped slice instead of treating "scene-level follow-up" as one large feature bucket.
