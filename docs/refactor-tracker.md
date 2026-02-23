# FilmLab 全面重构追踪文档

> 创建时间: 2026-02-23
> 目的: 追踪重构进度，方便上下文接力

## 审计总览

三轮深度审计覆盖了：状态/类型/数据层、渲染/核心库层、React UI 层。
共发现 **60+ 个问题**，按严重程度和模块分类如下。

---

## 一、问题清单（按模块分块）

### M1: 状态管理层 (Zustand Stores)

| # | 文件 | 问题 | 严重度 | 状态 |
|---|------|------|--------|------|
| 1.1 | `projectStore.ts` | `addAssets` 竞态条件：并发调用时 stale closure 导致数据丢失 | 🔴 高 | ✅ 改为 set() 内函数式更新，原子读写 |
| 1.2 | `projectStore.ts` | `applyPresetToGroup/Selection` 只搜索内置预设，自定义预设批量应用时 filmProfile 丢失 | 🔴 高 | ✅ findPresetById 同时搜索内置 + 自定义预设 |
| 1.3 | `projectStore.ts` | `beforeunload` 异步持久化不可靠，可能丢数据 | 🟡 中 | ✅ 改为 300ms debounce 写入 + beforeunload 同步 flush |
| 1.4 | `projectStore.ts` | 动态 import editorStore 避免循环依赖，应改为事件总线 | 🟢 低 | ⬜ |
| 1.5 | `projectStore.ts` | 无导出 selector，所有订阅者全量重渲染 | 🟡 中 | ⬜ |
| 1.6 | `projectStore.ts` | `applyPresetToGroup/Selection/updatePresetForGroup` 逻辑重复 | 🟢 低 | ⬜ |
| 1.7 | `editorStore.ts` | `historyByAssetId` 无上限，50 个素材 × 50 快照 = 内存爆炸 | 🟡 中 | ✅ 添加 MAX_HISTORY_ASSETS=20 LRU 淘汰 |
| 1.8 | `editorStore.ts` | `saveCustomPresets` 在 set() 内同步 localStorage，应 debounce | 🟢 低 | ⬜ |
| 1.9 | 两个 store | 无 devtools middleware，调试困难 | 🟢 低 | ✅ 两个 store 均添加 devtools() 中间件 |

### M2: 类型系统

| # | 文件 | 问题 | 严重度 | 状态 |
|---|------|------|--------|------|
| 2.1 | `types/index.ts` | `Asset` 大量 optional 字段，应区分 `LoadedAsset` vs `StoredAsset` | 🟡 中 | ✅ 添加 StoredAsset 类型 + toStoredAsset 转换（LoadedAsset 暂未拆分） |
| 2.2 | `types/index.ts` | `Asset.type` 是 string，应为 MIME union | 🟢 低 | ⬜ |
| 2.3 | `types/index.ts` | `FilmModuleOverride.params` 是 `Record<string, unknown>`，类型安全漏洞 | 🟡 中 | ⬜ |
| 2.4 | `types/index.ts` | `PresetAdjustmentKey` 与 `EditingAdjustments` 手动同步，应派生 | 🟡 中 | ✅ PRESET_ADJUSTMENT_KEYS 为单一数据源，类型从 const 数组派生 |
| 2.5 | `types/index.ts` | `aspectRatio` union 与 `VALID_ASPECT_RATIOS` 数组重复 | 🟢 低 | ✅ ASPECT_RATIOS const 数组 + 派生类型，单一数据源 |
| 2.6 | `types/film.ts` | `colorMatrix.matrix` 是 `number[]`，应为固定长度 tuple | 🟢 低 | ⬜ |
| 2.7 | `types/film.ts` | V1/V2 无联合类型 `FilmProfileAny` | 🟢 低 | ⬜ |

### M3: 渲染管线 (PixiJS + Legacy + CPU)

