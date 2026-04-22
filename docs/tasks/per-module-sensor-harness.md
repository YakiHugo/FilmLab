# Per-Module Sensor Harness

## Motivation

当前项目在 agent 视角下基本是"黑箱失败"：

- `src/lib/renderer/PipelineRenderer.ts:856, 942, 1028, 1129, 1195, 1755, 1887` 共 7 处 `if (import.meta.env.DEV) throw error; console.error(error)`，把 WebGL 错误吞掉：不带 shader 名 / compile log / passId / uniform 快照。
- `src/lib/imageProcessing.ts` 的 `RenderBoundaryMetrics`（`canvasMaterializations` / `canvasClones` / `textureUploads` / `cpuPixelReads`）已布线 ~30 个调用点到 `returnResult.boundaries`，但没有任何测试断言上界，生产路径不读。
- `src/render/image/renderSingleImage.ts:28-50` 的 `ImageRenderTraceStage` + `outputHash` 设计干净，但只有 `renderSingleImage.test.ts` / `imageProcessing.debug.test.ts` 消费；UI 调用点 `src/features/canvas/renderCanvasDocument.ts:300` 与 `boardImageRendering.ts:204` 都不传 `debug`。
- `docs/render_baseline.md:45-47` 自述 "no packaged CLI trace/hash capture flow"。
- `src/lib/db.ts` 散 27 处 `console.log/warn/error`，无 tag / phase / op。
- `server/src/shared/requestTrace.ts` 的 `x-request-id` 已接入 pino，但 client `src/lib/api/*` 不承接；`features/image-lab` 错误 UI 拿不到 traceId，client/server 链路断。
- `server/` pino 是 flat request log，没有 per-stage child logger 区分 `prompt-compile` / `route` / `provider-call` / `persist`。

直接代价：`docs/tasks/renderer-y-convention-unification.json:21` 的 slice-2 卡在 `awaiting_user_validation`，渲染域 slice 只能阻塞在人肉目视——不是能力问题，是 sensor 没到位。

## Guiding Principle

**Sensor 的 shape = bug 的 shape。** Bug 有几个定位维度（op / resource / phase / cause），error payload 就有几个 field。一个模块的失效形状和另一个模块不一样，sensor 也不统一。

直接推论：

- 不建项目级统一 logger 抽象；每个模块独立设计 payload。
- 跨模块只共享一项：`x-request-id`（client → server → provider）。
- Dev 出口按模块选：测试断言上界、baseline 文件 diff、`globalThis.__filmlab_*` ring buffer、per-stage child logger——匹配该模块调用节奏即可，不强求齐平。
- 不引入新依赖；`src/lib/hash.ts` 与现有 pino 足够。
- 所有 dev-only 挂点用 `import.meta.env.DEV` 守卫，prod noop。

## Non-Goals

- 不引入中心化 logger 抽象（违背 shape-per-module 原则）。
- 不接入 OpenTelemetry / Grafana 等观测栈。
- 不动 canvas 模块的文件拆分与 seam 命名（仅加 sensor 点）。
- 不让 CI 在 boundary metric 升高时自动 fail——先人评估基线再升级测试。
- 不引入运行时 hash 依赖；复用 `src/lib/hash.ts` 的 `sha256FromCanvas`。

## Slice Plan (ordered by ROI)

每 slice 独立 commit、独立过 `pnpm verify`；实现顺序可调整，但 Slice 1-2 先于 3-7 可最大化止血。

### Slice 1 — `imageProcessing` boundary 契约

目的：把已有 `RenderBoundaryMetrics` 变成测试时的 ceiling 合同，阻止后续 patch 悄悄加 CPU/GPU 边界越界。

- 新增 `src/lib/imageProcessing.boundaries.test.ts`。
- 矩阵：2 个固定 asset × 3 个固定 preset（default / ascii / film）。
- 断言格式：`expect(result.boundaries.textureUploads).toBeLessThanOrEqual(N)` 与 `expect(result.boundaries.canvasClones).toBe(0)`，N 先用当次实测值作为契约基线。
- `src/render/image/renderSingleImage.ts` 在 `import.meta.env.DEV` 下把最后一次 `boundaries` 写到 `globalThis.__filmlab_lastBoundaries`。

回滚：删新测 + revert dev 挂点几行。

### Slice 2 — `render/image` baseline 文件

目的：把 `debug.trace` + `debug.outputHash` 接到持久化基线，解锁视觉 slice 不再必须人肉目视。

- 新增 `test-assets/baselines/<asset-stem>.<preset>.json`：
  ```json
  {
    "stages": [{ "id": "develop", "ops": [...] }, ...],
    "outputHash": "sha256:...",
    "boundaries": { ... }
  }
  ```
- 新增 `src/render/image/renderSingleImage.baseline.test.ts`，对固定矩阵 diff baseline。基线变更必须 PR 内显式修改 JSON（review 时 hash 漂移可见）。
- `ImageRenderTraceOperation` 扩展一条扁平化 `signature: string` 字段，便于 diff 工具直接定位字符串差别；嵌套 `lowLevel` 字段保留。

回滚：删 baseline 目录 + 新测；`signature` 字段默认可选不影响既有消费者。

### Slice 3 — `lib/renderer` 结构化 error payload

目的：把 7 处 "prod 吞、dev 裸抛" 改为结构化事件；shader bug 不再盲拆。

