# Decisions

跨任务、跨 commit 的长期决策与刻意保留的妥协。读这份文档是为了：

- 避免撤销有意为之的选择
- 在边界情况下判断代码"为什么是这样"
- 找到重访某项决策的触发信号

**不写**：行数、测试数、"某命令当前通过/失败"。这些是状态，读这个文件的 agent 应该跑命令、读代码。

## 渲染管线

### Backend

- **WebGPU**，develop + film + carrier + effect + overlay + signal-damage 全链 WGSL。`src/lib/gpu/` 是 per-frame pipeline executor；`src/render/image/` 是 stage choreographer。入口：`WebGPURenderBackend`（`src/render/image/webgpuRenderBackend.ts`），由 `renderSingleImage.ts` 直接实例化。
- 单 Surface 路径。每个 per-image stage consume + return `RenderSurfaceHandle`；`*IfSupported` 回退分支已全部退役。`canvasMaterializations` 每次 render = 1（最终 `materializeToCanvas` 是唯一边界）。
- Canvas2D 只存活于 glyph atlas bake（一次 per charset+font）；stage 之间不得传递 `HTMLCanvasElement`。
- WebGL2 路径已彻底移除：`src/lib/renderer/`、`twgl.js`、所有 `.frag/.vert/.glsl` source、`src/lib/imageProcessing.ts` 的 `renderWithPipeline / RenderManager` 链路全部删除。每个 surface adapter 自己缓存 `ShaderCache + PipelineCache + TexturePool` per device（见 `src/lib/gpu/perDeviceCache.ts`），无全局 renderer 实例。

### Y-axis convention

- WebGPU 路径已原生 Y-invariant：WGSL vertex shader 输出 Y-invariant UV（`wgsl/lib/fullscreen.wgsl`），每一 pass 保持 top-down 方向。旧 WebGL2 的每偶数 pass Y-flip hack 已彻底消除。
- `renderer-y-convention-unification` 任务已关闭：WebGPU 路径以 design 解决 Y convention；旧 WebGL2 carrier 路径随 `media-native-render-pipeline` 一起退役。

### Cache keys

- 所有 cache key（source / pipeline / output）统一由 `src/lib/gpu/cacheKeys.ts` 构建，携带 schema version 前缀（`v1:...`）；无 ad-hoc per-module hash helpers。

### ASCII

- WebGPU ASCII 路径（`src/lib/gpu/passes/carrier/ascii/`）以 compute shader 做 per-cell feature extraction + structure-aware selection，支持 `structureWeight: 0–1`（0 = 纯 density，1 = 纯 structure matching）。
- 两阶段 compute chain：`analysis.wgsl` 累积 27-float 特征向量 + per-cell averaged RGBA → `toneNormalize.wgsl` 应用 brightness/contrast/density/coverage/invert/edgeEmphasis 后写 `cellTone` → `selection.wgsl` 用 `cellTone` 做 density-distance 匹配。Floyd-Steinberg dither 已被 Bayer 8×8 ordered 替换（FS 是顺序依赖，不适合 compute；≤ 4/255 gate 容忍替换；项目 pre-launch 不 dual-path）。
- 旧 Canvas2D `renderAsciiToCanvas` 已退休，**不是视觉参考基线**。

### Brush mask

- 上限 512 points。超过上限 `applyLocalMaskShapeOnSurface` 返回 `null`，调用方 fallback 到 CPU `drawLocalMaskShape` 写入同一 mask canvas，后续 GPU blend 仍消费它——stage 的 Surface-in/Surface-out 契约不破。
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

- 所有 surface adapter（`applyFilter2dOnSurface`、`applyHalftoneOnSurface`、`applyChannelDriftOnSurface`、`applyMaskedBlendOnSurface`、`applyLocalMaskShapeOnSurface`、`applyLocalMaskRangeOnSurface`、`applyTimestampOverlayOnSurface`、`applyNormalLayerBlendOnSurface`、`applyAsciiCarrierOnSurface`）用 `rgba8unorm` 作为 ping-pong 与 readback 格式。
- 旧 WebGL2 `PipelineRenderer.applyFilter2dSource` 在 device 支持时用 `RGBA16F` intermediate；现在 `adjust → blur(h) → blur(v) → dilate` 链每次写入量化到 8-bit。理论上极端组合（高 blur radius × `brightness >> 1`）下偏差可达 ~3–4/255 vs 旧 16F 路径——但旧路径已删除，没有 baseline。
- Revisit：若 carrier / overlay 链未来出现可见 banding 或 export 端 16-bit pipeline 接入，再统一切到 `rgba16float`（需要 device feature gate）。

## 诊断与回归观测

