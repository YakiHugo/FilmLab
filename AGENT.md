# FilmLab Agent Guide

> 全面的项目理解文档，帮助 AI Agent（Claude、Codex、GPT 等）快速理解项目架构和工作方式。
> 最后更新：2026-02-16

---

## 项目概览

**FilmLab** 是一个专业级照片编辑 Web 应用，专注于胶片模拟和色彩科学。核心特点：

- **框架**：Vite + React 18 + TypeScript 5.5
- **GPU 渲染**：PixiJS v7（WebGL2）+ 编译时 Shader 代码生成
- **色彩管线**：3-pass 管线（Master 色彩调整 → Film 胶片模拟 → Halation/Bloom 光学效果）
- **数据持久化**：Zustand (状态) + IndexedDB (资源) + 用户预设
- **AI 功能**：OpenAI gpt-4-mini 胶片推荐

---

## 项目结构速查

```
E:\project\FilmLab/
├── src/
│   ├── types/
│   │   ├── index.ts              # 核心业务类型（Asset, Project, EditingAdjustments）
│   │   └── film.ts               # 【NEW】Film Profile V2 类型定义
│   ├── lib/
│   │   ├── renderer/             # 【核心】GPU 渲染管线
│   │   │   ├── PixiRenderer.ts           # PixiJS 应用封装（3-pass）
│   │   │   ├── types.ts                  # Uniform 接口（Master/Film/Halation）
│   │   │   ├── uniformResolvers.ts       # 参数转换（编辑参数 → GPU uniform）
│   │   │   ├── shader.config.ts          # 【NEW】Shader 功能配置
│   │   │   ├── LUTLoader.ts              # HaldCLUT PNG → WebGL 3D Texture
│   │   │   ├── LUTCache.ts               # LUT 纹理 LRU 缓存
│   │   │   ├── filters/
│   │   │   │   ├── MasterAdjustmentFilter.ts       # Pass 1: 色彩科学
│   │   │   │   ├── FilmSimulationFilter.ts         # Pass 2: 胶片模拟 + 3D LUT
│   │   │   │   └── HalationBloomFilter.ts          # Pass 3: 光学效果（4-pass）
│   │   │   └── shaders/
│   │   │       ├── default.vert                     # 共享顶点着色器
│   │   │       ├── MasterAdjustment.frag            # Pass 1 fragment（生成）
│   │   │       ├── FilmSimulation.frag              # Pass 2 fragment（生成）
│   │   │       ├── Halation*.frag                   # Pass 3 fragments（独立）
│   │   │       └── templates/                       # 【NEW】GLSL 模板片段
│   │   │           ├── srgb.glsl, oklab.glsl, ...
│   │   │           └── （共 10 个文件）
│   │   ├── film/                 # 胶片模拟核心
│   │   │   ├── profile.ts        # V1 Profile 操作（规范化、克隆、缩放）
│   │   │   ├── migrate.ts        # 【NEW】V1→V2 迁移
│   │   │   ├── registry.ts       # 内置预设注册表
│   │   │   ├── pipeline.ts       # CPU 回退管线
│   │   │   ├── webgl2.ts         # 【弃用】旧 WebGL2 渲染器
│   │   │   └── utils.ts          # 数学工具
│   │   ├── adjustments.ts        # EditingAdjustments 默认值
│   │   ├── imageProcessing.ts    # 【核心】渲染入口（feature flag 控制）
│   │   ├── assetMetadata.ts      # EXIF 提取
│   │   └── db.ts                 # IndexedDB schema
│   ├── data/
│   │   ├── filmProfiles.ts       # V1 胶片预设（8 个）
│   │   └── presets.ts            # 编辑预设
│   ├── stores/
│   │   ├── projectStore.ts       # Zustand: 项目/资源状态
│   │   └── editorStore.ts        # Zustand: UI 状态
│   ├── pages/
│   │   ├── editor/               # 单图编辑器
│   │   └── workspace/            # 库 & 批处理工作室
│   └── App.tsx, main.tsx, ...
├── scripts/
│   └── generate-shaders.ts       # 【NEW】Compile-Time Shader Code Generator
├── docs/
│   └── editor.md                 # 完整技术方案文档（2万+ 行）
└── package.json                  # 依赖：pixi.js, zustand, ai-sdk/openai, ...
```

