# Supabase-First Image Assets Rewrite

## Baseline

- Baseline commit: `bf4e949`
- Branch: `feat/canvas-optimize`
- Scope: rewrite the image asset core around canonical `assetId`, Supabase-style object storage,
  and Fastify-owned asset APIs; remove client-side reference image URL flows and generated-image
  re-import flows.

## Architecture Decisions

- `Asset.id` is the only canonical image identity across upload, generation, conversation results,
  and canvas insertion.
- The server owns asset APIs. Frontend code no longer calls `api/assets/*`; asset upload, read,
  delete, and generation materialization all live under Fastify.
- Storage is provider-backed and abstracted behind a server asset service. The primary
  implementation targets Supabase Storage + Postgres, with an in-memory fallback for tests and
  envs without Supabase credentials.
- Uploaded and generated images share the same storage path model and database tables.
- Content-hash dedupe lives at the service boundary, not a unique database index. Stable mutable
  `assetId` replacements are allowed to converge to the same bytes as another asset, while new
  uploads and generated images serialize dedupe through repository-level content-hash locks.
- Image generation requests are asset-only. Frontend sends `assetRefs`; the server resolves those
  refs to provider-readable URLs or buffers when the selected model needs native image input.
- Conversation results point directly at canonical assets. There is no secondary "save generated
  result into library" step.
- Canvas continues to consume ordinary `image` elements with `assetId`; AI-specific canvas element
  work stays out of scope for this rewrite.

## Critical Invariants

- Every persisted image asset has exactly one canonical `assetId`.
- `asset_files` rows are keyed by `asset_id + kind`; `original` must exist before an asset is
  considered synced.
- `asset_edges` only connect canonical asset ids; no edge may reference transient chat-only ids.
- Generated image responses always include an `assetId`.
- Frontend reference bindings are represented only as `assetRefs`; local `referenceImages.url`
  data never reaches providers.
- Asset deletion must remove both storage objects and metadata rows for the same canonical id.

## Risk Notes

- This rewrite crosses shared schemas, server persistence, provider input resolution, client asset
  sync, image generation UI, and canvas insertion.
- Generated-image history and chat persistence currently assume chat-owned asset rows; the largest
  risk is leaving stale assumptions around `threadAssetId`, `generated_images`, or saved-state
  projection.
- Browser image rendering cannot rely on Authorization headers for `<img>` tags, so stable asset
  URLs must be resolved through the app layer rather than raw private storage URLs.

## Validation Notes

- Per slice: run targeted tests first (`image generation`, `chat persistence`, `asset store`).
- Before handoff: run `pnpm lint`, `pnpm test`, and `pnpm build`.
- If a slice fails and is not fixed immediately, record the first actionable failure here and mark
  the JSON tracker task as `blocked`.

### Completed Validation

- `pnpm --filter server typecheck`: passed
- `pnpm exec tsc --noEmit`: passed
- `pnpm test`: passed
- `pnpm build`: passed
- `pnpm lint`: passed with four pre-existing `react-refresh` warnings in unrelated UI files
- Targeted Vitest runs for image-lab snapshot/reference helpers, route coverage, and generated
  asset materialization: passed

## Recent Slice

- Fixed the generated-result materialization gap in the image-lab flow. Generation success now
  injects returned canonical assets into `useAssetStore` immediately, then hydrates them from
  `/api/assets/:assetId` in the background so canvas insertion and "use as reference" operate on
  real library assets instead of conversation-only result records.
- Added a dedicated `materializeRemoteAssets` store action so remote-only canonical assets can be
  represented in runtime asset state without pretending they are locally editable blob-backed
  assets.
- Closed the post-review image-lab state bugs. Unsupported-model switches now clear all executable
  image-guided inputs, persisted reference asset refs keep `referenceType` and `weight`, and the
  reference-panel Clear action consistently removes reference-role state while preserving
  edit/variation bindings.
- Hardened the asset backend around canonical metadata and cleanup. Upload sessions now overwrite
  stale metadata, completion re-measures stored objects instead of trusting init payloads, dedupe
  for new uploads and generated images is serialized through repository content-hash locks, and
  late generation failures now clean up newly created assets plus canonical `asset_edges`.

## Implementation Notes

- Added a Fastify-owned asset backend under `server/src/assets/*` plus `server/src/routes/assets.ts`
  with canonical asset tables, upload sessions, provider asset resolution, and browser-safe asset
  URLs.
- Reworked client asset sync to use canonical `assetId` only. `remoteAssetId` has been removed from
  client state, IndexedDB types, sync jobs, and sync API calls.
- Import now prepares an upload session up front so locally persisted assets already use their final
  canonical `assetId`.
- Image generation responses now surface canonical assets directly. The image-lab flow no longer
  re-imports generated images to save or add them to the canvas.
- Reference image UI still exists as a preview layer, but the executable request path is now
  `assetRefs` only. Provider-native reference URLs are resolved on the server.
- `useImageGeneration.ts`, `assetStore.ts`, `assetSyncApi.ts`, and `currentUser/types.ts` now
  include the runtime materialization seam for generated assets so downstream consumers stay
  asset-store based.

## Open Review Findings

- None. The latest bounded client and server review passes both returned `no issues found`.

## Commit Readiness

- Task note and JSON are updated for handoff.
- Validation is green: `pnpm --filter server typecheck`, `pnpm exec tsc --noEmit`, `pnpm test`,
  and `pnpm build` all pass.
- `pnpm lint` passes with four pre-existing `react-refresh` warnings in unrelated UI files.
- Module commits are recorded on this branch.

## Handoff Notes

- Keep the JSON tracker minimal and authoritative for execution status only.
- Prefer removing dead compatibility code over layering new branches on top of the old
  `remoteAssetId/referenceImages/threadAssetId` model.
