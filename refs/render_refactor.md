twgl.js vs 完全自研：

- twgl.js 覆盖了 ~70% 的底层样板代码（shader 编译、uniform 绑定、纹理创建、FBO
  管理），这些代码写起来没有技术含量但容易出 bug
- 自研部分只剩 FilterPipeline（~300 行 FBO ping-pong + pass 调度）和 TexturePool（~50 行 LRU
  池化），这些是图像处理管线特有的逻辑，twgl 不该管也管不了
- 净效果：迁移工作量从 3-5 天降到 2-3 天，同时 bundle 从 ~180KB 降到 ~12KB

胶片管线（Phase 2-4 的所有 shader 和色彩科学）没有任何可用的开源替代，必须自研 — 这也是  
 FilmLab 的核心差异化。

──────────────────────────────────────────────────────────────────────────────────────────────
Ready to code?

Here is Claude's plan:
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
FilmLab 渲染管线重构计划

Context

FilmLab 的目标是实现 Dehancer 级别的胶片冲印链路 + Luminar Neo
级别的基础编辑能力。当前渲染管线基于 PixiJS v7 构建了 7-pass WebGL2
管线，基础编辑功能覆盖良好（曝光/对比/WB/HSL/曲线/细节/局部调整），但存在三个核心问题：

1.  PixiJS 是 2D 游戏框架，不是图像处理框架 — 代码已在大量对抗 PixiJS
    的限制（ManualFilterApply.ts 访问 5 个私有 API，手动绑定 sampler3D 到 texture unit
    4，无法控制 FBO 格式）
2.  全链路 8-bit sRGB — pass 之间的 FBO 全部是 RGBA8，每个 pass
    边界都有量化精度损失，无法正确处理 HDR 内容
3.  胶片管线过于简化 — 当前 FilmSimulation 是单 pass（tone response + color matrix + LUT +  
    color cast + grain + vignette），无法模拟 Dehancer 的完整冲印链路

---

开源库选型

调研了所有主流 WebGL/WebGPU 图像处理相关库，结论：

┌────────────────┬────────┬───────────┬─────────┬───────────────────────────────────────┐  
 │ 库 │ Float │ sampler3D │ Bundle │ 结论 │  
 │ │ FBO │ │ │ │  
 ├────────────────┼────────┼───────────┼─────────┼───────────────────────────────────────┤  
 │ twgl.js │ YES │ YES │ ~12KB │ 采用 — 轻量 WebGL2 │  
 │ │ │ │ │ helper，原生支持所有需要的特性 │  
 ├────────────────┼────────┼───────────┼─────────┼───────────────────────────────────────┤  
 │ regl │ YES │ NO │ ~26KB │ 不支持 3D 纹理，pass │  
 ├────────────────┼────────┼───────────┼─────────┼───────────────────────────────────────┤  
 │ OGL │ YES │ YES │ ~30KB │ 可选，但包含不需要的 scene graph │  
 ├────────────────┼────────┼───────────┼─────────┼───────────────────────────────────────┤  
 │ luma.gl │ YES │ YES │ ~100KB+ │ 太重，为数据可视化设计 │  
 ├────────────────┼────────┼───────────┼─────────┼───────────────────────────────────────┤  
 │ gpu-curtains │ N/A │ N/A │ ~70KB │ WebGPU only，GLSL 需全部重写 │  
 ├────────────────┼────────┼───────────┼─────────┼───────────────────────────────────────┤  
 │ OpenCV.js │ N/A │ N/A │ ~10MB │ CPU-only WASM，不可行 │  
 ├────────────────┼────────┼───────────┼─────────┼───────────────────────────────────────┤  
 │ Photon (Rust │ N/A │ N/A │ ~400KB │ CPU-bound，无实时能力 │  
 │ WASM) │ │ │ │ │  
 └────────────────┴────────┴───────────┴─────────┴───────────────────────────────────────┘

胶片管线无可用开源方案 — npm 上没有任何库接近 FilmLab 现有的 film simulation
水平。这部分必须自研。

---

Phase 0: GPU 抽象层（基础设施）

替换 PixiJS 为 twgl.js + 轻量自研管线层。

twgl.js 负责 WebGL2 样板代码消除（shader 编译、uniform 绑定、纹理/FBO 创建），原生支持  
 sampler3D、RGBA16F、3D 纹理。现有 GLSL shader 完全不用改。ManualFilterApply.ts 的 5 个私有  
 API hack 直接消失。Bundle 从 ~180KB（PixiJS tree-shaken）降到 ~12KB。