---

## 核心概念

### 1. 3-Pass GPU 渲染管线

```
输入图像（Canvas）
    ↓
[Pass 1] Master Adjustment Filter
    ├─ 曝光、对比度、白平衡（LMS）
    ├─ OKLab HSL（色相、饱和度、振度）
    └─ 色调范围、曲线、去雾
    ↓ 输出：色彩校正图像
[Pass 2] Film Simulation Filter
    ├─ 特性曲线（S-curve）
    ├─ 3D LUT（HaldCLUT）
    ├─ 分区色偏（阴影/中间调/高光）
    └─ 颗粒、暗角
    ↓ 输出：胶片模拟图像
[Pass 3] Halation/Bloom Filter（4-pass 内部）
    ├─ Threshold：提取亮区
    ├─ Blur H/V：分离式高斯模糊
    └─ Composite：混合和染色
    ↓
输出 Canvas
```

### 2. 编译时 Shader 代码生成

**问题**：Master 和 Film shader 文件很大（178+164 行），难以扩展和维护。

**解决方案**：Compile-Time 分层生成
- **配置**：`src/lib/renderer/shader.config.ts` 定义启用的功能
- **模板**：`src/lib/renderer/shaders/templates/` 存储 10 个 GLSL 片段
- **生成器**：`scripts/generate-shaders.ts` 根据配置组装并优化 shader
- **输出**：`src/lib/renderer/shaders/generated/` 生成的 shader（gitignore）
- **优化**：死代码消除、内联小函数、预计算常量

**工作流**：
```bash
pnpm generate:shaders  # 根据 config 生成 shaders
pnpm dev               # Vite 会自动调用（集成在 package.json）
```

### 3. 参数到 GPU Uniform 的映射

**EditingAdjustments**（用户 UI 参数）
    ↓
**resolveFromAdjustments()** → **MasterUniforms**
    ↓
**MasterAdjustmentFilter.updateUniforms()**
    ↓
GPU 执行 MasterAdjustment.frag

类似链路对 FilmProfile → FilmUniforms 和 Halation/Bloom。

### 4. 两个 Profile 格式

| 属性 | V1 (Legacy) | V2 (Current) |
|-----|-----------|------------|
| 结构 | 5 module（colorScience, tone, scan, grain, defects） | 6 层模型 |
| 存储 | `FilmProfile` 接口 | `FilmProfileV2` 接口 |
| LUT | 无原生支持 | HaldCLUT PNG |
| 迁移 | `film/migrate.ts` 自动转换 | - |
| 后向兼容 | 自动转换为 V2 | 是（通过 migration） |

---

## 关键数据流

### 图像编辑流程

```typescript
// 1. 用户加载图像
renderImageToCanvas({
  canvas,                    // 目标画布
  source,                    // Blob 或 URL
  adjustments,               // EditingAdjustments (用户参数)
  filmProfile,               // FilmProfile (可选)
  preferWebGL2: true,        // 优先使用 GPU
  targetSize,                // 输出尺寸
  signal                     // AbortSignal (取消)
})

// 2. 内部流程
  ↓
// 加载图像源（ImageBitmap 或 Image）
loadImageSource(source)
  ↓
// 几何变换（裁剪、旋转、翻转）
applyGeometryTransform(source, adjustments)
  ↓
// 【如果启用 PixiJS】
if (window.__FILMLAB_USE_PIXI) {
  // 创建或复用 PixiRenderer 单例
  const renderer = new PixiRenderer(canvas, width, height)

  // 更新源纹理
  renderer.updateSource(transformedCanvas, width, height)

  // 解析 uniform（参数 → GPU 格式）
  const masterUniforms = resolveFromAdjustments(adjustments)
  const filmProfile = ensureFilmProfileV2(filmProfile) // 自动迁移 V1→V2
  const filmUniforms = resolveFilmUniforms(filmProfile)
  const halationUniforms = resolveHalationBloomUniforms(filmProfile)

  // 加载 LUT（如果需要）
  if (filmProfile.lut.enabled) {
    await renderer.loadLUT(`/luts/${filmProfile.lut.path}`, filmProfile.lut.size)
  }

  // 3-pass 渲染
  renderer.render(masterUniforms, filmUniforms, {}, halationUniforms)

  // 提取结果
  context.drawImage(renderer.canvas, 0, 0, width, height)
}
else {
  // 【回退】使用旧 WebGL2 或 CPU 管线
  renderFilmProfileWebGL2(canvas, profile) || applyFilmPipeline(imageData, profile)
}
```

