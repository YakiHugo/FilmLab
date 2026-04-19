# Decisions

跨任务、跨 commit 的长期决策与刻意保留的妥协。读这份文档是为了：

- 避免撤销有意为之的选择
- 在边界情况下判断代码"为什么是这样"
- 找到重访某项决策的触发信号

**不写**：行数、测试数、"某命令当前通过/失败"。这些是状态，读这个文件的 agent 应该跑命令、读代码。

## 渲染管线

### Backend
- WebGL2，不走 WebGPU。shader backend 抽象不是 prerequisite；WGSL 端口不在范围。
- 单 Surface 路径。每个 per-image stage consume + return `RenderSurfaceHandle`；`*IfSupported` 回退分支已全部退役。`canvasMaterializations` 每次 render = 1（最终 `materializeToCanvas` 是唯一边界）。
- Canvas2D 只存活于 glyph atlas bake (`PipelineRenderer.getGlyphAtlas`，一次 per charset+font)，以及作为 runtime-degrade fallback；stage 之间不得传递 `HTMLCanvasElement`。

### ASCII
- Canvas2D `renderAsciiToCanvas` 已退休（见 `asciiEffect.ts`）。它作为应急 fallback 从未被视觉验证，**不是视觉参考基线**。当前 GPU 路径与旧 Canvas2D 两处刻意 divergence：
  - `cell-solid` 背景在 tone-zero cell 上仍填充（旧版跳过）
  - 网格 overlay 是 1px hairline，无外边框（旧是 anti-aliased ~2px）
- GPU 是主路径：CPU 做 cell-grid pre-pack (`buildAsciiCellGrids`) + glyph atlas bake，作为 stage 内部有界 CPU 岛，output 是 GPU texture。
- ASCII carrier slot id 必须是常量 (`ASCII_CARRIER_SLOT_ID = "ascii-carrier"`)。之前用 `ascii-carrier:${transform.id}` 会让 `RenderManager` 为每个 carrier 分配独立 `PipelineRenderer` 且永不回收 → renderer 泄漏。镜像 `gpuTimestampOverlay` 的一致做法。

### Brush mask
- `GPU_BRUSH_MASK_MAX_POINTS = 512`。超过上限 GPU 路径返回 false，CPU `drawLocalMaskShape` 写入同一 mask canvas，后续 GPU blend 仍消费它——stage 的 Surface-in/Surface-out 契约不破。
- 不要提升上限；若 brush GPU 是 measured hotspot，优化方向是减少 per-dab fullscreen pass 数，不是放宽 fallback 阈值。

### GPU-first / CPU-fallback 边界
- GPU-first：masked stage blend、filter2d、local-mask range gating、local-adjustment output composition、linear/radial mask shapes。
- CPU permanent：brush-mask 超上限 + renderer-unavailable（context lost / destroyed）。

### `PipelinePass` 契约
- `usesPriorTexture?: boolean`。默认 true（processing pass 消费前一级输出）；generator pass（AsciiCarrier 之类）必须显式置 `false`，`FilterPipeline.execute` 不再注入 `uSampler: currentTexture`——否则 "uSampler 总是前一 pass 输出" 的隐式约定会被静默违反。

## 服务端 AI 管线

### 模块边界
- `server/src/domain/prompt.ts` 是 prompt 词汇的唯一 source of truth。`gateway/` 与 `chat/persistence/` 都向下依赖 domain，不互相依赖。`Persisted*` 别名在 `chat/persistence/models.ts` 是纯 re-export，不是独立类型。
- `chat/domain/*` 持有跨 repository 共享的领域逻辑（accepted-state traversal、prompt version 比较、snapshot visibility）。Memory 和 Postgres repo 只做 IO + row mapping。

### ImageGenerationService
- `execute()` 刻意保留为 thin orchestrator 但 **超过 slice 计划的 150-250 行目标**：Phase 3 `createInitial` 字面量 + 响应 shape 组装留在 `execute()`——抽出来需要 15+ 参数包，in-place 才是顺序 recipe。
  - 触发重访：新生成 modality（视频、新 provider family）进入这条路径。
- 四个 coordinator 位于 `server/src/chat/application/imageGeneration/`：`PromptCompileCoordinator` / `InputAssetProjector` / `ProviderExecutor` / `GenerationPersister`。
- 组合通过 Fastify `app.imageGenerationService` 装饰；路由 **不得** `new ImageGenerationService(...)`。
- 编译缓存按 `targetKey` 缓存 per-attempt compile 结果。
- Prompt-state update 必须在 `completeGenerationSuccess` 之后，失败只 `logger.warn`；CAS 冲突不得丢 generation result。

### Router / provider
- Credential-missing → 503（retriable），不是 401。让 fallback loop 前进而不是整个请求炸掉。
- Health score 是 priority 后的 tiebreaker (`selection.ts`)。未配置 API key 的 provider 在 `selectRouteTargets` 阶段过滤掉；router 层的 credential-missing 503 是 safety net。
- Provider response 必须 Zod-parse。adapter 在 `server/src/providers/*` 里每个模型声明本地 schema，未知字段 strip、错类型失败——禁止 ad-hoc `isRecord` duck-typing。
- `router.generate` 通过可选 `logger` 输出 `{ provider, model, operation, success, latencyMs, errorType? }`，与 `routerHealth.record` 并行。

### 持久化
- pg-mem 做集成测试，不用 docker。boot ~200ms。
- Harness migration 后 drop 6 个 partial index：`chat_conversations_active_user_idx`、`chat_turns_conversation_visible_created_idx`、`chat_runs_job_id_idx`、`generated_images_active_lookup_idx`、`assets_owner_hash_active_idx`、`assets_owner_updated_active_idx`。pg-mem v3 的 partial-index planner bug 会吞掉 predicate 外的行，生产 Postgres 不受影响。
- `createGeneration` 的 additional runs + prompt versions 在单事务内完成，不得拆成多个 pre-dispatch transactions。

### `MemoryChatStateRepository` 存活中
- 退休被阻塞在 no-`DATABASE_URL` 启动行为决策上（fail-fast vs. pg-mem 作为 dev fallback）。
- `chat/domain/*` 共享 helpers 保证两个 repo 不在核心算法上漂移，风险有界。
- 触发重访：AI 编辑时开始混淆两个 repo，或启动 fallback 行为变成 real blocker。

## Canvas / 资产 / image-lab

### Canvas
- 从 `activeWorkbench` 面门收口到 `loadedWorkbench` 状态、命令、结构、历史 seam。
- Route-first workbench 激活 + 文本预提交 guard 是为了解决 workbench 切换时的文本会话竞争；不要拆。
- History 是 `entries + cursor` delta 模型，不是 `past/future` 双栈。

### Assets
- `assetId` 是唯一规范资产标识。`remoteAssetId` / `threadAssetId` 的客户端主模型已退休。
- 服务端入口 `server/src/routes/assets.ts` + `server/src/assets/*`；浏览器读 URL 统一走 `/api/assets/:assetId/:kind`，不暴露存储层地址。

### Image Lab
- 请求模型 `operation + inputAssets`。
- 会话状态以服务端 conversation view 为准，浏览器 session store 已移除。
- `image.edit` / `image.variation` 保留为语义操作（即使某些模型降级为 generate-only 执行）。

### Render 模块树
- 没有 `src/features/editor/*`——那棵树退休了。
- `src/render/image/*` 是单图内核；画布级预览/导出组合在 `src/features/canvas/*`。
- Scene/global render 被故意拆成后续任务（见 `docs/tasks/scene-global-render-follow-up.md`）。