新建 src/lib/renderer/gpu/

┌───────────────────┬────────────────────────────────────────────────────────────────────┐  
 │ 文件 │ 职责 │  
 ├───────────────────┼────────────────────────────────────────────────────────────────────┤  
 │ FilterPipeline.ts │ 有序 pass 序列，FBO ping-pong，disabled pass 零开销跳过（~300 行） │  
 ├───────────────────┼────────────────────────────────────────────────────────────────────┤  
 │ TexturePool.ts │ 纹理/FBO 池化分配，LRU 回收（~50 行） │  
 ├───────────────────┼────────────────────────────────────────────────────────────────────┤  
 │ PipelinePass.ts │ pass 类型定义 + twgl program/FBO 封装 │  
 └───────────────────┴────────────────────────────────────────────────────────────────────┘

twgl.js 已覆盖的能力（不需要自研）：

- twgl.createProgramInfo() — shader 编译 + uniform 绑定
- twgl.createTexture() — 2D/3D 纹理，支持 RGBA16F / RGBA32F
- twgl.createFramebufferInfo() — FBO 创建，显式 internalFormat 控制
- twgl.setUniforms() — 所有 uniform 类型包括 sampler3D
- twgl.drawBufferInfo() — fullscreen quad 绘制

核心接口

interface PipelinePass {
id: string;
programInfo: twgl.ProgramInfo;
uniforms: Record<string, unknown>;
extraTextures?: Record<string, WebGLTexture>; // LUT, noise 等
outputFormat?: "RGBA8" | "RGBA16F";
resolution?: number; // 0.5 = 半分辨率
enabled: boolean;
}

迁移策略

逐个 filter 迁移：先构建 FilterPipeline → 用 adapter 包装为相同接口 → 逐个替换 PIXI.Filter →
全部迁移后删除 PixiJS 依赖。

关键文件变更

- 新增依赖: twgl.js（~12KB min+gz）
- 新建: src/lib/renderer/gpu/FilterPipeline.ts, TexturePool.ts, PipelinePass.ts
- 重写: src/lib/renderer/PixiRenderer.ts → PipelineRenderer.ts
- 修改: src/lib/renderer/RenderManager.ts
- 删除: src/lib/renderer/filters/ManualFilterApply.ts
- 删除: pixi.js 依赖（~180KB tree-shaken）
- 重写: src/lib/renderer/filters/\* → 转为 PipelinePass 配置

---

Phase 1: HDR 线性光管线

将全链路从 sRGB RGBA8 切换到线性光 RGBA16F。

管线变更

Input (sRGB RGBA8)
→ sRGB decode（仅一次，Geometry pass 输出端）
→ [所有 pass 在线性光 RGBA16F 中运行]
→ sRGB encode（仅一次，最终输出 pass）
→ Output (sRGB RGBA8 显示 / RGBA16F 导出)

Shader 变更

- 所有中间 pass 移除 srgb2linear() / linear2srgb() 往返转换
- Curve LUT 和 3D LUT 查找前后做短暂 sRGB 往返（保持 LUT 兼容性）
- 新增 OutputEncode.frag：最终 linear2srgb() + 可选 dithering
- 需检测 EXT_color_buffer_float 扩展（~97% WebGL2 设备支持），不支持时回退 RGBA8

关键文件变更

- 修改: 所有 .frag shader — 移除冗余色彩空间转换
- 修改: src/lib/renderer/LUTLoader.ts — 改用 twgl.createTexture() 上传，可选 RGBA16F
- 新建: src/lib/renderer/shaders/OutputEncode.frag

---

Phase 2: 胶片管线分解

将单体 FilmSimulation pass 拆解为完整的暗房冲印链路。

新管线结构（替换原 Pass 6）

6a Expand — 预处理动态范围匹配（黑白点归一化）
6b FilmCompression — 高光 roll-off（独立于 tone response）
6c FilmDeveloper — 显影：对比度/gamma/色彩分离
6d ToneResponse — S 曲线（从现有 FilmSimulation 提取）
6e ColorMatrix — 3x3 色彩混合（从现有提取）
6f LUT3D — HaldCLUT（从现有提取）
6g Print — 印片模拟（Kodak 2383 / Endura / Cineon）
6h CMYColorHead — 减色 YMC 滤色头校正
6i ColorCast — 分区色调（从现有提取）
6j PrintToning — 分区自动蒙版调色
6k Grain — 颗粒（Phase 3 升级）
6l Vignette — 暗角（从现有提取）