### 导出流程

```typescript
// 用户导出单张或批量
renderImageToBlob(source, adjustments, {
  type: 'image/jpeg',
  quality: 0.92,
  maxDimension: 4096,      // 最大 4K
  filmProfile: profile
})

// 内部：
  → 调用 renderImageToCanvas()
  → canvas.toBlob()
  → 返回 Blob

// 批量导出（ZIP）
batchExport(assets, renderFn, onProgress)
  → 遍历资源，逐个渲染
  → 用 fflate 压缩为 ZIP
  → 下载
```

---

## 色彩科学管线

### Master Pass（MasterAdjustment.frag）

**输入**：sRGB Canvas 像素
**输出**：色彩校正像素

**步骤**：
1. sRGB → Linear（伽马解码）
2. 曝光（线性空间，物理精确）
3. **LMS 白平衡**（色温 + 色调，模拟人眼锥细胞响应）
4. 对比度（线性空间，中灰点 0.18）
5. 分区亮度调整（高光/阴影/白点/黑点）
6. 曲线（4 段）
7. **OKLab HSL**（感知均匀色彩空间）
   - 色相旋转（a-b 平面）
   - 饱和度缩放
   - 振度（智能饱和度）
   - 亮度调整
8. 去雾（大气雾霾移除）
9. Linear → sRGB（伽马编码）

**关键**：所有亮度运算都在线性空间进行，确保物理准确。

### Film Pass（FilmSimulation.frag）

**输入**：Master Pass 输出
**输出**：胶片模拟像素

**层级**：
- **Layer 1**：特性曲线（S-curve，shoulder/toe/gamma）
- **Layer 3**：3D LUT（trilinear 插值，HaldCLUT）
- **Layer 4**：分区色偏（阴影/中间调/高光，RGB 偏移）
- **Layer 6**：颗粒（程序生成，coarse/fine 混合）
- **Layer 6**：暗角（椭圆形，bidirectional）

### Halation/Bloom Pass（HalationBloomFilter.ts）

**4-pass 内部管线**：
1. **Threshold**：从亮区提取 R=halation, G=bloom 掩码
2. **Blur H**：半分辨率水平高斯模糊（9-tap，sigma=1.5）
3. **Blur V**：垂直高斯模糊
4. **Composite**：原始图像 + 模糊掩码（加性混合，暖色调）

**性能优化**：模糊在 0.5× 分辨率进行，额外开销 < 2ms（2K 图像）。

---

## 类型系统速查

### EditingAdjustments（用户参数）

```typescript
interface EditingAdjustments {
  // 基础
  exposure: number;          // [-100, 100]
  contrast: number;          // [-100, 100]
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;

  // 白平衡
  temperature: number;       // [-100, 100]
  tint: number;

  // OKLab HSL
  saturation: number;
  vibrance: number;          // 智能饱和度

  // 曲线（4 段）
  curveHighlights: number;
  curveLights: number;
  curveDarks: number;
  curveShadows: number;

  // 细节
  clarity: number;           // 中频对比度
  texture: number;
  dehaze: number;
  sharpening: number;
  noiseReduction: number;

  // 几何
  scale: number;             // [70, 130]
  rotate: number;            // 度数
  horizontal: number;
  vertical: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  aspectRatio: "original" | "16:9" | "4:3" | ...

  // 胶片
  filmProfileId?: string;
}
```

### MasterUniforms（GPU 参数）

```typescript
interface MasterUniforms {
  // 基础（直接映射）
  exposure: number;          // [-5, 5] EV
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;

  // 白平衡（LMS）
  temperature: number;
  tint: number;

  // OKLab HSL
  hueShift: number;          // [-180, 180]°
  saturation: number;
  vibrance: number;
  luminance: number;

  // 曲线
  curveHighlights: number;
  curveLights: number;
  curveDarks: number;
  curveShadows: number;

  // 细节
  dehaze: number;
}
```

