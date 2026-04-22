# Renderer Y Convention Unification

## Motivation

当前渲染内核存在两套冲突的 Y 约定并靠 draw 奇偶凑合：

- **源纹理上传** 开 `UNPACK_FLIP_Y_WEBGL=1`（`src/lib/renderer/TextureManager.ts::uploadSourceTexture`）→ 源纹理 `v=0` = 图像视觉底。
- **Fullscreen.vert** 发射 `vTextureCoord.y = 0.5 - a_position.y * 0.5` → `vTex.y=0` 对应 viewport 视觉顶。这使每跑一次 vertex shader，"viewport 侧的视觉顶"与"纹理侧的 v=0"方向相反，每 draw 净翻转一次 Y。
- **FilterPipeline** 对奇数长度的 pass 链末尾追加一个 `Passthrough` 强行凑偶，让偶次翻转相互抵消。

问题不是"复杂"而是**不自洽**：

1. Pass 分两类消费 `vTextureCoord.y`：
   - A 类：只做 `texture(uSampler, vTextureCoord)` 的纯采样（`Passthrough` / `OutputEncode` / `Master` / `HSL` / `Curve` / `Blur` 等）。
   - B 类：把 `vTextureCoord.y` 当视觉像素 Y 用（`Geometry.frag:72`、`AsciiCarrier.frag:118`、`TimestampOverlay.frag:76`、`BrushMaskStamp.frag:16`、`Overscan.frag:32-34`、`FilmEffectsUber.frag:146-148`）。
2. "draw 总数为偶"这个 invariant 只在全 A 类链里等价于"净 Y 翻转为 0"。B 类 shader 跑一次不按同一套翻转逻辑走（它内部已经按 `pixel.y=0 = 视觉顶` 的图像约定算），混合 A/B 时 parity hack 不再对应净翻转次数。
3. 用户实测 ASCII 开启后 Y 正、关闭后 Y 反，正是这种"A/B 混合时 parity 不等于净翻转"的直接证据。

## Target Architecture

统一成一套约定：

- `Fullscreen.vert` 改为 Y-invariant `vTextureCoord = a_position * 0.5 + 0.5`。这时 viewport 顶 ↔ `vTex.y=1` ↔ 纹理 `v=1`，viewport 到纹理内存的 Y 方向对齐。
- 保留源纹理 `UNPACK_FLIP_Y_WEBGL=1`（使 `v=1` = 图像视觉顶）。
- A 类 shader 不用改：`texture(uSampler, vTextureCoord)` 在 viewport 顶采样 `v=1` = 图像顶。
- 删除 `FilterPipeline` 的 parity passthrough：每 draw 不再翻 Y，任意次 draw 都保约定。
- B 类 shader 把 `vTextureCoord.y` 用作图像像素坐标时需要翻一下（`pixel.y = (1.0 - vTextureCoord.y) * size.y`）——在 Y-invariant 约定下 `vTex.y=1` 对应 viewport 顶 = 图像顶，但 JS 侧传入的像素坐标用"y=0 顶"的图像约定。
- Geometry.frag 的 rotate/translate/flip/perspective 方向也可能受影响，但这只在非默认 transform 下才暴露；默认 transform 下 Geometry 等价于 passthrough。

## Slices

### Slice 1 — Y-invariant vert + remove parity（当前会话）

- `src/lib/renderer/shaders/Fullscreen.vert`：`vTextureCoord = a_position * 0.5 + 0.5`
- `src/lib/renderer/gpu/FilterPipeline.ts`：删除 `yParityPassthroughProgram` 构造参数和 `execute` 里追加 passthrough 的分支
- `src/lib/renderer/PipelineRenderer.ts:566-570`：`new FilterPipeline(gl, this.texturePool)` 去掉第三个参数

**范围守住**：不动 `TextureManager.ts`（保留 `UNPACK_FLIP_Y=1`），不改 B 类 shader 的 pixel 数学。

**验证边界**：
- 初始加载（默认 transform）：canvas 视觉顶 = 图像顶 ✓ —— 这就是用户报告的 bug。
- A 类 shader 链（develop / master / LUT 等无效果开启也能过）每 draw 保约定，任意次数都对。
- ASCII 链独立 renderer slot，同样是 A 类 + B 类 generator，每 draw 保约定，保持正确。
- 不处理：非默认 `rotate / translate / flip / perspective` 下 Geometry 的方向感 —— 这类是 Slice 2。
- 不处理：`u_borderTexture / u_damageTexture / u_blueNoiseTexture` 以 `vTextureCoord.y` 当 tile pattern 的取法 —— tile 相位可能移动，但视觉上是周期性纹理，接受变化或列入 Slice 2。

**回归预期**：
- 初始加载 Y 正（用户已确认 bug）。
- 下列操作可能暂时方向反：`Geometry` 旋转 / `Geometry` 垂直翻转 / `Geometry` vertical 平移 / `Timestamp` 位置 / `Brush mask` 戳点位置 / `ASCII` cell 网格对齐（若用户测）。这些在 Slice 2 修。

### Slice 2 — B 类 shader pixel 数学统一到"图像约定"

待 Slice 1 验证后展开：

- `Geometry.frag:72` → `pixel = vec2(vTextureCoord.x, 1.0 - vTextureCoord.y) * outSize`；复查 `rotate / translate / flip / perspective / lens` 在新 pixel.y 约定下方向是否跟 JS 传入参数一致（JS 侧 `u_translatePx.y`、`u_rotate` sign、`cropRect.y` 都以 y=0 为顶的图像约定）。
- `AsciiCarrier.frag:118`、`TimestampOverlay.frag:76`、`BrushMaskStamp.frag:16` 同样的 `pixel.y` 翻转。
- 非源图 upload（`borderTexture` / `damageTexture` / mask / glyph atlas / cell 色网格）按需补 `flipY`，或者在采样处翻转 v。

### Slice 3 — 清理 & 测试更新

- 删 `Passthrough.frag` 里为 parity 预留的注释。
- 更新 `FilterPipeline` / `PipelineRenderer` / `ProgramRegistry` 相关单测的奇偶假设。
- 把 `docs/decisions.md` 里的"每 draw 翻 Y + parity 补偶"条目替换成"每 draw 保 Y"。

## Validation Commands

每个 slice 完成后：

- `pnpm -C /workspace/project/FilmLab test --filter renderer` —— FilterPipeline 相关单测
- `pnpm -C /workspace/project/FilmLab test` —— 全量
- 手工：`agent-browser` 打开 canvas，目视验证初始加载正向、非默认 transform 方向正确

## Rollback

Slice 1 rollback：还原 `Fullscreen.vert`、`FilterPipeline.ts`、`PipelineRenderer.ts` 三个文件即可。Slice 2/3 叠加后整体 revert 到 Slice 1 baseline。