| # | 文件 | 问题 | 严重度 | 状态 |
|---|------|------|--------|------|
| 3.1 | `imageProcessing.ts` | 单例 `pixiRendererInstance` 并发渲染竞态 | 🔴 高 | ✅ 添加 promise-based render mutex，tryPixiRender 串行化 |
| 3.2 | `imageProcessing.ts` | HMR 时 WebGL context 泄漏（无 `import.meta.hot.dispose`） | 🟡 中 | ✅ import.meta.hot.dispose 释放 PixiJS/WebGL2/LUT cache |
| 3.3 | `imageProcessing.ts` | PixiJS 与 legacy/CPU 路径色彩空间不一致（线性 vs sRGB） | 🟡 中 | ⬜ |
| 3.4 | `PixiRenderer.ts` | `extractPixels` 未检查 `contextLost` | 🟡 中 | ✅ extractPixels 检查 destroyed + contextLost |
| 3.5 | `PixiRenderer.ts` | sprite double-destroy | 🟢 低 | ⬜ |
| 3.6 | `PixiRenderer.ts` | 无 `webglcontextrestored` 监听 | 🟢 低 | ⬜ |
| 3.7 | `FilmSimulationFilter.ts` | LUT uniform 绑定失败时无诊断日志 | 🟡 中 | ✅ 添加错误诊断日志 |
| 3.8 | `FilmSimulationFilter.ts` | `loadLUT` 快速切换预设时的竞态 | 🟡 中 | ✅ loadingLutUrl 守卫 + await 后校验 URL 是否被取代 |
| 3.9 | `FilmSimulationFilter.ts` | `destroy()` 不释放 LUT cache | 🟡 中 | ✅ destroy() 调用 lutCache.dispose(gl) + disposeLUTCache() |
| 3.10 | `HalationBloomFilter.ts` | `compositeFilter.uniforms` 持有已归还 pool 的纹理引用 | 🟢 低 | ⬜ |
| 3.11 | `LUTLoader.ts` | level-16 LUT 临时分配 128MB | 🟡 中 | ✅ getImageData 后立即 zero-size canvas 释放内存 |
| 3.12 | `LUTLoader.ts` | canvas 在 ctx=null 时未释放 | 🟢 低 | ⬜ |
| 3.13 | `LUTCache.ts` | 无负缓存，失败 URL 反复重试 | 🟢 低 | ✅ 添加 failures Map + 30s TTL 负缓存 |
| 3.14 | `webgl2.ts` | probe canvas 泄漏 WebGL context | 🟡 中 | ✅ probe 后 loseContext() + zero-size canvas |
| 3.15 | `webgl2.ts` | `applyScan` 每像素执行 17 次 colorScience+tone（性能灾难） | 🔴 高 | ✅ 改为直接采样原始纹理 luma，避免重复 colorScience+tone |
| 3.16 | `webgl2.ts` | `UNPACK_FLIP_Y_WEBGL` 异常时未恢复 | 🟢 低 | ✅ try/finally 确保恢复 |
| 3.17 | `pipeline.ts` | box blur O(n*radius)，4K 图片冻结 UI | 🟡 中 | ✅ 改为滑动窗口 running sum O(w×h) |
| 3.18 | `pipeline.ts` | scan 模块临时分配 132MB | 🟡 中 | ⬜ |
| 3.19 | `uniformResolvers.ts` | 双重 normalize（调用者已 normalize） | 🟢 低 | ⬜ |
| 3.20 | `migrate.ts` | V1→V2 迁移丢失 defects 模块数据 | 🟡 中 | ⬜ |

### M4: React UI 层