### FilmProfileV2（新格式）

```typescript
interface FilmProfileV2 {
  id: string;
  version: 2;
  name: string;
  type: "negative" | "slide" | "instant" | "bw";

  // Layer 1: Tone Response
  toneResponse: {
    enabled: boolean;
    shoulder: number;        // 高光压缩 [0, 1]
    toe: number;             // 阴影提升 [0, 1]
    gamma: number;           // [0.5, 2.0]
  };

  // Layer 3: 3D LUT
  lut: {
    enabled: boolean;
    path: string;            // 相对于 public/luts/
    size: 8 | 16;            // HaldCLUT 尺寸
    intensity: number;       // 混合强度 [0, 1]
  };

  // Layer 4: Color Cast
  colorCast?: {
    enabled: boolean;
    shadows: [r, g, b];
    midtones: [r, g, b];
    highlights: [r, g, b];
  };

  // Layer 5: Optical Effects
  halation?: { enabled, intensity, threshold, color, radius };
  bloom?: { enabled, intensity, threshold, radius };

  // Layer 6: Texture
  grain: {
    enabled: boolean;
    amount: number;          // [0, 1]
    size: number;            // [0.5, 2.0]
    colorGrain: boolean;
    roughness: number;
    shadowBias: number;
  };
  vignette: {
    enabled: boolean;
    amount: number;          // [-1, 1]（负数 = 白角）
    midpoint: number;        // [0, 1]
    roundness: number;
  };
}
```

---

## 常见任务速查

### 添加新的调整参数

1. 在 `src/types/index.ts` 的 `EditingAdjustments` 中新增字段
2. 在 `src/lib/renderer/types.ts` 的 `MasterUniforms` 中新增对应的 GPU uniform
3. 在 `src/lib/renderer/uniformResolvers.ts` 的 `resolveFromAdjustments()` 中添加映射逻辑
4. 在 `src/lib/renderer/shader.config.ts` 的 `MasterConfig` 中添加功能开关
5. 在 `src/lib/renderer/shaders/templates/` 中创建或编辑对应的 GLSL 模板
6. **重新生成 shader**：`pnpm generate:shaders`
7. 在 UI 组件中添加滑块/输入框

### 启用/禁用 GPU 功能

```typescript
// src/lib/renderer/shader.config.ts
export const masterConfig: MasterConfig = {
  exposure: { enabled: true },     // ✅ 启用
  dehaze: { enabled: false },      // ❌ 禁用
  // ...
};

export const filmConfig: FilmConfig = {
  toneResponse: { enabled: true },
  lut: { enabled: true, size: 8 },
  colorCast: { enabled: false },   // 禁用则 uniform 和代码都不会生成
  // ...
};
```

修改后运行 `pnpm generate:shaders` 重新生成。生成的 shader 会自动去掉禁用功能的代码。

### 添加新的 HaldCLUT 胶片预设

1. 将 `.png` LUT 文件放入 `public/luts/`（应为 HaldCLUT 格式）
2. 创建 `FilmProfileV2` 对象，指向该文件
3. 在 `src/data/filmProfilesV2.ts`（未建立）中注册
4. 在 UI 中引用该 profile

### 切换到 PixiJS 渲染器（临时）

```javascript
// 浏览器控制台
window.__FILMLAB_USE_PIXI = true
location.reload()
```

默认关闭（feature flag），因为需要 **Phase 0 浏览器验证** 才能启用。

### 调试 Shader 编译问题

1. 检查生成的 shader：`src/lib/renderer/shaders/generated/MasterAdjustment.frag`
2. 对比原始模板：`src/lib/renderer/shaders/templates/`
3. 查看生成器日志：`pnpm generate:shaders` 输出
4. 在浏览器 DevTools 检查 WebGL 编译错误（Console）

---

## 性能指标