disabled pass 零开销 — 简单 profile 仍只执行 3-4 个 pass。

FilmProfileV3 类型扩展

interface FilmProfileV3 {
version: 3;
expand?: { enabled: boolean; blackPoint: number; whitePoint: number };
filmCompression?: { enabled: boolean; highlightRolloff: number; shoulderWidth: number };  
 filmDeveloper?: { enabled: boolean; contrast: number; gamma: number; colorSeparation:  
 [number, number, number] };
print?: { enabled: boolean; stock: "kodak-2383" | "endura" | "cineon-log" | "custom";  
 lut?: string };
cmyColorHead?: { enabled: boolean; cyan: number; magenta: number; yellow: number };  
 printToning?: { enabled: boolean; /_ zone params _/ };
// 保留现有 V2 字段向后兼容
}

关键文件变更

- 拆分: FilmSimulation.frag → 6+ 独立 shader
- 新建: Expand.frag, FilmCompression.frag, FilmDeveloper.frag, Print.frag,
  CMYColorHead.frag, PrintToning.frag
- 删除: src/lib/renderer/filters/FilmSimulationFilter.ts
- 修改: src/types/film.ts — 新增 FilmProfileV3
- 新建: src/lib/film/migrate.ts — V2 → V3 迁移
- 修改: src/lib/renderer/uniformResolvers.ts — 每个新 stage 的 resolver

---

Phase 3: 物理建模颗粒

替换蓝噪声颗粒为基于银盐晶体分布的 3D 程序化颗粒模型。

三层模型

1.  晶体分布: Poisson disk 采样，密度随局部曝光沿 H&D 曲线变化
2.  单晶体响应: 对数正态分布的尺寸/不透明度，彩色颗粒使用独立 R/G/B 晶体层
3.  扫描模拟: 虚拟扫描器 MTF 卷积，不同胶片规格（8/16/35/65mm）对应不同放大比

新 uniform 参数

grain: {
model: "procedural" | "blue-noise"; // 向后兼容
crystalDensity: number;
crystalSizeMean: number;
crystalSizeVariance: number;
colorSeparation: [number, number, number];
scannerMTF: number;
filmFormat: "8mm" | "16mm" | "35mm" | "65mm";
}

关键文件变更

- 重写: src/lib/renderer/shaders/templates/grain.glsl
- 新建: src/lib/renderer/shaders/ProceduralGrain.frag
- 修改: src/types/film.ts, uniformResolvers.ts

---

Phase 4: 光学效果增强 + 新特效

Halation 升级

- 色相控制：替换固定暖色 tint 为 hue angle + saturation + blue compensation
- 独立 halation/bloom 模糊半径
- 胶片规格 profiles（8/16/35/65mm 对应不同扩散特性）

新增效果

┌─────────────┬────────────────────────────────────┐
│ 效果 │ 实现方式 │
├─────────────┼────────────────────────────────────┤
│ Glow │ 类似 bloom 但指数衰减 + 中间调触发 │
├─────────────┼────────────────────────────────────┤
│ Film Breath │ 每帧随机曝光/对比/色彩微漂移 │
├─────────────┼────────────────────────────────────┤
│ Film Damage │ 真实灰尘/划痕纹理图集合成 │
├─────────────┼────────────────────────────────────┤
│ Overscan │ 胶片边框/齿孔纹理合成 │
└─────────────┴────────────────────────────────────┘

关键文件变更

- 修改: HalationThreshold.frag, HalationComposite.frag
- 新建: Glow.frag, FilmBreath.frag, FilmDamage.frag, Overscan.frag
- 新建: public/textures/damage/, public/textures/borders/ — 纹理资源
- 修改: src/types/film.ts — 新效果参数

---

Phase 5: 分块渲染与性能优化

分块渲染（导出路径）

大图（24MP+）按 2048x2048 + 64px overlap 分块处理，峰值显存从 >1GB 降至 ~130MB。

需要全局信息的 pass（dehaze、halation blur）先在低分辨率全图运行，再将结果作为 uniform  
 传入分块 pass。

渐进式预览