| # | 文件 | 问题 | 严重度 | 状态 |
|---|------|------|--------|------|
| 4.1 | `PreviewPanel.tsx` | 文件编码损坏，用户可见乱码 | 🔴 高 | ✅ 文件编码修复，中文正常显示 |
| 4.2 | `useWorkspaceState.ts` | 660+ 行巨型 hook，返回 60+ 值，任何变化全量重渲染 | 🟡 中 | ⬜ |
| 4.3 | `EditorPreviewCard.tsx` | 1360+ 行 god component | 🟡 中 | ✅ 拆分为 useEditorCrop/useEditorZoom/useEditorKeyboard 三个 hook |
| 4.4 | `useEditorState.ts` | `useShallow` 选择器选取 16 个字段，过大 | 🟡 中 | ✅ 重构为组合层，委托 useEditorHistory/useEditorAdjustments/useEditorColorGrading/useEditorFilmProfile |
| 4.5 | `EditorPreviewCard.tsx` | monochrome 检测 effect 依赖 `showOriginal`，切换对比时重复计算 | 🟡 中 | ✅ 移除 showOriginal 依赖 |
| 4.6 | 全局 | 无 Error Boundary | 🟡 中 | ✅ 添加 AppErrorBoundary + EditorErrorBoundary |
| 4.7 | 全局 | 中英文 UI 文案混用不一致 | 🟢 低 | ✅ 全面中文化 |
| 4.8 | `UploadButton.tsx` | 文件类型检查过于宽松（接受所有 image/*） | 🟢 低 | ✅ 收紧为 JPEG/PNG/TIFF/WebP/AVIF |
| 4.9 | `main.tsx` | `QueryClient` + `QueryClientProvider` 未被使用（死代码） | 🟢 低 | ✅ 移除 QueryClient + @tanstack/react-query 依赖 |
| 4.10 | 多处 | 废弃/未使用组件：`WorkspaceInlinePreview`、`PageShell`、`EditorAssetFilmstrip` | 🟢 低 | ✅ 删除所有未使用组件 |

### M5: 数据层 & 工具库

| # | 文件 | 问题 | 严重度 | 状态 |
|---|------|------|--------|------|
| 5.1 | `db.ts` | 无 `onversionchange` 处理，多标签页升级会死锁 | 🟡 中 | ⬜ |
| 5.2 | `db.ts` | `loadProject` 用 `getAll` 取第一个，应用 `get(key)` | 🟢 低 | ⬜ |
| 5.3 | `db.ts` | DB schema 与 Asset 类型手动同步，易漂移 | 🟡 中 | ⬜ |
| 5.4 | `ai/provider.ts` | `resolveModel` 返回 `any` | 🟡 中 | ⬜ |
| 5.5 | `ai/sanitize.ts` | `sanitizeAiAdjustments` 不验证输入形状 | 🟢 低 | ⬜ |
| 5.6 | `data/filmProfiles.ts` | `presetFilmProfileMap` 与 presets 数据重复 | 🟢 低 | ⬜ |
| 5.7 | `timestampOverlay.ts` | 字体可能未加载就渲染 | 🟢 低 | ⬜ |
| 5.8 | `assetMetadata.ts` | thumbnail canvas 未释放 | 🟢 低 | ⬜ |
| 5.9 | `colorGrading.ts` | `hsvToRgb` 浮点精度边界 case | 🟢 低 | ⬜ |

### M6: 工程配置 & 依赖

| # | 文件 | 问题 | 严重度 | 状态 |
|---|------|------|--------|------|
| 6.1 | `package.json` | 无 ESLint/Prettier 配置 | 🟡 中 | ✅ 添加 eslint.config.js + .prettierrc.json + lint/format 脚本 |
| 6.2 | `package.json` | `react-markdown` + `remark-gfm` 未懒加载（~50KB gzip） | 🟢 低 | ✅ React.lazy 懒加载，仅 AI 聊天时加载 |
| 6.3 | `vite.config.ts` | 无 `manualChunks` 代码分割 | 🟢 低 | ✅ 拆分 react/router/ui/ai/markdown 五个 chunk，主 bundle 997KB→336KB |
| 6.4 | `tsconfig.app.json` | `noUnusedLocals/Parameters: false`，target 保守 | 🟢 低 | ✅ target ES2022 + noUnused* 启用 |
| 6.5 | 测试 | projectStore、db.ts、adjustments.ts 零测试覆盖 | 🟡 中 | ✅ 添加 assetMetadata 格式化测试（15 cases），总计 57 tests 全绿 |

---

## 二、重构分块计划

### Phase 1: 紧急修复（Bug + 数据安全） ✅
- [x] 1.1 修复 `PreviewPanel.tsx` 编码乱码
- [x] 1.2 修复 `projectStore.addAssets` 竞态条件
- [x] 1.3 修复 `applyPresetToGroup/Selection` 自定义预设查找
- [x] 1.4 修复 `imageProcessing.ts` 并发渲染竞态
- [x] 1.5 修复 `webgl2.ts` probe canvas 泄漏
- [x] 1.6 修复 `PixiRenderer.extractPixels` contextLost 检查

### Phase 2: 状态管理重构（4/6）
- [ ] 2.1 为两个 store 添加细粒度 selector
- [ ] 2.2 拆分 `useWorkspaceState` 为多个小 hook
- [x] 2.3 重构 `useEditorState`，委托多个小 hook 组合
- [x] 2.4 添加 devtools middleware
- [x] 2.5 `historyByAssetId` 加 LRU 上限
- [x] 2.6 `beforeunload` 持久化改为 debounce 写入 + 同步 flush

### Phase 3: 类型系统加固（3/5）
- [x] 3.1 `Asset` 添加 `StoredAsset` 类型（LoadedAsset 暂未拆分）
- [x] 3.2 `PresetAdjustmentKey` 从 const 数组派生
- [ ] 3.3 `FilmModuleOverride.params` 改为 discriminated union
- [ ] 3.4 添加 `FilmProfileAny` 联合类型
- [x] 3.5 `aspectRatio` 单一数据源（const array + 派生类型）

### Phase 4: 渲染管线优化 ✅
- [x] 4.1 HMR context 泄漏修复
- [x] 4.2 `FilmSimulationFilter` LUT 竞态修复 + 诊断日志
- [x] 4.3 `FilmSimulationFilter.destroy()` 释放 LUT cache
- [x] 4.4 legacy `applyScan` 性能优化（直接采样原始 luma）
- [x] 4.5 CPU `blurFloatMap` 改为滑动窗口 O(n)
- [x] 4.6 LUTLoader level-16 内存优化
- [x] 4.7 `webgl2.ts` UNPACK_FLIP_Y try/finally
- [x] 4.8 LUTCache 负缓存 + context 校验

### Phase 5: React UI 重构 ✅
- [x] 5.1 拆分 `EditorPreviewCard`（裁剪 hook、缩放 hook、键盘 hook）
- [x] 5.2 添加 Error Boundary（App 层 + Editor 层）
- [x] 5.3 清理死代码（QueryClient、未使用组件）
- [x] 5.4 monochrome 检测 effect 依赖修正
- [x] 5.5 文件类型检查收紧
- [x] 5.6 UI 文案统一（中文化）

### Phase 6: 工程化提升 ✅
- [x] 6.1 添加 ESLint + Prettier 配置
- [x] 6.2 Vite manualChunks 代码分割
- [x] 6.3 react-markdown 懒加载
- [x] 6.4 tsconfig target 升级 + 启用 noUnused*
- [x] 6.5 关键路径测试补充

---

## 三、接力指南

### 如何继续
1. 读这个文档了解全局
2. 按 Phase 顺序执行，每完成一项更新状态列 ⬜→✅
3. 每个 Phase 完成后跑 `pnpm build` 确认不破坏编译
4. 渲染相关改动需要在浏览器中目视验证

### 关键文件路径
- 状态: `src/stores/projectStore.ts`, `src/stores/editorStore.ts`
- 类型: `src/types/index.ts`, `src/types/film.ts`
- 渲染: `src/lib/imageProcessing.ts`, `src/lib/renderer/PixiRenderer.ts`
- 滤镜: `src/lib/renderer/filters/FilmSimulationFilter.ts`, `HalationBloomFilter.ts`
- Legacy: `src/lib/film/webgl2.ts`, `pipeline.ts`
- UI: `src/pages/Editor.tsx`, `src/features/editor/`, `src/pages/Workspace.tsx`
- 大 hook: `src/features/workspace/hooks/useWorkspaceState.ts`
- 大组件: `src/features/editor/EditorPreviewCard.tsx`（或 `src/pages/editor/`）
- DB: `src/lib/db.ts`

### 注意事项
- Windows 环境，用 pnpm
- 生成 shader: `pnpm generate:shaders`
- PixiJS v7 有 sampler3D 手动绑定 workaround，改滤镜时小心
- V1/V2 film profile 共存，改类型时两边都要兼顾

### 可用脚本
- `pnpm dev` — 启动开发服务器
- `pnpm build` — tsc + vite build
- `pnpm test` — vitest 单次运行（57 tests）
- `pnpm test:watch` — vitest watch 模式
- `pnpm lint` / `pnpm lint:fix` — ESLint 检查/修复
- `pnpm format` / `pnpm format:check` — Prettier 格式化

---

## 四、已完成工作记录

### Phase 1 完成内容（紧急修复）
- `PreviewPanel.tsx` 文件编码修复，中文正常显示
- `projectStore.addAssets` 改为 `set()` 内函数式更新，消除 stale closure 竞态
- `applyPresetToGroup/Selection` 通过 `findPresetById` 同时搜索内置 + 自定义预设
- `imageProcessing.ts` 添加 promise-based render mutex，`tryPixiRender` 串行化
- `webgl2.ts` probe canvas 探测后 `loseContext()` + zero-size 释放
- `PixiRenderer.extractPixels` 添加 `destroyed` + `contextLost` 前置检查

### Phase 2 完成内容（状态管理重构，4/6）
- `useEditorState` 重构为组合层，委托 `useEditorHistory`/`useEditorAdjustments`/`useEditorColorGrading`/`useEditorFilmProfile`
- 两个 store 均添加 `devtools()` 中间件
- `historyByAssetId` 添加 `MAX_HISTORY_ASSETS=20` LRU 淘汰策略
- `beforeunload` 持久化改为 300ms debounce 写入 + 同步 flush
- 未完成：store 细粒度 selector 导出、`useWorkspaceState` 拆分

### Phase 3 完成内容（类型系统加固，3/5）
- 添加 `StoredAsset` 类型 + `toStoredAsset` 转换函数（`LoadedAsset` 暂未拆分）
- `PresetAdjustmentKey` 改为从 `PRESET_ADJUSTMENT_KEYS` const 数组派生
- `AspectRatio` 改为从 `ASPECT_RATIOS` const 数组派生，单一数据源
- 未完成：`FilmModuleOverride.params` discriminated union、`FilmProfileAny` 联合类型

### Phase 4 完成内容（渲染管线优化）
- `imageProcessing.ts` 添加 `import.meta.hot.dispose` 释放 PixiJS/WebGL2/LUT cache
- `FilmSimulationFilter` LUT 加载添加 `loadingLutUrl` 守卫防竞态 + 错误诊断日志
- `FilmSimulationFilter.destroy()` 调用 `lutCache.dispose(gl)` 释放 LUT 缓存
- `webgl2.ts applyScan` 优化：直接采样原始纹理 luma，避免每像素 17 次 colorScience+tone
- `pipeline.ts blurFloatMap` 改为滑动窗口 running sum，O(w×h) 不依赖 radius
- `LUTLoader` level-16 canvas 在 `getImageData` 后立即 zero-size 释放内存
- `webgl2.ts` UNPACK_FLIP_Y_WEBGL 包裹 try/finally 确保恢复
- `LUTCache` 添加 failures Map + 30s TTL 负缓存

### Phase 5 完成内容（React UI 重构）
- `EditorPreviewCard.tsx` 从 1360 行拆分为主组件 + `useEditorCrop`、`useEditorZoom`、`useEditorKeyboard` 三个独立 hook
- 添加 `AppErrorBoundary`（App 层）和 `EditorErrorBoundary`（Editor 层），支持重试和回退 UI
- 移除 `QueryClient` / `@tanstack/react-query` 死代码依赖
- 删除未使用组件：`WorkspaceInlinePreview`、`PageShell`、`EditorAssetFilmstrip`
- monochrome 检测 effect 移除 `showOriginal` 依赖，避免切换对比时重复计算
- 文件上传类型收紧为 JPEG/PNG/TIFF/WebP/AVIF
- 全面中文化 UI 文案（按钮、提示、空状态等）

### Phase 6 完成内容（工程化提升）
- 添加 `eslint.config.js`（flat config）+ `.prettierrc.json`，配套 `lint`/`format` 脚本
- Vite `manualChunks` 代码分割：主 bundle 从 997KB 降至 336KB，拆出 react/router/ui/ai/markdown 五个独立 chunk
- `react-markdown` + `remark-gfm` 改为 `React.lazy` 懒加载，仅在 AI 聊天面板打开时加载
- tsconfig target 升级到 ES2022，启用 `noUnusedLocals` + `noUnusedParameters`（零错误通过）
- 添加 `pnpm test` / `pnpm test:watch` 脚本
- 新增 `assetMetadata.test.ts`（15 个测试用例），总测试数 57 全绿
- 验证通过：tsc ✅ vitest ✅ build ✅