- 新增 `src/lib/renderer/reportGlError.ts`：
  ```ts
  type GlErrorEvent = {
    op: 'compileShader' | 'linkProgram' | 'fbo' | 'drawArrays' | 'texImage' | 'uniform-binding';
    shaderName?: string;
    passId?: string;
    glError?: number;
    compileLog?: string;
    rendererLabel: string;
    cause: unknown;
  };
  ```
- 替换 `PipelineRenderer.ts` 7 处 catch；prod 不再静默吞，返回 typed failure 让上层决定降级。
- `ProgramRegistry.ts` 编译程序后做 uniform 对齐自检（declared vs bound 任一孤立即报 `op: 'uniform-binding'`）。
- Dev ring buffer 挂 `globalThis.__filmlab_glErrors`，限 50 条。
- 新增 1–2 条负向测试（故意塞错 shader 源）断言 payload 字段齐全。

回滚：PipelineRenderer / ProgramRegistry / reportGlError 三文件 revert。

### Slice 4 — client ↔ server traceId 闭环

目的：生成失败时 agent 拿到的不再是"生成失败"字符串，而是可定位到 stage 的结构化错误。

- Server 错误响应 body 统一扩为 `{ traceId, stage, providerErrorCode?, causeSummary }`，`stage ∈ prompt-compile | route | provider-call | persist | normalize`。
- Client `src/lib/api/*` 抽 `x-request-id` header + body 字段进 error state。
- `features/image-lab` error UI 显示 traceId；dev 下 `globalThis.__filmlab_lastImageGenError` 留最近一次。

回滚：server error body schema 收回旧形状；client 读 header 的分支删除。

### Slice 5 — `lib/db.ts` 结构化 logger

目的：把 27 处散装 `console.log/warn/error` 改成可 `jq` 过滤的一行一事件。

- 新增 `src/lib/db.logger.ts`：`logDb({ op: 'get'|'put'|'delete'|'migrate'|'openDb', storeName, key?, phase: 'start'|'success'|'error', error? })`。
- Dev 下 `console.log(JSON.stringify(evt))` 一行一条；prod 可直接 noop 或保留 error phase。
- Ring buffer `globalThis.__filmlab_dbLog` 限 200 条。

回滚：db.ts 的 log 行 revert 成原 console；删 logger 文件。

### Slice 6 — canvas command trace

目的：canvas hotspot 坏了不再只有"不动了"，agent 能直接拿到最近 N 条 dispatch 重播。

- 新增 `src/features/canvas/canvasCommandTrace.ts`：
  ```ts
  type CanvasCommandEvent = {
    tsMs: number;
    kind: string;
    payload: unknown;
    prevDigest: string;
    nextDigest: string;
  };
  ```
- 在 dispatch 入口（`canvasContextActions.ts` / `canvasLayerOrderActions.ts` / 历史栈 commit 点）打事件。
- Digest = 对 workbench state JSON.stringify 后取 `src/lib/hash.ts` 的前缀，不引新依赖。
- Dev ring buffer `globalThis.__filmlab_canvasTrace` 限 200 条；prod noop。
- 新增 1 条断言"连续三个 dispatch 产生三条 trace"。

回滚：删 trace 文件 + 单行 revert 各 dispatch 入口。

### Slice 7 — server per-stage child logger

目的：flat request log 改为 stage-aware，provider 错误携带定位字段。

- `server/src/gateway/prompt/*` / `gateway/router/*` / `routes/image-generate.ts` / `providers/base/client.ts` 每个 stage 入口 `request.log.child({ stage })` 起子 logger。
- Provider error 统一带 `{ providerId, modelId, responseStatus, responseBodyPreview (redacted, ≤200 字符) }`。
- 新增 1 条断言"provider 错误响应携带 stage + causeSummary"。

回滚：子 logger 退回父 logger，单文件级 revert。

## Cross-Slice Invariants

- dev 出口命名空间固定 `globalThis.__filmlab_*`，`agent-browser` 可直接读。
- `x-request-id` 是唯一跨模块共享关联键。
- 不动既有模块边界（不拆文件、不搬 helper）。
- 所有 slice 之间无代码级依赖，顺序可调；但 Slice 1-2 先做能立刻止血。

## Validation Commands

每 slice 结束：

- `pnpm -C /workspace/project/FilmLab lint`
- `pnpm -C /workspace/project/FilmLab typecheck`
- `pnpm -C /workspace/project/FilmLab test`
- Slice 2 / 3 / 6 需 PR review 目视确认 baseline / error payload / trace shape。
- Slice 4 完成后：`agent-browser` 跑一次生成失败路径，确认 client 侧 `__filmlab_lastImageGenError.traceId` 与 server log `x-request-id` 一致。

## First-Session Scope

本会话仅切片 + 立边界，不动代码。理由：

- Slice 1 虽小，但目标 ceiling 的数值需先实测当前代码在 3 个 preset 下的 `boundaries`，不适合本会话携带。
- Slice 3 涉及 `PipelineRenderer.ts` 7 处 catch 改造，属 AGENTS.md "hotspot 优先 structural refactor" 范围，需独立 session 审查。
- Slice 4 跨 client/server 两棵树，shape 决策应独立成一个 session。

下一 session 从 Slice 1 开始：先实测 boundaries，再把 ceiling 写进测试。
