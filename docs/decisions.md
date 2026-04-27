# Decisions

跨任务、跨 commit 的长期决策与刻意保留的妥协。读这份文档是为了：

- 避免撤销有意为之的选择
- 在边界情况下判断代码"为什么是这样"
- 找到重访某项决策的触发信号

**不写**：行数、测试数、"某命令当前通过/失败"。这些是状态，读这个文件的 agent 应该跑命令、读代码。

## 渲染管线

### Backend
- **WebGPU**，develop + film 内核全 WGSL。`src/lib/gpu/` 是 per-frame pipeline executor；`src/render/image/` 是 stage choreographer。入口：`WebGPURenderBackend`（`src/render/image/webgpuRenderBackend.ts`），由 `renderSingleImage.ts` 直接实例化。
- 单 Surface 路径。每个 per-image stage consume + return `RenderSurfaceHandle`；`*IfSupported` 回退分支已全部退役。`canvasMaterializations` 每次 render = 1（最终 `materializeToCanvas` 是唯一边界）。
- Canvas2D 只存活于 glyph atlas bake（一次 per charset+font）；stage 之间不得传递 `HTMLCanvasElement`。
- Carrier / effects / overlay 层（`src/render/image/asciiEffect.ts`、`effectExecution.ts`、`overlayExecution.ts` 等）当前仍经由 `gpuSurfaceOperation.ts` → `PipelineRenderer`（WebGL2）执行；替换尚无对应任务，在此之前 `src/lib/renderer/` 不得整体删除。

### Y-axis convention
- WebGPU 路径已原生 Y-invariant：WGSL vertex shader 输出 Y-invariant UV（`wgsl/lib/fullscreen.wgsl`），每一 pass 保持 top-down 方向。旧 WebGL2 的每偶数 pass Y-flip hack 已彻底消除。
- `renderer-y-convention-unification` 任务已关闭：WebGPU 路径以 design 解决 Y convention；旧 WebGL2 carrier 路径随 `media-native-render-pipeline` 一起退役。

### Cache keys
- 所有 cache key（source / pipeline / output）统一由 `src/lib/gpu/cacheKeys.ts` 构建，携带 schema version 前缀（`v1:...`）；无 ad-hoc per-module hash helpers。

### ASCII
- WebGPU ASCII 路径（`src/lib/gpu/passes/carrier/ascii/`）以 compute shader 做 per-cell feature extraction + structure-aware selection，支持 `structureWeight: 0–1`（0 = 纯 density，1 = 纯 structure matching）。
- Canvas2D `renderAsciiToCanvas` 已退休。旧 Canvas2D fallback 从未视觉验证，**不是视觉参考基线**。
- ASCII carrier slot id 必须是常量（`ASCII_CARRIER_SLOT_ID = "ascii-carrier"`）——每 carrier 分配独立 renderer 会导致泄漏。

### Brush mask
- `GPU_BRUSH_MASK_MAX_POINTS = 512`。超过上限 GPU 路径返回 false，CPU `drawLocalMaskShape` 写入同一 mask canvas，后续 GPU blend 仍消费它——stage 的 Surface-in/Surface-out 契约不破。
- 不要提升上限；若 brush GPU 是 measured hotspot，优化方向是减少 per-dab fullscreen pass 数，不是放宽 fallback 阈值。

### Pipeline stages & authored families

- Stage 顺序：`develop → style → overlay → finalize`。`style` 消费 develop surface，`overlay` 消费 style surface，`finalize` 输出到 canvas。
- `CanvasImageRenderStateV1` 按 family 分桶：`carrierTransforms`（ASCII、halftone）、`signalDamage`（channel drift）、`semanticOverlays`（timestamp、caption、watermark）、`motionPrograms`（signal-drift）。不得将新 carrier / damage / overlay 推入 `effects[]`。
- 已知后续扩展点（无任务，不阻塞当前代码）：board/global overlay 归属规则、dither/palette/textmode carrier 族、line-displacement/pixel-sort signal damage 族、grain-oscillate/exposure-breathe motion preset、analysis 层新类型（segmentation、face landmarks、OCR）。

### Quality tier

- `RenderQualityTier` (`"interactive" | "quality" | "export"`) 替换已退役的 `ImageRenderIntent + ImageRenderQuality`，通过 `resolveRenderQualityTierConfig(tier)` 映射执行行为；authored state 不随 tier 变化。

### Analysis layer

- `AnalysisLayerInputs`（`stageSnapshots` + `edgeMap`）替换 ad-hoc `CarrierSnapshots`；requirements 由 transform 声明推导（`deriveAnalysisRequirements`），不由 authored state 手写。
- `validateAnalysisInputs`：export tier 缺失 throw，preview tier degrade。

### Motion

- `MotionProgram` authored type，`renderMotionSequence` 在 single-image kernel 之上组合 per-frame 渲染；single-image kernel 不感知 time/frame state。
- 触发重访：需要 per-frame stateful accumulator 或 video codec 接入时。

### GPU-first / CPU-fallback 边界
- GPU-first：masked stage blend、filter2d、local-mask range gating、local-adjustment output composition、linear/radial mask shapes。
- CPU permanent：brush-mask 超上限 + renderer-unavailable（context lost / destroyed）。

### WGSL surface-adapter 中间格式
- `applyFilter2dOnSurface`、`applyHalftoneOnSurface`、`applyChannelDriftOnSurface`、`applyMaskedBlendOnSurface` 全部用 `rgba8unorm` 作为 ping-pong 与 readback 格式。
- 旧 `PipelineRenderer.applyFilter2dSource` 在 device 支持时用 `RGBA16F` intermediate；新链 `adjust → blur(h) → blur(v) → dilate` 在每次写入都量化到 8-bit。理论上极端组合（高 blur radius × `brightness >> 1`）下与旧 16F 路径偏差可达 ~3–4/255。
- 当前 smoke harness 自身用 8-bit GLSL reference，所以 ≤ 2/255 gate 仍然成立；这是 vs WebGL2 production 的潜在 divergence，不是 vs validated baseline 的 regression。
- Revisit：若 carrier / overlay 链未来出现可见 banding 或 export 端 16-bit pipeline 接入，再统一切到 `rgba16float`（需要 device feature gate）。

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
- Canvas 根目录按领域分子目录：`geometry/`（resize / selection / overlay 几何）、`image/`（渲染状态、board 预览、属性、工厂）、`text/`（会话、样式、运行时视图模型）。不设 barrel `index.ts`，消费者直接导入子目录下具体文件。

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