- Sensor shape 跟随领域失败形状；DB、render、Canvas command 与 provider 保持各自 payload 和 `globalThis.__filmlab_*` 出口，不引入统一 logger 抽象。
- `RenderBoundaryMetrics` ceiling 与 trace / output-hash baseline 是需显式审查的回归合同。只有预期的管线或视觉变化才能更新 baseline，不能自动接受漂移。
- `x-request-id` 是 client、server 与 provider 间唯一共享的关联键。服务端默认生成权威值；仅在 trusted-proxy 模式且格式合法时接受入站值，并把同一值写回响应与下游调用。
- Provider `responseBodyPreview` 只保证截断，不保证脱敏；不得把它视为可安全记录 secrets 的边界。
- `turn.error` 保持字符串。若 stage、trace 或 provider diagnosis 需要跨 reload 与支持流程存活，应显式扩展 repository 和 conversation view 模型，不增加仅在 UI 存活的兼容分支。

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
- Route-first workbench 激活 + 文本预提交 guard 是为了解决 workbench 切换时的文本会话竞争；不要拆。同一路径的恢复尝试不能被自身 mutation queue 状态失效，route/store 不一致期间必须保留 guard、隐藏并 `inert` 旧 surface，同时停用快捷键、overlay、toolbar 与 document/window 全局输入。
- Studio 的本地项目入口直接消费 `CanvasWorkbenchListEntry`，再按 `coverAssetId` 可选关联素材封面；素材缺失或读取中不能阻塞项目恢复。所有持久化项目必须可达，默认只折叠展示最近四项。若未来需要所见即所得封面，在 workbench 保存边界持久化缩略图，不在 Studio 批量渲染完整文档。
- Workbench 列表初始化必须区分读取失败与合法空库：失败保留已知列表并提供重试，不能把持久层异常吞成 `[]`。Canvas 的“新作品”回到 image-first Studio，选择输入前不得创建空 workbench。
- History 是 `entries + cursor` delta 模型，不是 `past/future` 双栈。
- Preview runtime 不得成为第二份持久化 document 或 Konva authority；最终提交保持一次手势、一次历史、一次持久化。当前全场景 preview 路径只在可达流程出现大场景或交互 trace 证明 missed frames 时重开优化。
- Canvas 根目录按领域分子目录：`geometry/`（resize / selection / overlay 几何）、`image/`（渲染状态、board 预览、属性、工厂）、`text/`（会话、样式、运行时视图模型）。不设 barrel `index.ts`，消费者直接导入子目录下具体文件。

### Computational Visual V1 boundary

- 产品主路径固定为 `image input → computational style → semantic overlay → social ratio → still artifact → reload`。Canvas 是持久化作品文档与 compositor，不再以空白画布作为产品入口。
- Style Lab 的 Mono Terminal、Color Glyph、Print Screen、Signal Loss、Data Mosaic 是 canonical `CanvasImageRenderStateV1` 的 outcome preset，不拥有第二套 authored state。新增方向应优先组合既有 carrier / signal-damage / overlay family；只有现有 family 无法表达时才扩展 renderer。
- V1 只承诺静态单图、1:1 / 4:5 / 9:16、PNG/JPEG 1x/2x。多图通用排版、视频、TIFF/16-bit 和跨设备 workbench 同步不是隐藏能力；出现明确产品需求时另开边界，不在 V1 控件上恢复旧路径。
- Caption / Watermark 已启用但文字为空，或文字叠层有效透明度接近零时，renderer 将其视为 no-op。启用状态可以先于文本提交持久化，不能让合法的中间状态破坏整张作品预览或导出。
- AI 生成只是可选 input channel；本地上传、粘贴和素材库主路径不得依赖 provider credential。

### Browser / server persistence boundary

- Workbench 与本地素材副本由浏览器 IndexedDB 持有；V1 不承诺跨设备项目恢复。需要跨设备项目时，先设计 server-side workbench ownership / conflict model，不能把 asset sync 当作 workbench sync。
- 生产素材持久化必须同时使用 Postgres repository 与 Supabase Storage。只配置数据库仍会让二进制落入进程内存；memory repository/storage 仅是 development fallback。
- V1 无登录 UI；生产宿主必须签发带稳定 `sub` 的 HS256 JWT，并在客户端注入 `filmlab_auth_token`。服务端 secret 不得进入浏览器；需要内建登录或第三方身份协议时重访这条 host-integration 边界。

### Artifact export

- V1 导出的唯一 authority 是 `renderCanvasWorkbenchToCanvas`，产品只发布 PNG/JPEG 1x/2x；预览与下载共用 canvas document renderer。
- Konva stage snapshot、slice series 与 TIFF UI 路径已退休，不保留不可达的双路径。底层 TIFF encoder 可继续作为独立基础设施存在，但不是可达产品能力。
- 16-bit 若重启，边界必须是 single-image renderer；Canvas2D document compositor 仍是 8-bit，不能从旧 stage export 路径恢复。

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
- Scene/global render 没有通用待办桶。只在出现具体 whole-scene 用例时重开，并先定义 authored state 归属、stage 顺序、preview/export 一致性与有界回归方案；单图内核仍是 per-image execution primitive。
