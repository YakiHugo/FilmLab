# Image-Lab Session Boundary Rewrite

## Baseline

- Baseline commit: `4629e83`
- Scope: rewrite `image-lab` so the server conversation becomes the single source of truth,
  remove browser-persisted session snapshots, introduce explicit client view DTOs, and thin the
  chat/image routes behind application services.
- Out of scope: `src/features/canvas/**` implementation rewrites.

## Architecture Decisions

- `image-lab` reads conversation state only from server-owned view DTOs. The browser keeps only
  transient UI state such as result selection, prompt-artifact expansion, and in-flight request
  control.
- Client-visible contracts live in shared view DTO files; server persistence types are treated as
-internal and are no longer imported by frontend code.
- `POST /api/image-generate` is a command response, not a persistence snapshot. Rich conversation
  state is reloaded through `/api/image-conversation`.
- Route handlers stay thin. Generation orchestration and conversation projection move into
  `server/src/chat/application`.
- `generationConfigStore` remains the only durable client state for prompt parameters.
- `canvas` stays on the existing insertion seam: `assetId` in, workbench mutation out.

## Risk Notes

- The highest-risk area is preserving retry, accept, and prompt-artifact behavior while removing
  the client-owned session snapshot model.
- Asset materialization must still happen for generated canonical assets even though the generate
  route no longer returns server persistence internals.
- `postgres.ts` is large and already hot; internal extraction should reduce responsibility without
  changing schema or migration names.

## Validation Notes

- Targeted tests first: image conversation, image generate, chat persistence, image-lab.
- Before handoff: `pnpm lint`, `pnpm test`, `pnpm build`.
- If a slice fails and is not fixed immediately, mark the JSON tracker `blocked` and record the
  first actionable failure here.

## Progress

- Completed: added shared client-facing DTOs in `shared/imageLabViews.ts` and moved server
  persistence imports behind `server/src/chat/persistence/models.ts`.
- Completed: projected conversation, prompt-artifact, and observability responses through
  `server/src/chat/application/projectConversationView.ts` and
  `server/src/chat/application/conversationService.ts`.
- Completed: moved image generation orchestration into
  `server/src/chat/application/imageGenerationService.ts`; `server/src/routes/image-generate.ts`
  is now a thin auth/validation/error-mapping shell.
- Completed: replaced `useImageGeneration.ts` with a composition boundary over
  `useImageLabConversation`, `useImageLabCommands`, `useImageLabUiState`, and
  `useImageLabAssetActions`.
- Completed: removed browser-persisted session snapshots by deleting
  `src/stores/imageSessionStore.ts` and dropping the `imageGenerationSessions` IndexedDB store.

## Validation Results

- `pnpm test server/src/routes/image-conversation.test.ts server/src/routes/image-generate.test.ts server/src/chat/persistence/postgres.promptArtifacts.test.ts src/features/image-lab src/lib/ai/imageGeneration.test.ts src/stores/assetStore.materialization.test.ts`: pass
- `pnpm lint`: pass with 4 pre-existing `react-refresh/only-export-components` warnings in
  `src/components/ui/badge.tsx`, `src/components/ui/button.tsx`,
  `src/features/canvas/elements/TextElement.tsx`, and `src/features/image-lab/ImageChatFeed.tsx`
- `pnpm test`: pass
- `pnpm build`: pass

## Remaining Notes

- Browser smoke for `/assist` was not run in this session; validation is currently test/lint/build
  based.
- Follow-up architecture review after moving persistence models into
  `server/src/chat/persistence/models.ts` and splitting `postgres` helpers into
  `server/src/chat/persistence/postgres/*`: no issues found.
- Follow-up bug/regression review after the same changes: no issues found.