┌─────────┬────────────┬──────────┬────────────────────────┐
│ 级别 │ 触发 │ 分辨率 │ pass 策略 │
├─────────┼────────────┼──────────┼────────────────────────┤
│ L1 即时 │ 滑杆拖动中 │ 1/4 │ 跳过 Detail + Halation │
├─────────┼────────────┼──────────┼────────────────────────┤
│ L2 防抖 │ 100ms 静止 │ 1/2 │ 全部 pass │
├─────────┼────────────┼──────────┼────────────────────────┤
│ L3 完整 │ 300ms 静止 │ 全分辨率 │ 全部 pass │
└─────────┴────────────┴──────────┴────────────────────────┘

GPU Readback 优化

导出时使用 gl.fenceSync + polling 替代阻塞式 gl.readPixels，保持主线程响应。

关键文件变更

- 新建: src/lib/renderer/gpu/TiledRenderer.ts
- 修改: FilterPipeline.ts, imageProcessing.ts, RenderManager.ts

---

Phase 6: 降噪升级

将 5x5 bilateral filter 升级为多尺度引导滤波。

GPU 路径（默认）

1.  下采样到 3 个尺度（1x, 1/2x, 1/4x）
2.  每个尺度应用尺度匹配的 bilateral filter
3.  多尺度重建混合
4.  亮度/色度独立降噪强度

3 个额外 pass，但每个尺度处理不同噪声频段，总计算量相近但效果显著提升。

关键文件变更

- 重写: src/lib/renderer/shaders/Detail.frag
- 新建: Downsample.frag, BilateralScale.frag, Reconstruct.frag

---

Phase 7: 基础编辑补全

Dodge & Burn

利用现有 LocalAdjustment 系统实现 — 专用画笔工具创建仅含 exposure delta 的局部调整（dodge =  
 正值，burn = 负值）。无需新 shader。

独立 LUT 导入

- 新增 .cube 文件解析器
- EditingAdjustments 新增 customLut?: { url: string; intensity: number }
- 作为独立 pass 插入 Curve 之后、Detail 之前

关键文件变更

- 新建: src/lib/renderer/CubeLUTParser.ts
- 新建: src/lib/renderer/shaders/CustomLUT.frag
- 修改: src/types/index.ts, imageProcessing.ts
- 修改: src/features/editor/ — Dodge & Burn 工具 UI

---

Phase 8: 服务端 AI 功能

GenErase / AI Denoise / AI Sharpen / AI Upscale 需要服务端 GPU 推理，沿用现有 api/
serverless 模式。

┌──────────────────────┬────────────────────────────────────────┐
│ 端点 │ 功能 │
├──────────────────────┼────────────────────────────────────────┤
│ POST /api/ai/erase │ 生成式擦除（image + mask → inpainted） │
├──────────────────────┼────────────────────────────────────────┤
│ POST /api/ai/denoise │ AI 降噪 │
├──────────────────────┼────────────────────────────────────────┤
│ POST /api/ai/sharpen │ AI 锐化 │
├──────────────────────┼────────────────────────────────────────┤
│ POST /api/ai/upscale │ AI 超分 │
├──────────────────────┼────────────────────────────────────────┤
│ POST /api/ai/expand │ 生成式扩图 │
└──────────────────────┴────────────────────────────────────────┘

客户端流程：提取当前渲染结果 → 发送 API → 返回结果替换 source → 后续 pass 继续处理。结果按  
 content hash 缓存。

此 phase 独立于管线重构，可并行推进。

---

执行顺序（按影响/风险比排序）

Phase 0 (GPU 抽象层) ──┐
Phase 1 (HDR 管线) ──┤ 原子里程碑，必须一起完成
│
Phase 2 (胶片分解) ──┤
Phase 4 (光学效果) ──┤ 可并行
Phase 3 (物理颗粒) ──┘

Phase 7 (基础编辑补全) 独立，可提前
Phase 5 (分块渲染) 生产导出必需
Phase 6 (降噪升级) GPU 路径快速
Phase 8 (AI 功能) 独立工作流，随时可启动

---

验证方式

1.  视觉回归测试: 每个 phase 完成后，用 test-assets/
    中的测试图片对比重构前后输出，确保像素级一致（Phase 1 HDR 升级允许精度提升带来的微小差异）
2.  性能基准: 用 scripts/render-baseline.ts 在重构前后对比渲染耗时
3.  单元测试: 为每个新 shader pass 的 uniform resolver 编写测试（现有 config.test.ts 模式）
4.  构建验证: pnpm build 通过（含 tsc -b 类型检查）
5.  Lint/Format: pnpm lint && pnpm format:check 通过
6.  浏览器兼容: 在 Chrome/Firefox/Safari 上验证 EXT_color_buffer_float 回退路径
