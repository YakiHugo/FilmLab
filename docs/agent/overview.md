# FilmLab Agent Overview

This document is the source of truth for how FilmLab's image prompt pipeline is organized. `AGENTS.md` should only point here. Keep long-lived project knowledge here, not in transient handoff notes under `refs/`.

## Product Shape

FilmLab is not a general autonomous coding agent. For this repository, the agent-facing backend is a prompt and routing pipeline for image generation:

`request -> rewrite -> compile -> route -> dispatch -> persist -> observability`

The implementation lives primarily in:

- `server/src/gateway/prompt/rewrite.ts`
- `server/src/gateway/prompt/compiler.ts`
- `server/src/gateway/router/*`
- `server/src/routes/image-generate.ts`
- `server/src/chat/persistence/*`

## Pipeline Stages

### 1. Rewrite

- Normalize the user's turn into a `TurnDelta`.
- Prefer deterministic fallback over silent failure.
- Rewrite is target-agnostic. It should not encode provider-specific behavior.

### 2. Compile

- Build `PromptIR` from the active conversation state plus the current request.
- Compile per target using shared capability facts.
- Emit semantic losses explicitly whenever a requested behavior degrades.

### 3. Route

- Route by logical model and capability, then select one or more concrete deployments.
- Fallback is sequential retry across eligible targets for the same logical model.
- Requested target, selected target, and executed target must remain distinguishable in persisted runs.

### 4. Dispatch

- Dispatch provider-effective payloads only after rewrite and compile state are persisted consistently.
- Exact retry reuses prior execution artifacts. It must not silently recompile.

### 5. Persist

- Conversation state, turns, runs, prompt artifacts, jobs, assets, and observability data must stay internally consistent.
- Persist enough data to explain what happened after the fact, not just what the final output was.

### 6. Observability

- Prompt artifacts and prompt observability summaries are first-class debugging surfaces.
- Traceability matters more than verbose logging. A request should be followable across rewrite, image run, provider call, and stored artifacts.
- Request-scoped tracing should originate from Fastify's request lifecycle. Reuse the HTTP request ID as the persisted `traceId`, echo it back to clients, and forward it to provider calls instead of minting a disconnected route-local trace token.

## Invariants

These invariants must hold across changes to the prompt pipeline:

- `rewrite` stays target-agnostic.
- `compile` is capability-driven, not hardcoded per route branch.
- Semantic degradation is explicit and persisted.
- Exact retry replays prior compiler artifacts instead of silently producing new ones.
- Requested, selected, and executed targets are all preserved when fallback occurs.
- Observability endpoints must not create new conversations as a side effect.

## Fallback Semantics

- Fallback is for retriable provider/runtime failures, not for incompatibility that should fail fast.
- Fallback may change the executed target, but it must not rewrite history about the requested target.
- Prompt artifacts must make fallback explainable by target and attempt.

## Completion Standard

A prompt pipeline change is complete only when:

1. The behavior is implemented.
2. Relevant invariants are still true.
3. Regression coverage exists for the risky path.
4. `pnpm verify` passes.
5. Prompt pipeline changes also pass `pnpm verify:prompt`.

## Out Of Scope

These ideas are intentionally out of scope for FilmLab's current baseline:

- Multi-agent orchestration runtime
- Heartbeat or cron-driven autonomous agent loops
- Project-wide `MEMORY.md` or skill loading system
- Full event-bus tracing architecture

If those become necessary later, add them as explicit product/runtime work rather than smuggling them in through prompt pipeline changes.