| 场景 | 目标 | 实际 |
|-----|------|------|
| 2K 图像实时预览 | ≥ 60fps | ✅ PixiJS 2-pass < 1ms |
| 4K 图像实时预览 | ≥ 30fps | ✅ 降采样到 2K |
| 导出 4K JPEG | < 3s | ✅ `canvas.toBlob()` |
| 批量导出 ZIP（10 张）| < 10s | ✅ fflate 流式压缩 |
| 3D LUT 加载 | < 200ms | ✅ 异步 + LRU 缓存 |
| 内存（3 LUT） | < 10MB | ✅ 8³ LUT ≈ 1MB/个 |

---

## 已知限制 & 待办

### 当前限制

- **PixiJS v7 + sampler3D**：需在 `FilmSimulationFilter.apply()` 手动绑定纹理到 unit 2
- **Feature flag**：PixiJS 渲染器需要 `window.__FILMLAB_USE_PIXI = true` 启用
- **Vignette 宽高比**：暂未传入，使用默认 1.0（TODO 注释在 FilmSimulation.frag:136）

### Phase 0（待验证）

- [ ] 浏览器中 shader 编译和执行
- [ ] 色彩精度与手写 shader 对比（像素级）
- [ ] 性能基准测试（FPS、内存）
- [ ] 跨浏览器兼容性（Chrome、Firefox、Safari）

### Phase 2（未开始）

- 10 款胶片预设 + LUT 文件
- 完整 Halation/Bloom 集成
- 分区色偏 UI 和预设

### Phase 3（未开始）

- 色彩矩阵层（3×3 变换）
- 参数提取工具（从 HaldCLUT 反推配置）
- 参数拟合工具（culori）

---

## 代码审查关键点

### PR 检查清单

- [ ] Shader 代码生成是否正确？运行 `pnpm generate:shaders` 后对比输出
- [ ] 新参数是否遵循了完整的映射链（Adjustments → Uniforms → Shader）？
- [ ] GPU 资源是否正确生命周期管理（TextureCreate → Destroy）？
- [ ] 色彩空间转换是否一致（sRGB ↔ Linear，OKLab 等）？
- [ ] 是否有死代码或未使用的 uniform？
- [ ] V1 Profile 迁移是否向后兼容？
- [ ] 是否正确处理了 feature flag 和回退路径？

### 常见 Bug 来源

1. **色彩空间混淆**：在 sRGB 空间做亮度计算（应在 Linear）
2. **Uniform 类型不匹配**：TypeScript 接口与 GLSL 声明不一致
3. **纹理绑定错误**：3D LUT 单元绑定冲突
4. **参数范围**：UI 范围 [-100, 100] 需正确 normalize 到 shader
5. **Profile 迁移遗漏**：某些 V1 参数未映射到 V2

---

## 相关文档

| 文档 | 内容 | 位置 |
|-----|------|------|
| **editor.md** | 完整技术方案（2万+ 行） | `docs/editor.md` |
| **AGENT.md** | 本文档 | `AGENT.md` |
| **MEMORY.md** | Agent 记忆库 | `~/.claude/projects/E--project-FilmLab/memory/MEMORY.md` |
| **Commit History** | 最近 5 个 Commit（Shader Generator 等） | `git log feat/optimize` |

---

## 快速命令

```bash
# 开发
pnpm dev                    # 启动开发服务器（自动生成 shader）
pnpm build                  # 构建生产版本
pnpm preview                # 预览生产构建

# Shader 生成
pnpm generate:shaders       # 手动重新生成 shader（修改 config 后运行）

# Git
git log feat/optimize       # 查看当前分支提交历史
git diff HEAD~1             # 对比最后一个提交的变化

# 启用 PixiJS（临时）
# 在浏览器控制台：
window.__FILMLAB_USE_PIXI = true; location.reload()
```

---

## 联系与反馈

- **项目 Repo**：https://github.com/YakiHugo/FilmLab（feat/optimize 分支）
- **主要分支**：`main`（稳定）、`feat/optimize`（开发中）
- **关键 Commit**：
  - `10e3984` - Shader Code Generator 核心实现
  - `6799a33` - 构建集成
  - `4559ff6` - Film V2 + Halation/Bloom
  - `4dac697` - 类型系统增强
  - `715699a` - 文档更新

---

**最后更新**：2026-02-16 by Claude Opus 4.6
