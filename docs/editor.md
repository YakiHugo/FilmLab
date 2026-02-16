# Web 前端图片编辑器重构技术方案

> 方案版本：v5.0  
> 更新日期：2026-02-14  
> 核心定位：**基于 PixiJS 的 Compile-Time 分层生成架构，科学色彩管线与 3D LUT 胶片系统**

---

## 〇、重构背景与现状分析

### 0.1 当前架构总结

当前编辑器已具备完整的图片处理管线：

| 模块 | 现状 | 问题 |
|---|---|---|
| **渲染引擎** | 原生 WebGL2 单 Pass + Canvas 2D 回退 (`webgl2.ts` / `pipeline.ts`) | 单 Pass shader 已超 280 行，扩展困难；手动管理 GL 状态易出错 |
| **色彩处理** | RGB 空间内直接计算（smoothstep 模拟 LUT、线性温度偏移） | 非感知均匀，饱和度/白平衡不准确 |
| **胶片系统** | 5 模块管线（colorScience → tone → scan → grain → defects） | 无真实 LUT 支持，色彩模拟靠数学近似 |
| **调整参数** | 28+ 参数的 `EditingAdjustments` + 5 模块的 `FilmProfile` | 功能完备但混合了编辑参数与胶片参数 |
| **状态管理** | Zustand + IndexedDB 持久化 | 可沿用 |

### 0.2 现有代码文件清单

```
src/lib/film/
├── pipeline.ts    # CPU 回退渲染管线（5 模块，逐像素处理）
├── webgl2.ts      # WebGL2 GPU 渲染器（单 Pass fragment shader）
├── profile.ts     # FilmProfile 创建/规范化/克隆/缩放
├── registry.ts    # 内置胶片注册表 + 运行时 profile 解析
├── utils.ts       # 数学工具（clamp/lerp/smoothstep/hash）
└── index.ts       # 公共导出

src/lib/
├── adjustments.ts     # EditingAdjustments 默认值与预设应用
└── imageProcessing.ts # 核心渲染入口（loadImage → transform → render）

src/data/
├── filmProfiles.ts    # 8 款内置胶片预设 JSON
└── presets.ts         # 编辑预设（adjustments + filmProfileId）

src/types/index.ts     # 全部类型定义
```

### 0.3 重构目标

| 目标 | 说明 |
|---|---|
| **科学色彩管线** | 引入 OKLab（HSL 调整）+ LMS（白平衡）替换当前 RGB 直算 |
| **真实 3D LUT** | 支持 HaldCLUT 加载，替换 smoothstep 模拟 |
| **多 Pass GPU 管线** | 拆分单 Pass 巨型 shader 为 Master → Film 两阶段 |
| **渐进式迁移** | 保持现有 API 兼容，逐步替换内部实现 |
| **数据向后兼容** | 现有 `FilmProfile` JSON 和用户自定义预设不丢失 |

### 0.4 非目标（本次不涉及）

- 不做局部调整/蒙版（留给后续版本）
- 不做 WebGPU 迁移（浏览器覆盖率不足）
- 不做移动端原生适配（通过响应式降级覆盖）

---

## 一、核心架构决策

### 1.1 技术选型

| 层级 | 选型 | 决策理由 |
|---|---|---|
| **渲染引擎** | PixiJS v7.4 | 生态稳定、插件丰富；FilterSystem 自动管理 FBO/纹理生命周期；比手写 WebGL2 更易维护。v8 虽有 WebGPU 支持但普及度不足，生产环境优先稳定 |
| **Shader 策略** | Compile-Time 分层生成 | 构建时根据配置生成优化后的 GLSL，运行时分层保灵活。比 Uber Shader 更易调试，比纯 Runtime 拼接性能更好 |
| **胶片系统** | 渐进式 3→6 层 | Phase 1 先做 LUT + 特性曲线 + 颗粒/暗角，后续迭代完善。避免过度设计 |
| **色彩科学** | OKLab + LMS（GLSL 内实现） | OKLab 做感知均匀 HSL，LMS 做科学白平衡，Lab 做色差计算 |
| **3D LUT** | HaldCLUT PNG → WebGL 3D Texture | 8³ = 512px 图片，标准化程度高，开源资源丰富 |
| **CPU 色彩工具** | culori（开发/工具侧） | 参数拟合工具、色差校验用 |
| **导出压缩** | fflate | 高性能纯 JS 压缩，用于批量导出 ZIP 打包 |

### 1.2 依赖清单

```json
{
  "pixi.js": "^7.4.0",
  "culori": "^4.0.0",
  "exifreader": "^4.21.0",
  "fflate": "^0.8.2"
}
```

| 依赖 | 用途 | 大小(gzipped) |
|---|---|---|
| `pixi.js` | GPU 渲染引擎，Filter 系统管理多 Pass 渲染 | ~120KB |
| `culori` | 开发时色差校验、参数拟合工具 | ~15KB |
| `exifreader` | EXIF 元数据读取（替换现有 exifr，维护更活跃） | ~18KB |
| `fflate` | 批量导出时 ZIP 打包压缩 | ~8KB |

> **注意**：PixiJS v7.4 仅使用 WebGL1/2 后端。如果只需要 Filter 管线而不需要场景图/精灵渲染，可以通过 tree-shaking 或按需导入 `@pixi/core` + `@pixi/filter-*` 来控制体积。

---

## 二、Compile-Time 分层生成架构 + PixiJS 渲染管线

### 2.1 架构设计哲学

**核心矛盾**：性能 vs 可调试性 vs 灵活性

| 方案 | 性能 | 可调试性 | 灵活性 | 适用场景 |
|---|---|---|---|---|
| Runtime 分层（当前） | 中 | 好 | 好 | 快速原型 |
| Uber Shader | 极高 | 差 | 差 | 性能敏感型应用 |
| **Compile-Time 分层** | **高** | **好** | **好** | **生产级应用** |

**关键洞察**：现代 GPU 上 2–3 Pass vs 1 Pass 的差异微乎其微（< 2ms），但可调试性和迭代效率对开发影响巨大。

### 2.2 整体数据流

```
开发阶段:
  MasterConfig ──────────────────────────────────┐
  FilmConfig ───────┐                            │
                    ▼                            ▼
  ┌─────────────────────────────────────────────────────┐
  │           Shader Code Generator (构建时)              │
  │  • 内联小函数         • 消除死代码                    │
  │  • 仅生成启用的功能    • 预计算常量                    │
  └─────────────────────────────────────────────────────┘
                    │                            │
                    ▼                            ▼
  MasterAdjustment.glsl (优化后)     FilmSimulation.glsl (优化后)
                    │                            │
运行阶段:           ▼                            ▼
                 ┌──────────────────────────────────────────┐
                 │           PixiJS Render Pipeline          │
                 │                                          │
[Source Image] → │  Sprite + Texture                        │
  (Blob/URL)     │    ↓                                     │
                 │  sprite.filters = [masterFilter, filmFilter]
                 │    ↓                                     │
                 │  PixiJS FilterSystem 自动管理:            │
                 │    • Pass 1 → FBO (MasterFilter)         │
                 │    • Pass 2 → Screen (FilmFilter)        │
                 │                                          │
                 └──────────────────────────────────────────┘
                              │
                              ▼
                 [Output Canvas] → 直方图计算 → UI 预览
                                 → renderer.extract → 导出
```

### 2.3 为什么选择 PixiJS + Compile-Time 生成

| 考量 | 说明 |
|---|---|
| **告别手动 GL 管理** | PixiJS FilterSystem 自动处理 FBO 创建/回收、纹理绑定、视口设置，消除现有 `webgl2.ts` 中大量样板代码 |
| **关注点分离** | Master 处理「用户手动调整」，Film 处理「胶片模拟」，各为一个 `PIXI.Filter`，职责清晰 |
| **独立开/关** | `sprite.filters = [masterFilter]` 即可跳过 Film Pass；PixiJS 自动优化空 filter 链 |
| **Shader 可维护性** | 每个生成的 shader < 150 行。源模板更短，Code Generator 仅输出启用的功能 |
| **性能代价** | 2 Pass 在 2K 图像上额外开销 < 1ms；PixiJS 内部已有 filter padding 和 batch 优化 |
| **扩展性** | 后续 Halation/Bloom 可以作为独立 Filter 插入链中，无需修改现有 shader |
| **导出能力** | `renderer.extract.pixels()` 直接获取渲染结果，配合 fflate 做 ZIP 打包 |

### 2.4 PixiJS 渲染器封装

```typescript
// src/lib/renderer/PixiRenderer.ts
// 替换现有 src/lib/film/webgl2.ts

import * as PIXI from "pixi.js";
import { MasterAdjustmentFilter } from "./filters/MasterAdjustmentFilter";
import { FilmSimulationFilter } from "./filters/FilmSimulationFilter";
import type { MasterUniforms, FilmUniforms } from "./types";

class PixiRenderer {
  private app: PIXI.Application;
  private sprite: PIXI.Sprite;
  private masterFilter: MasterAdjustmentFilter;
  private filmFilter: FilmSimulationFilter;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.app = new PIXI.Application({
      view: canvas,
      width,
      height,
      backgroundColor: 0x000000,
      antialias: false,
      preserveDrawingBuffer: true, // 支持 toBlob / readPixels
      powerPreference: "high-performance",
    });

    this.sprite = new PIXI.Sprite();
    this.app.stage.addChild(this.sprite);

    this.masterFilter = new MasterAdjustmentFilter();
    this.filmFilter = new FilmSimulationFilter();
  }

  /** 更新源图纹理（从 Canvas / ImageBitmap / Image 创建） */
  updateSource(source: TexImageSource, width: number, height: number): void {
    const baseTexture = PIXI.BaseTexture.from(source as any, {
      scaleMode: PIXI.SCALE_MODES.LINEAR,
    });
    this.sprite.texture = new PIXI.Texture(baseTexture);
    this.sprite.width = width;
    this.sprite.height = height;
    this.app.renderer.resize(width, height);
  }

  /** 加载 HaldCLUT 为 3D 纹理，绑定到 Film Filter */
  async loadLUT(url: string, level: 8 | 16 = 8): Promise<void> {
    await this.filmFilter.loadLUT(
      this.app.renderer as PIXI.Renderer,
      url,
      level
    );
  }

  /** 更新 Master 参数并渲染 */
  render(
    masterUniforms: MasterUniforms,
    filmUniforms: FilmUniforms | null,
    options?: { skipFilm?: boolean }
  ): void {
    this.masterFilter.updateUniforms(masterUniforms);

    if (filmUniforms && !options?.skipFilm) {
      this.filmFilter.updateUniforms(filmUniforms);
      this.sprite.filters = [this.masterFilter, this.filmFilter];
    } else {
      this.sprite.filters = [this.masterFilter];
    }

    this.app.render();
  }

  /** 提取渲染结果像素（导出用） */
  extractPixels(): Uint8Array {
    return this.app.renderer.extract.pixels(this.sprite);
  }

  /** 释放所有 GPU 资源 */
  dispose(): void {
    this.sprite.destroy({ texture: true, baseTexture: true });
    this.masterFilter.destroy();
    this.filmFilter.destroy();
    this.app.destroy(false, { children: true });
  }
}
```

### 2.5 自定义 Filter 基类

```typescript
// src/lib/renderer/filters/MasterAdjustmentFilter.ts

import { Filter } from "pixi.js";
import type { MasterUniforms } from "../types";

// Shader 源码由 Code Generator 构建时生成，运行时通过 ?raw 导入
import vertexSrc from "../shaders/generated/default.vert?raw";
import fragmentSrc from "../shaders/generated/MasterAdjustment.frag?raw";

export class MasterAdjustmentFilter extends Filter {
  constructor() {
    super(vertexSrc, fragmentSrc, {
      u_exposure: 0.0,
      u_contrast: 0.0,
      u_temperature: 0.0,
      u_tint: 0.0,
      u_tonalRange: new Float32Array([0, 0, 0, 0]),
      u_curve: new Float32Array([0, 0, 0, 0]),
      u_hueShift: 0.0,
      u_saturation: 0.0,
      u_vibrance: 0.0,
      u_luminance: 0.0,
      u_dehaze: 0.0,
    });
  }

  updateUniforms(u: MasterUniforms): void {
    this.uniforms.u_exposure = u.exposure;
    this.uniforms.u_contrast = u.contrast;
    this.uniforms.u_temperature = u.temperature;
    this.uniforms.u_tint = u.tint;
    this.uniforms.u_tonalRange[0] = u.highlights;
    this.uniforms.u_tonalRange[1] = u.shadows;
    this.uniforms.u_tonalRange[2] = u.whites;
    this.uniforms.u_tonalRange[3] = u.blacks;
    this.uniforms.u_curve[0] = u.curveHighlights;
    this.uniforms.u_curve[1] = u.curveLights;
    this.uniforms.u_curve[2] = u.curveDarks;
    this.uniforms.u_curve[3] = u.curveShadows;
    this.uniforms.u_hueShift = u.hueShift;
    this.uniforms.u_saturation = u.saturation;
    this.uniforms.u_vibrance = u.vibrance;
    this.uniforms.u_luminance = u.luminance;
    this.uniforms.u_dehaze = u.dehaze;
  }
}
```

```typescript
// src/lib/renderer/filters/FilmSimulationFilter.ts

import { Filter, Renderer, Texture } from "pixi.js";
import { loadHaldCLUT } from "../LUTLoader";
import type { FilmUniforms } from "../types";

import vertexSrc from "../shaders/generated/default.vert?raw";
import fragmentSrc from "../shaders/generated/FilmSimulation.frag?raw";

export class FilmSimulationFilter extends Filter {
  private lutTexture: WebGLTexture | null = null;

  constructor() {
    super(vertexSrc, fragmentSrc, {
      // Layer 1: Tone Response
      u_toneEnabled: false,
      u_shoulder: 0.8,
      u_toe: 0.3,
      u_gamma: 1.0,
      // Layer 3: LUT
      u_lutEnabled: false,
      u_lutIntensity: 0.0,
      // Layer 6: Grain
      u_grainEnabled: false,
      u_grainAmount: 0.0,
      u_grainSize: 0.5,
      u_grainRoughness: 0.5,
      u_grainShadowBias: 0.45,
      u_grainSeed: 0.0,
      u_grainIsColor: true,
      // Layer 6: Vignette
      u_vignetteEnabled: false,
      u_vignetteAmount: 0.0,
      u_vignetteMidpoint: 0.5,
      u_vignetteRoundness: 0.5,
    });
  }

  /** 加载 HaldCLUT 并上传为 WebGL 3D Texture */
  async loadLUT(renderer: Renderer, url: string, level: 8 | 16): Promise<void> {
    const gl = renderer.gl as WebGL2RenderingContext;
    if (this.lutTexture) {
      gl.deleteTexture(this.lutTexture);
    }
    this.lutTexture = await loadHaldCLUT(gl, url, level);
  }

  /** 在渲染前手动绑定 3D LUT 纹理到 texture unit */
  apply(filterManager: any, input: any, output: any, clearMode: any): void {
    if (this.lutTexture && this.uniforms.u_lutEnabled) {
      const gl = filterManager.renderer.gl as WebGL2RenderingContext;
      // 绑定 3D LUT 到 texture unit 1
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);
      this.uniforms.u_lut = 1; // sampler3D unit
    }
    super.apply(filterManager, input, output, clearMode);
  }

  updateUniforms(u: FilmUniforms): void {
    Object.assign(this.uniforms, u);
  }

  destroy(): void {
    // lutTexture 需要在 GL context 上手动清理
    this.lutTexture = null;
    super.destroy();
  }
}
```

---

## 三、色彩科学实现

### 3.1 三色彩空间分工

| 色彩空间 | 用途 | 原因 | 实现位置 |
|---|---|---|---|
| **OKLab** | HSL 调整（色相旋转、饱和度、亮度） | 感知均匀，调整结果符合人眼直觉 | Master Shader |
| **LMS** | 白平衡（色温 + 色调） | 模拟人眼锥细胞响应，物理准确 | Master Shader |
| **sRGB ↔ Linear** | 曝光/对比度计算 | 在线性光空间做亮度计算才正确 | Master Shader |

### 3.2 线性化工作流

**关键原则**：所有亮度相关运算（曝光、对比度、Tone Mapping）必须在线性空间完成。

```
Input (sRGB) → sRGB→Linear → [曝光 → 白平衡 → 对比度 → 高光/阴影] → Linear→sRGB → Output
                                                                        ↑
                                                                OKLab HSL 在此之前
```

### 3.3 GLSL 工具函数库

```glsl
// src/lib/renderer/shaders/colorspace.glsl
// 供 Master 和 Film shader 共同 include

// ---- sRGB ↔ Linear ----
vec3 srgb2linear(vec3 c) {
    return mix(
        c / 12.92,
        pow((c + 0.055) / 1.055, vec3(2.4)),
        step(0.04045, c)
    );
}

vec3 linear2srgb(vec3 c) {
    return mix(
        c * 12.92,
        1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
        step(0.0031308, c)
    );
}

// ---- OKLab ----
// Björn Ottosson, https://bottosson.github.io/posts/oklab/
vec3 rgb2oklab(vec3 c) {
    // 输入: linear sRGB
    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
    float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;

    l = pow(l, 1.0 / 3.0);
    m = pow(m, 1.0 / 3.0);
    s = pow(s, 1.0 / 3.0);

    return vec3(
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    );
}

vec3 oklab2rgb(vec3 o) {
    // 输出: linear sRGB
    float l = o.x + 0.3963377774 * o.y + 0.2158037573 * o.z;
    float m = o.x - 0.1055613458 * o.y - 0.0638541728 * o.z;
    float s = o.x - 0.0894841775 * o.y - 1.2914855480 * o.z;

    l = l * l * l;
    m = m * m * m;
    s = s * s * s;

    return vec3(
        +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    );
}

// ---- LMS (CAT02 chromatic adaptation) ----
const mat3 RGB_TO_LMS = mat3(
     0.7328, 0.4296, -0.1624,
    -0.7036, 1.6975,  0.0061,
     0.0030, 0.0136,  0.9834
);
const mat3 LMS_TO_RGB = mat3(
     1.0961, -0.2789, 0.1827,
     0.4544,  0.4735, 0.0721,
    -0.0096, -0.0057, 1.0153
);

vec3 whiteBalanceLMS(vec3 linearRgb, float temp, float tint) {
    vec3 lms = RGB_TO_LMS * linearRgb;
    // 色温：调整 L(长波/红) 与 S(短波/蓝) 通道比例
    float t = temp * 0.10;
    lms.x *= (1.0 + t);
    lms.z *= (1.0 - t);
    // 色调：调整 M(中波/绿) 通道
    lms.y *= (1.0 + tint * 0.05);
    return LMS_TO_RGB * lms;
}
```

### 3.4 OKLab HSL 调整

```glsl
// OKLab 空间的色相/饱和度/亮度调整
vec3 hslAdjustOKLab(vec3 linearRgb, float hueShift, float satScale, float lumScale) {
    vec3 lab = rgb2oklab(linearRgb);

    // 色相旋转（在 a-b 色度平面）
    float angle = hueShift * 3.14159265 / 180.0;
    float ca = cos(angle), sa = sin(angle);
    float a = lab.y * ca - lab.z * sa;
    float b = lab.y * sa + lab.z * ca;
    lab.y = a;
    lab.z = b;

    // 饱和度缩放（缩放 a-b 向量长度）
    lab.yz *= (1.0 + satScale * 0.01);

    // 亮度缩放
    lab.x *= (1.0 + lumScale * 0.01);

    return oklab2rgb(lab);
}
```

### 3.5 与现有系统的对比

| 功能 | 当前实现 | 重构后 |
|---|---|---|
| 白平衡 | `color.r += temp * 0.14`（sRGB 线性偏移） | LMS 通道缩放（物理准确） |
| HSL 调整 | 无独立 HSL（用 vibrance/saturation 近似） | OKLab 空间的精确 H/S/L 控制 |
| 曝光 | `color *= pow(2.0, exposure)`（sRGB 空间） | 线性空间 `pow(2.0, exposure)` |
| 对比度 | `(color - 0.5) * contrast + 0.5`（sRGB） | 线性空间 S-curve 对比度 |

---

## 四、Master Adjustment Shader

### 4.1 Uniform 定义

```typescript
// src/lib/renderer/types.ts
interface MasterUniforms {
  // 基础调整
  exposure: number;       // [-5, 5] EV
  contrast: number;       // [-100, 100]
  highlights: number;     // [-100, 100]
  shadows: number;        // [-100, 100]
  whites: number;         // [-100, 100]
  blacks: number;         // [-100, 100]

  // 白平衡
  temperature: number;    // [-100, 100]（映射到 LMS 缩放）
  tint: number;           // [-100, 100]

  // OKLab HSL
  hueShift: number;       // [-180, 180] 度
  saturation: number;     // [-100, 100]
  vibrance: number;       // [-100, 100]（智能饱和度，低饱和像素增强更多）
  luminance: number;      // [-100, 100]

  // 曲线（4 区段）
  curveHighlights: number;
  curveLights: number;
  curveDarks: number;
  curveShadows: number;

  // 细节
  clarity: number;        // [-100, 100]（中频对比度，需要额外 blur pass）
  texture: number;        // [-100, 100]
  dehaze: number;         // [-100, 100]
  sharpening: number;     // [0, 100]
  noiseReduction: number; // [0, 100]
}
```

### 4.2 Master Fragment Shader 结构

```glsl
#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_source;

// -- 基础 --
uniform float u_exposure;
uniform float u_contrast;
uniform vec4  u_tonalRange;  // (highlights, shadows, whites, blacks)
uniform vec4  u_curve;       // (curveHi, curveLights, curveDarks, curveShadows)

// -- 白平衡 --
uniform float u_temperature;
uniform float u_tint;

// -- OKLab HSL --
uniform float u_hueShift;
uniform float u_saturation;
uniform float u_vibrance;
uniform float u_luminance;

// -- 细节 --
uniform float u_clarity;
uniform float u_dehaze;

// #include "colorspace.glsl" (构建时内联或字符串拼接)

float luminance(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
    vec3 color = texture(u_source, v_uv).rgb;

    // Step 1: sRGB → Linear
    color = srgb2linear(color);

    // Step 2: 曝光（线性空间，物理准确）
    color *= exp2(u_exposure);

    // Step 3: LMS 白平衡
    color = whiteBalanceLMS(color, u_temperature / 100.0, u_tint / 100.0);

    // Step 4: 对比度（线性空间 pivot = 0.18 中灰）
    float pivot = 0.18;
    color = pivot * pow(color / pivot, vec3(1.0 + u_contrast * 0.01));

    // Step 5: 分区亮度调整
    float lum = luminance(color);
    float hiMask = smoothstep(0.5, 1.0, lum);
    float shMask = 1.0 - smoothstep(0.0, 0.5, lum);
    float whMask = smoothstep(0.75, 1.0, lum);
    float blMask = 1.0 - smoothstep(0.0, 0.25, lum);

    float tonalDelta = hiMask * u_tonalRange.x * 0.01
                     + shMask * u_tonalRange.y * 0.01
                     + whMask * u_tonalRange.z * 0.01
                     + blMask * u_tonalRange.w * 0.01;
    color += color * tonalDelta;

    // Step 6: 曲线（4 区段叠加）
    lum = luminance(color);
    float curveDelta = smoothstep(0.7, 1.0, lum) * u_curve.x * 0.01
                     + smoothstep(0.4, 0.7, lum) * (1.0 - smoothstep(0.7, 0.85, lum)) * u_curve.y * 0.01
                     + smoothstep(0.15, 0.4, lum) * (1.0 - smoothstep(0.4, 0.55, lum)) * u_curve.z * 0.01
                     + (1.0 - smoothstep(0.1, 0.3, lum)) * u_curve.w * 0.01;
    color += color * curveDelta;

    // Step 7: OKLab HSL 调整
    vec3 lab = rgb2oklab(color);
    // 色相旋转
    float angle = u_hueShift * 3.14159265 / 180.0;
    float ca = cos(angle), sa = sin(angle);
    lab.yz = vec2(lab.y * ca - lab.z * sa, lab.y * sa + lab.z * ca);
    // 饱和度
    lab.yz *= (1.0 + u_saturation * 0.01);
    // 自然饱和度（低饱和像素增幅更大）
    float chroma = length(lab.yz);
    float vibranceBoost = u_vibrance * 0.01 * (1.0 - smoothstep(0.0, 0.15, chroma));
    lab.yz *= (1.0 + vibranceBoost);
    // 亮度
    lab.x *= (1.0 + u_luminance * 0.01);
    color = oklab2rgb(lab);

    // Step 8: 去雾
    if (abs(u_dehaze) > 0.001) {
        float haze = u_dehaze * 0.01;
        color = (color - haze * 0.1) / max(1.0 - haze * 0.3, 0.1);
    }

    // Step 9: Linear → sRGB
    color = linear2srgb(clamp(color, 0.0, 1.0));

    outColor = vec4(color, 1.0);
}
```

---

## 五、Film Simulation Shader

### 5.1 六层模型设计

```
┌─────────────────────────────────────────────────────────────┐
│                    胶片模拟六层模型                           │
├─────────────┬───────────────────────────────────────────────┤
│ Layer 1     │ 特性曲线 (Tone Response)                       │
│             │ 模拟胶片非线性 S 形响应                         │
├─────────────┼───────────────────────────────────────────────┤
│ Layer 2     │ 色彩矩阵 (Color Matrix)                        │
│             │ 3×3 矩阵模拟染料光谱响应                       │
├─────────────┼───────────────────────────────────────────────┤
│ Layer 3     │ 3D LUT (HaldCLUT)                              │
│             │ 复杂非线性色彩映射                              │
├─────────────┼───────────────────────────────────────────────┤
│ Layer 4     │ 分区色偏 (Color Cast)                           │
│             │ 阴影/中间调/高光独立色偏                        │
├─────────────┼───────────────────────────────────────────────┤
│ Layer 5     │ 光学效果 (Halation + Bloom)                     │
│             │ 高光溢出、光晕效果                              │
├─────────────┼───────────────────────────────────────────────┤
│ Layer 6     │ 物理结构 (Grain + Vignette)                     │
│             │ 胶片颗粒、暗角                                  │
└─────────────┴───────────────────────────────────────────────┘
```

### 5.2 渐进交付路线图

| Phase | 层数 | 功能 | 周期 | 里程碑 |
|---|---|---|---|---|
| **Phase 1** | 3 层 | 特性曲线 + 3D LUT + 颗粒/暗角 | 2 周 | **MVP 可用** |
| **Phase 2** | 5 层 | + Halation/Bloom + 分区色偏 | +2 周 | 专业级效果 |
| **Phase 3** | 6 层 | + 色彩矩阵 | +1 周 | 完整科学模型 |

### 5.3 新 FilmProfile 数据结构

```typescript
// src/types/film.ts

/** 新版胶片 Profile（v2），与现有 v1 共存 */
interface FilmProfileV2 {
  id: string;
  version: 2;
  name: string;
  description?: string;
  type: "negative" | "slide" | "instant" | "bw";
  tags?: string[];

  // Layer 1: 特性曲线
  toneResponse: {
    enabled: boolean;
    shoulder: number;     // 高光压缩 [0, 1]
    toe: number;          // 阴影提升 [0, 1]
    gamma: number;        // 中间调 [0.5, 2.0]
  };

  // Layer 2: 色彩矩阵 (Phase 3)
  colorMatrix?: {
    enabled: boolean;
    matrix: number[];     // 3×3 = 9 个元素，row-major
  };

  // Layer 3: 3D LUT
  lut: {
    enabled: boolean;
    /** HaldCLUT 文件路径（相对于 public/luts/） */
    path: string;
    /** LUT 尺寸（8 = 8³ = 512px, 16 = 16³ = 4096px） */
    size: 8 | 16;
    /** 混合强度 [0, 1]，0 = 不应用，1 = 完全应用 */
    intensity: number;
  };

  // Layer 4: 分区色偏 (Phase 2)
  colorCast?: {
    enabled: boolean;
    shadows: [number, number, number];    // RGB 偏移
    midtones: [number, number, number];
    highlights: [number, number, number];
  };

  // Layer 5: 光学效果 (Phase 2)
  halation?: {
    enabled: boolean;
    intensity: number;    // [0, 1]
    threshold: number;    // [0.5, 1]
    color: [number, number, number]; // 溢光颜色（通常偏红）
    radius: number;       // 模糊半径 [1, 20]
  };
  bloom?: {
    enabled: boolean;
    intensity: number;    // [0, 1]
    threshold: number;    // [0.5, 1]
    radius: number;       // [1, 20]
  };

  // Layer 6: 物理结构
  grain: {
    enabled: boolean;
    amount: number;       // [0, 1]
    size: number;         // [0.5, 2.0]
    colorGrain: boolean;  // true = 彩色颗粒，false = 亮度颗粒
    roughness: number;    // [0, 1]
    shadowBias: number;   // [0, 1] 暗部颗粒增强
  };
  vignette: {
    enabled: boolean;
    amount: number;       // [-1, 1]（负值 = 白角）
    midpoint: number;     // [0, 1] 渐变起始位置
    roundness: number;    // [0, 1] 椭圆度
  };
}
```

### 5.4 v1 → v2 数据迁移

```typescript
// src/lib/film/migrate.ts

import type { FilmProfile } from "@/types";
import type { FilmProfileV2 } from "@/types/film";

/**
 * 将现有 v1 FilmProfile 转换为 v2 格式。
 * 保证向后兼容：v1 数据不丢失，缺失的 v2 字段用合理默认值填充。
 */
export function migrateFilmProfileV1ToV2(v1: FilmProfile): FilmProfileV2 {
  const colorScience = v1.modules.find(m => m.id === "colorScience");
  const tone = v1.modules.find(m => m.id === "tone");
  const scan = v1.modules.find(m => m.id === "scan");
  const grain = v1.modules.find(m => m.id === "grain");

  return {
    id: v1.id,
    version: 2,
    name: v1.name,
    description: v1.description,
    type: "negative", // v1 没有 type 字段，默认 negative
    tags: v1.tags,

    toneResponse: {
      enabled: true,
      shoulder: 0.8,  // 从 tone 模块的 highlights/whites 推导
      toe: 0.3,       // 从 tone 模块的 shadows/blacks 推导
      gamma: 1.0,
    },

    lut: {
      enabled: false,  // v1 没有 LUT，迁移后默认关闭
      path: "",
      size: 8,
      intensity: colorScience?.params
        ? (colorScience.params as { lutStrength: number }).lutStrength
        : 0.35,
    },

    grain: {
      enabled: grain?.enabled ?? false,
      amount: grain?.params ? (grain.params as { amount: number }).amount : 0,
      size: grain?.params ? (grain.params as { size: number }).size : 0.5,
      colorGrain: true,
      roughness: grain?.params ? (grain.params as { roughness: number }).roughness : 0.5,
      shadowBias: grain?.params ? (grain.params as { shadowBoost: number }).shadowBoost : 0.45,
    },

    vignette: {
      enabled: scan?.enabled ?? false,
      amount: scan?.params ? (scan.params as { vignetteAmount: number }).vignetteAmount : 0,
      midpoint: 0.5,
      roundness: 0.5,
    },
  };
}

/** 运行时自动检测版本并适配 */
export function ensureFilmProfileV2(
  profile: FilmProfile | FilmProfileV2
): FilmProfileV2 {
  if ((profile as FilmProfileV2).version === 2) {
    return profile as FilmProfileV2;
  }
  return migrateFilmProfileV1ToV2(profile as FilmProfile);
}
```

### 5.5 3D LUT 加载与采样

#### HaldCLUT 格式说明

HaldCLUT 是一张 2D PNG 图片，编码了一个 3D 颜色查找表：
- Level 8 = 8³ = 512 个条目，图片尺寸 512×512（每行 64 个色块，8×8 排列）
- 每个像素的位置编码一个 (R, G, B) 输入，像素的颜色值是对应的输出

#### 加载流程

```typescript
// src/lib/renderer/LUTLoader.ts

/**
 * 将 HaldCLUT PNG 解析为 WebGL 3D Texture。
 * 支持 level 8 (512×512) 和 level 16 (4096×4096)。
 */
export async function loadHaldCLUT(
  gl: WebGL2RenderingContext,
  imageSrc: string | Blob,
  level: 8 | 16 = 8
): Promise<WebGLTexture> {
  // 1. 加载图片
  const image = await loadImage(imageSrc);

  // 2. 用 Canvas 2D 读取像素
  const canvas = document.createElement("canvas");
  const size = level * level; // 64 或 256
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // 3. 重排为 3D texture 数据 (size × size × size × RGBA)
  const data = new Uint8Array(size * size * size * 4);
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        // HaldCLUT 坐标映射
        const pixelIndex = b * size * size + g * size + r;
        const px = pixelIndex % canvas.width;
        const py = Math.floor(pixelIndex / canvas.width);
        const srcIdx = (py * canvas.width + px) * 4;
        const dstIdx = (b * size * size + g * size + r) * 4;

        data[dstIdx + 0] = imageData.data[srcIdx + 0];
        data[dstIdx + 1] = imageData.data[srcIdx + 1];
        data[dstIdx + 2] = imageData.data[srcIdx + 2];
        data[dstIdx + 3] = 255;
      }
    }
  }

  // 4. 上传为 WebGL 3D Texture
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_3D, texture);
  gl.texImage3D(
    gl.TEXTURE_3D, 0, gl.RGBA8,
    size, size, size, 0,
    gl.RGBA, gl.UNSIGNED_BYTE, data
  );
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

  return texture;
}
```

#### GLSL 3D LUT 采样

```glsl
uniform sampler3D u_lut;
uniform float u_lutIntensity;  // [0, 1]
uniform bool u_lutEnabled;

vec3 applyLUT(vec3 color) {
    if (!u_lutEnabled || u_lutIntensity <= 0.0) {
        return color;
    }
    // 3D 纹理坐标范围 [0, 1]，hardware trilinear interpolation
    vec3 lutColor = texture(u_lut, clamp(color, 0.0, 1.0)).rgb;
    return mix(color, lutColor, u_lutIntensity);
}
```

### 5.6 Film Fragment Shader（Phase 1 版本）

```glsl
#version 300 es
precision highp float;
precision highp sampler3D;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_master;     // Master Pass 输出
uniform sampler3D u_lut;        // 3D LUT 纹理

// Layer 1: Tone Response
uniform bool  u_toneEnabled;
uniform float u_shoulder;       // [0, 1]
uniform float u_toe;            // [0, 1]
uniform float u_gamma;          // [0.5, 2.0]

// Layer 3: LUT
uniform bool  u_lutEnabled;
uniform float u_lutIntensity;   // [0, 1]

// Layer 6: Grain
uniform bool  u_grainEnabled;
uniform float u_grainAmount;
uniform float u_grainSize;
uniform float u_grainRoughness;
uniform float u_grainShadowBias;
uniform float u_grainSeed;
uniform bool  u_grainIsColor;

// Layer 6: Vignette
uniform bool  u_vignetteEnabled;
uniform float u_vignetteAmount;
uniform float u_vignetteMidpoint;
uniform float u_vignetteRoundness;

// #include "colorspace.glsl"

float luminance(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float hash12(vec2 p, float seed) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33 + seed * 0.000001);
    return fract((p3.x + p3.y) * p3.z);
}

// Layer 1: 胶片特性曲线
vec3 applyToneResponse(vec3 color) {
    if (!u_toneEnabled) return color;

    // Filmic S-curve: shoulder 控制高光压缩，toe 控制阴影提升
    color = pow(color, vec3(u_gamma));

    // Shoulder: soft-clip 高光
    vec3 shoulderCurve = 1.0 - exp(-color / max(u_shoulder, 0.01));
    color = mix(color, shoulderCurve, u_shoulder);

    // Toe: 提升暗部
    vec3 toeCurve = pow(color, vec3(1.0 - u_toe * 0.5));
    color = mix(color, toeCurve, u_toe);

    return clamp(color, 0.0, 1.0);
}

// Layer 3: 3D LUT 采样
vec3 applyLUT(vec3 color) {
    if (!u_lutEnabled || u_lutIntensity <= 0.0) return color;
    vec3 lutColor = texture(u_lut, clamp(color, 0.0, 1.0)).rgb;
    return mix(color, lutColor, u_lutIntensity);
}

// Layer 6: Grain
vec3 applyGrain(vec3 color) {
    if (!u_grainEnabled || u_grainAmount <= 0.0) return color;

    float grainScale = mix(2.8, 0.45, u_grainSize);
    vec2 grainCoord = floor(v_uv * vec2(1800.0) * grainScale);

    float coarse = hash12(grainCoord, u_grainSeed) - 0.5;
    float fine = hash12(v_uv * vec2(3600.0), u_grainSeed + 1.0) - 0.5;
    float mixed = mix(coarse, fine, u_grainRoughness);

    float lum = luminance(color);
    float shadowWeight = 1.0 + (1.0 - lum) * u_grainShadowBias;
    float noiseStrength = mixed * u_grainAmount * 0.55 * shadowWeight;

    if (u_grainIsColor) {
        float cR = (hash12(v_uv * vec2(2100.0), u_grainSeed + 2.0) - 0.5) * 0.15;
        float cG = (hash12(v_uv * vec2(2200.0), u_grainSeed + 3.0) - 0.5) * 0.15;
        float cB = (hash12(v_uv * vec2(2300.0), u_grainSeed + 4.0) - 0.5) * 0.15;
        color.r += noiseStrength * (1.0 + cR);
        color.g += noiseStrength * (1.0 + cG);
        color.b += noiseStrength * (1.0 + cB);
    } else {
        color += vec3(noiseStrength);
    }

    return clamp(color, 0.0, 1.0);
}

// Layer 6: Vignette
vec3 applyVignette(vec3 color) {
    if (!u_vignetteEnabled || abs(u_vignetteAmount) < 0.001) return color;

    vec2 center = v_uv - 0.5;
    // roundness 控制椭圆形状
    float aspect = 1.0; // TODO: 传入实际宽高比
    center.x *= mix(1.0, aspect, u_vignetteRoundness);

    float dist = length(center) * 2.0;
    float edge = smoothstep(u_vignetteMidpoint, 1.0, dist);

    if (u_vignetteAmount > 0.0) {
        color *= 1.0 - edge * edge * u_vignetteAmount;
    } else {
        color += vec3(edge * edge * abs(u_vignetteAmount) * 0.35);
    }

    return clamp(color, 0.0, 1.0);
}

void main() {
    vec3 color = texture(u_master, v_uv).rgb;

    color = applyToneResponse(color);
    color = applyLUT(color);
    color = applyGrain(color);
    color = applyVignette(color);

    outColor = vec4(color, 1.0);
}
```

---

## 六、Compile-Time Shader Code Generator

### 6.1 工作原理

```
┌────────────────────┐     ┌───────────────────────┐
│ shader.config.ts   │     │ GLSL 模板文件          │
│ (功能开关 + 算法)   │     │ (colorspace / math / …) │
└────────┬───────────┘     └────────┬──────────────┘
         │                          │
         ▼                          ▼
┌────────────────────────────────────────────────────┐
│         ShaderCodeGenerator (scripts/)              │
│  1. 读取 config，确定启用哪些功能                    │
│  2. 拼接对应 GLSL 模板片段                           │
│  3. 内联 < 10 行的小函数                             │
│  4. 消除 disabled 功能对应的死代码                    │
│  5. 预计算常量表达式                                  │
│  6. 输出优化后的 .glsl 到 shaders/generated/         │
└────────────────────────────────────────────────────┘
         │
         ▼
shaders/generated/
├── default.vert                  # 共用顶点着色器
├── MasterAdjustment.frag         # 优化后的 Master Fragment
└── FilmSimulation.frag           # 优化后的 Film Fragment
```

### 6.2 配置化 Shader 定义

```typescript
// src/lib/renderer/shader.config.ts

export interface MasterConfig {
  exposure: { enabled: boolean; range: [number, number]; algorithm: "linear" };
  whiteBalance: { enabled: boolean; algorithm: "LMS" | "simple" };
  tonalRange: {
    enabled: boolean;
    highlights: { range: [number, number] };
    shadows: { range: [number, number] };
    whites: { range: [number, number] };
    blacks: { range: [number, number] };
  };
  hsl: {
    enabled: boolean;
    space: "OKLab" | "HSV";
    hueShift: { range: [number, number] };
    saturation: { range: [number, number] };
    vibrance: { range: [number, number] };
    lightness: { range: [number, number] };
  };
  curve: { enabled: boolean; channels: ("rgb" | "r" | "g" | "b")[] };
  dehaze: { enabled: boolean };
}

export interface FilmConfig {
  toneResponse: { enabled: boolean };
  lut: { enabled: boolean; size: 8 | 16 };
  colorMatrix: { enabled: boolean };
  colorCast: { enabled: boolean };
  halation: { enabled: boolean };
  bloom: { enabled: boolean };
  grain: { enabled: boolean; animated: boolean };
  vignette: { enabled: boolean };
}

export const masterConfig: MasterConfig = {
  exposure: { enabled: true, range: [-5, 5], algorithm: "linear" },
  whiteBalance: { enabled: true, algorithm: "LMS" },
  tonalRange: {
    enabled: true,
    highlights: { range: [-100, 100] },
    shadows: { range: [-100, 100] },
    whites: { range: [-100, 100] },
    blacks: { range: [-100, 100] },
  },
  hsl: {
    enabled: true,
    space: "OKLab",
    hueShift: { range: [-180, 180] },
    saturation: { range: [-100, 100] },
    vibrance: { range: [-100, 100] },
    lightness: { range: [-100, 100] },
  },
  curve: { enabled: true, channels: ["rgb", "r", "g", "b"] },
  dehaze: { enabled: true },
};

export const filmConfig: FilmConfig = {
  toneResponse: { enabled: true },
  lut: { enabled: true, size: 8 },
  colorMatrix: { enabled: false },   // Phase 3
  colorCast: { enabled: false },     // Phase 2
  halation: { enabled: false },      // Phase 2
  bloom: { enabled: false },         // Phase 2
  grain: { enabled: true, animated: true },
  vignette: { enabled: true },
};
```

### 6.3 Code Generator 核心实现

```typescript
// scripts/generate-shaders.ts
// 构建时执行: pnpm generate:shaders

import { masterConfig, filmConfig } from "../src/lib/renderer/shader.config";
import fs from "fs";
import path from "path";

class ShaderCodeGenerator {
  private optimizations = {
    inlineThreshold: 10,        // 小于 10 行的函数内联
    eliminateDeadCode: true,    // 消除未使用的函数
    unrollSmallLoops: true,     // 展开小循环
    precomputeConstants: true,  // 预计算常量
  };

  generateMasterShader(config: MasterConfig): string {
    const parts: string[] = [];
    parts.push(this.generateHeader("MasterAdjustment"));
    parts.push(this.generateUniforms(config));
    parts.push(this.generateIncludes(config));
    parts.push(this.generateMainFunction(config));
    return this.optimize(parts.join("\n\n"));
  }

  generateFilmShader(config: FilmConfig): string {
    const parts: string[] = [];
    parts.push(this.generateHeader("FilmSimulation"));
    parts.push(this.generateFilmUniforms(config));
    parts.push(this.generateFilmIncludes(config));
    parts.push(this.generateFilmMain(config));
    return this.optimize(parts.join("\n\n"));
  }

  private generateIncludes(config: MasterConfig): string {
    const functions: string[] = [];
    // 始终需要 sRGB ↔ Linear
    functions.push(this.loadTemplate("srgb.glsl"));

    if (config.whiteBalance.enabled && config.whiteBalance.algorithm === "LMS") {
      functions.push(this.loadTemplate("lms.glsl"));
    }
    if (config.hsl.enabled && config.hsl.space === "OKLab") {
      functions.push(this.loadTemplate("oklab.glsl"));
    }

    return functions.join("\n");
  }

  private generateMainFunction(config: MasterConfig): string {
    const lines: string[] = [
      "void main() {",
      "  vec3 color = texture(uSampler, vTextureCoord).rgb;",
      "  color = srgb2linear(color);",
    ];

    if (config.exposure.enabled) {
      lines.push("  color *= exp2(u_exposure);");
    }
    if (config.whiteBalance.enabled) {
      lines.push("  color = whiteBalanceLMS(color, u_temperature / 100.0, u_tint / 100.0);");
    }
    if (config.tonalRange.enabled) {
      lines.push("  color = applyTonalRange(color, u_tonalRange);");
    }
    if (config.curve.enabled) {
      lines.push("  color = applyCurve(color, u_curve);");
    }
    if (config.hsl.enabled) {
      lines.push("  color = hslAdjustOKLab(color, u_hueShift, u_saturation, u_vibrance, u_luminance);");
    }
    if (config.dehaze.enabled) {
      lines.push("  color = applyDehaze(color, u_dehaze);");
    }

    lines.push("  color = linear2srgb(clamp(color, 0.0, 1.0));");
    lines.push("  gl_FragColor = vec4(color, 1.0);");
    lines.push("}");

    return lines.join("\n");
  }

  private optimize(source: string): string {
    let result = source;
    if (this.optimizations.eliminateDeadCode) {
      result = this.eliminateUnusedFunctions(result);
    }
    if (this.optimizations.inlineThreshold > 0) {
      result = this.inlineSmallFunctions(result, this.optimizations.inlineThreshold);
    }
    return result;
  }

  // ... 内联、死代码消除、模板加载等辅助方法
  private loadTemplate(name: string): string { /* ... */ return ""; }
  private eliminateUnusedFunctions(source: string): string { /* ... */ return source; }
  private inlineSmallFunctions(source: string, threshold: number): string { /* ... */ return source; }
  private generateHeader(name: string): string { /* ... */ return ""; }
  private generateUniforms(config: MasterConfig): string { /* ... */ return ""; }
  private generateFilmUniforms(config: FilmConfig): string { /* ... */ return ""; }
  private generateFilmIncludes(config: FilmConfig): string { /* ... */ return ""; }
  private generateFilmMain(config: FilmConfig): string { /* ... */ return ""; }
}

// CLI 入口
const generator = new ShaderCodeGenerator();
const outDir = path.resolve(__dirname, "../src/lib/renderer/shaders/generated");
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(
  path.join(outDir, "MasterAdjustment.frag"),
  generator.generateMasterShader(masterConfig)
);
fs.writeFileSync(
  path.join(outDir, "FilmSimulation.frag"),
  generator.generateFilmShader(filmConfig)
);
console.log("Shaders generated successfully.");
```

### 6.4 构建集成

```json
// package.json scripts
{
  "generate:shaders": "tsx scripts/generate-shaders.ts",
  "dev": "pnpm generate:shaders && vite",
  "build": "pnpm generate:shaders && tsc -b && vite build"
}
```

### 6.5 Shader Hot Reload（开发体验）

开发时使用 Vite 的 `?raw` 导入 + HMR 实现 shader 热重载：

```typescript
// src/lib/renderer/shaderHotReload.ts (仅 dev 模式)

if (import.meta.hot) {
  import.meta.hot.accept(
    "../shaders/generated/MasterAdjustment.frag?raw",
    (newModule) => {
      // 重新编译 shader program
      masterFilter.updateShaderSource(newModule?.default);
    }
  );
}
```

> 开发时修改 `shader.config.ts` 或 GLSL 模板后，执行 `pnpm generate:shaders` 即可重新生成，Vite HMR 会自动拾取变更。

### 6.6 GLSL 源文件组织

```
src/lib/renderer/
├── shaders/
│   ├── templates/                   # GLSL 模板片段（Code Generator 输入）
│   │   ├── srgb.glsl               # sRGB ↔ Linear
│   │   ├── oklab.glsl              # OKLab 转换 + HSL 调整
│   │   ├── lms.glsl                # LMS 白平衡
│   │   ├── tonalRange.glsl         # 分区亮度调整
│   │   ├── curve.glsl              # 曲线
│   │   ├── dehaze.glsl             # 去雾
│   │   ├── toneResponse.glsl       # 胶片特性曲线
│   │   ├── lut3d.glsl              # 3D LUT 采样
│   │   ├── grain.glsl              # 颗粒
│   │   └── vignette.glsl           # 暗角
│   └── generated/                   # 构建时输出（gitignore）
│       ├── default.vert
│       ├── MasterAdjustment.frag
│       └── FilmSimulation.frag
├── shader.config.ts                 # 功能配置
├── filters/
│   ├── MasterAdjustmentFilter.ts    # PIXI.Filter 封装
│   └── FilmSimulationFilter.ts      # PIXI.Filter 封装
├── PixiRenderer.ts                  # PixiJS Application 封装
├── LUTLoader.ts                     # HaldCLUT → 3D Texture
├── LUTCache.ts                      # LUT LRU 缓存
├── uniformResolvers.ts              # Adjustments → Uniforms
└── types.ts                         # MasterUniforms / FilmUniforms
```

---

## 七、胶片参数获取方案

### 7.1 参数来源优先级

| 优先级 | 来源 | 成本 | 质量 | 适用阶段 |
|---|---|---|---|---|
| 1 | **开源 HaldCLUT** | 免费 | 中上 | MVP |
| 2 | **LUT 反向提取** | 免费 | 高 | V1 |
| 3 | **色卡拟合** | 免费 | 专业 | V2 |
| 4 | 商业 LUT | $15-100 | 专业 | V3+ |

### 7.2 推荐开源资源

| 来源 | 内容 | 许可 | 获取 |
|---|---|---|---|
| RawTherapee CLUT | 100+ 胶片模拟 | CC BY-SA 4.0 | [GitHub](https://github.com/Beep6581/RawTherapee) |
| G'MIC Film Pack | 艺术风格 LUT | CeCILL (GPL 兼容) | [gmic.eu](https://gmic.eu) |
| Fuji X-Trans LUTs | 12 款经典胶片 | 个人免费 | 富士官网 |

### 7.3 LUT 文件管理

```
public/luts/
├── index.json              # LUT 清单 + 元数据
├── kodak-portra-400.png    # HaldCLUT Level 8 (512×512)
├── fuji-velvia-50.png
├── ilford-hp5-plus.png
├── kodak-ektar-100.png
└── fuji-provia-100f.png
```

```json
// public/luts/index.json
{
  "version": 1,
  "luts": [
    {
      "id": "kodak-portra-400",
      "name": "Kodak Portra 400",
      "file": "kodak-portra-400.png",
      "level": 8,
      "type": "negative",
      "tags": ["portrait", "warm"]
    }
  ]
}
```

### 7.4 参数提取工具（开发时使用）

```typescript
// scripts/extract-profile.ts
// 使用 culori 进行色差计算，Node.js 环境运行

import { differenceEuclidean, oklch } from "culori";

/**
 * 从 HaldCLUT 中提取特性曲线参数。
 * 方法：沿中性灰轴（R=G=B）采样 LUT 输出，拟合 S 曲线。
 */
function extractToneResponse(haldClutData: ImageData, level: number) {
  const size = level * level; // 64
  const grayPoints: Array<{ input: number; output: number }> = [];

  for (let i = 0; i < size; i++) {
    const inputValue = i / (size - 1);
    // 中性灰轴上的点: R = G = B = i
    const pixelIndex = i * size * size + i * size + i;
    const px = pixelIndex % haldClutData.width;
    const py = Math.floor(pixelIndex / haldClutData.width);
    const idx = (py * haldClutData.width + px) * 4;

    const outputR = haldClutData.data[idx] / 255;
    const outputG = haldClutData.data[idx + 1] / 255;
    const outputB = haldClutData.data[idx + 2] / 255;
    const outputLum = 0.2126 * outputR + 0.7152 * outputG + 0.0722 * outputB;

    grayPoints.push({ input: inputValue, output: outputLum });
  }

  // 拟合 shoulder / toe / gamma 参数
  return fitSCurve(grayPoints);
}

/**
 * 比较 LUT 输出与原始，计算 ΔE₀₀（OKLab 色差），
 * 验证预设参数的准确性。
 */
function validateProfile(
  haldClutData: ImageData,
  profile: FilmProfileV2,
  maxDeltaE: number = 2.0
): { passed: boolean; avgDeltaE: number; maxDeltaE: number } {
  // 采样标准色卡坐标，对比 LUT 输出 vs 参数化重建
  // ...
}
```

---

## 八、API 兼容层设计

### 8.1 渐进迁移策略

重构不一次性替换所有代码，而是通过适配层实现平滑过渡：

```
现有入口 (imageProcessing.ts)
       │
       ▼
  resolveProfile()  ← 检测 v1 / v2 并适配
       │
       ├─ v1 profile → 自动迁移为 v2（migrate.ts）→ 新管线
       │
       └─ v2 profile → 使用新管线（PixiJS multi-pass FilterSystem）
       │
       └─ WebGL 不可用 → CPU 回退管线（pipeline.ts 简化版）
```

### 8.2 新 renderImageToCanvas 实现

```typescript
// src/lib/imageProcessing.ts（重构后）

import { PixiRenderer } from "./renderer/PixiRenderer";
import { ensureFilmProfileV2 } from "./film/migrate";
import { resolveFromAdjustments, resolveFilmUniforms } from "./renderer/uniformResolvers";

let renderer: PixiRenderer | null = null;

export const renderImageToCanvas = async (options: RenderImageOptions) => {
  const { canvas, source, adjustments, filmProfile, signal } = options;

  // 1. 加载图片源（复用现有 loadImageSource）
  const loaded = await loadImageSource(source, signal);
  if (signal?.aborted) { loaded.cleanup?.(); return; }

  // 2. Geometry Transform（Canvas 2D 裁剪/旋转/翻转）——复用现有逻辑
  const { cropCanvas, width, height } = applyGeometryTransform(loaded, adjustments);

  // 3. 初始化 / 复用 PixiJS 渲染器
  if (!renderer) {
    renderer = new PixiRenderer(canvas, width, height);
  }
  renderer.updateSource(cropCanvas, width, height);

  // 4. 解析 Master uniforms
  const masterUniforms = resolveFromAdjustments(adjustments);

  // 5. 解析 Film Profile（自动兼容 v1 / v2）
  const filmV2 = filmProfile ? ensureFilmProfileV2(filmProfile) : null;
  const filmUniforms = filmV2 ? resolveFilmUniforms(filmV2) : null;

  // 6. 加载 LUT（有缓存，不会重复加载同一个）
  if (filmV2?.lut.enabled && filmV2.lut.path) {
    await renderer.loadLUT(`/luts/${filmV2.lut.path}`, filmV2.lut.size);
  }

  // 7. 渲染（PixiJS 自动管理 multi-pass FBO）
  renderer.render(masterUniforms, filmUniforms, {
    skipFilm: !filmV2,
  });

  loaded.cleanup?.();
};
```

### 8.3 EditingAdjustments → MasterUniforms 映射

```typescript
// src/lib/renderer/uniformResolvers.ts

function resolveFromAdjustments(adj: EditingAdjustments): MasterUniforms {
  return {
    // 直接映射
    exposure: adj.exposure / 100 * 5,  // 归一化到 EV [-5, 5]
    contrast: adj.contrast,
    highlights: adj.highlights,
    shadows: adj.shadows,
    whites: adj.whites,
    blacks: adj.blacks,
    temperature: adj.temperature,
    tint: adj.tint,

    // 新增映射（从现有 vibrance/saturation 推导）
    hueShift: 0,  // 现有系统无全局色相旋转
    saturation: adj.saturation,
    vibrance: adj.vibrance,
    luminance: 0,  // 现有系统无独立亮度控制

    // 曲线
    curveHighlights: adj.curveHighlights,
    curveLights: adj.curveLights,
    curveDarks: adj.curveDarks,
    curveShadows: adj.curveShadows,

    // 细节
    clarity: adj.clarity,
    texture: adj.texture,
    dehaze: adj.dehaze,
    sharpening: adj.sharpening,
    noiseReduction: adj.noiseReduction,
  };
}
```

---

## 九、重构后项目结构

```
src/
├── lib/
│   ├── renderer/                    # 【新增】PixiJS 渲染引擎
│   │   ├── shaders/
│   │   │   ├── templates/           # GLSL 模板片段（Code Generator 输入）
│   │   │   │   ├── srgb.glsl
│   │   │   │   ├── oklab.glsl
│   │   │   │   ├── lms.glsl
│   │   │   │   ├── tonalRange.glsl
│   │   │   │   ├── curve.glsl
│   │   │   │   ├── dehaze.glsl
│   │   │   │   ├── toneResponse.glsl
│   │   │   │   ├── lut3d.glsl
│   │   │   │   ├── grain.glsl
│   │   │   │   └── vignette.glsl
│   │   │   └── generated/           # 构建时输出（.gitignore）
│   │   │       ├── default.vert
│   │   │       ├── MasterAdjustment.frag
│   │   │       └── FilmSimulation.frag
│   │   ├── filters/
│   │   │   ├── MasterAdjustmentFilter.ts   # PIXI.Filter 封装
│   │   │   └── FilmSimulationFilter.ts     # PIXI.Filter 封装
│   │   ├── shader.config.ts         # 功能开关配置
│   │   ├── PixiRenderer.ts          # PixiJS Application 封装
│   │   ├── LUTLoader.ts             # HaldCLUT → 3D Texture
│   │   ├── LUTCache.ts              # LUT LRU 缓存
│   │   ├── uniformResolvers.ts      # Adjustments → Uniforms
│   │   └── types.ts
│   ├── film/                        # 【重构】胶片系统
│   │   ├── pipeline.ts             # 保留 CPU 回退（仅降级时使用）
│   │   ├── webgl2.ts               # 【废弃】→ 由 renderer/ 替代
│   │   ├── profile.ts              # 保留 v1 profile 逻辑
│   │   ├── profileV2.ts            # 【新增】v2 profile 逻辑
│   │   ├── migrate.ts              # 【新增】v1 → v2 迁移
│   │   ├── registry.ts             # 扩展支持 v2 profile
│   │   ├── utils.ts                # 保留
│   │   └── index.ts                # 更新导出
│   ├── export/                      # 【新增】导出工具
│   │   └── zipExporter.ts          # fflate ZIP 打包
│   ├── adjustments.ts              # 保留（兼容层）
│   └── imageProcessing.ts          # 重构入口逻辑
├── data/
│   ├── filmProfiles.ts             # 保留 v1 预设
│   └── filmProfilesV2.ts          # 【新增】v2 预设（关联 LUT）
├── types/
│   ├── index.ts                    # 保留现有类型
│   └── film.ts                     # 【新增】FilmProfileV2 类型
└── ...

public/
└── luts/                           # 【新增】HaldCLUT 文件
    ├── index.json
    ├── kodak-portra-400.png
    └── ...

scripts/                            # 【新增】开发/构建工具
├── generate-shaders.ts            # Compile-Time Shader Code Generator
├── extract-profile.ts             # 参数提取
└── validate-luts.ts               # LUT 色差验证
```

---

## 十、CPU 回退策略

当 PixiJS / WebGL 不可用时（极少数浏览器/隐私模式），保留 CPU 渲染管线：

```typescript
// src/lib/renderer/CPUFallbackPipeline.ts

/**
 * 纯 CPU 实现的简化管线，仅保留核心功能：
 * - 曝光、对比度、白平衡（简化版 LMS）
 * - LUT 采样（CPU 3D 插值）
 * - Grain、Vignette
 *
 * 不包含：Halation、Bloom（CPU 上太慢）
 */
export function applyCPUFallbackPipeline(
  imageData: ImageData,
  masterUniforms: MasterUniforms,
  filmProfile: FilmProfileV2 | null,
  lutData: Uint8Array | null,  // 预加载的 LUT 数据
  lutSize: number
): void {
  const data = imageData.data;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;

    // sRGB → Linear
    r = srgb2linear(r);
    g = srgb2linear(g);
    b = srgb2linear(b);

    // 曝光
    const exp = Math.pow(2, masterUniforms.exposure);
    r *= exp; g *= exp; b *= exp;

    // 白平衡（简化 LMS）
    [r, g, b] = applyLMSWhiteBalance(r, g, b, masterUniforms.temperature, masterUniforms.tint);

    // Linear → sRGB
    r = linear2srgb(clamp01(r));
    g = linear2srgb(clamp01(g));
    b = linear2srgb(clamp01(b));

    // 3D LUT 采样（三线性插值）
    if (filmProfile?.lut.enabled && lutData) {
      [r, g, b] = sampleLUT3D(r, g, b, lutData, lutSize, filmProfile.lut.intensity);
    }

    data[i] = Math.round(r * 255);
    data[i + 1] = Math.round(g * 255);
    data[i + 2] = Math.round(b * 255);
  }
}
```

---

## 十一、实施路线图

### 11.1 完整时间线

| 阶段 | 周期 | 目标 | 关键交付物 | 前置条件 |
|---|---|---|---|---|
| **Phase 0** | 3 天 | 技术验证 | PixiJS Filter multi-pass POC、3D Texture 加载验证、OKLab shader 正确性测试、Shader Code Generator 原型 | 无 |
| **Phase 1a** | 1 周 | 渲染引擎重构 | `PixiRenderer`、`MasterAdjustmentFilter`、`FilmSimulationFilter`、Shader Code Generator、GLSL 模板文件结构 | Phase 0 |
| **Phase 1b** | 1 周 | Master Shader | 完整的 Master Adjustment Fragment（OKLab HSL + LMS 白平衡），通过 Code Generator 生成 | Phase 1a |
| **Phase 1c** | 1 周 | Film Shader MVP | 特性曲线 + 3D LUT + Grain + Vignette、首批 3 款 LUT 集成 | Phase 1a |
| **Phase 1d** | 3 天 | 集成与兼容 | `imageProcessing.ts` 重构、v1→v2 迁移、CPU 回退、fflate 导出集成 | Phase 1b + 1c |
| **Phase 2** | 2 周 | 专业效果 | Halation/Bloom（独立 PIXI.Filter）、分区色偏、10 款胶片 | Phase 1 |
| **Phase 3** | 1 周 | 完整模型 | 色彩矩阵层、参数提取工具、视觉回归测试 | Phase 2 |

### 11.2 Phase 0 验证清单

| 验证项 | 方法 | 通过标准 | 风险等级 |
|---|---|---|---|
| PixiJS Filter multi-pass | 最小原型（2 个 PIXI.Filter 串联） | 输出正确、无 artifact | 低 |
| Shader Code Generator | 从 config 生成 GLSL，PixiJS 编译通过 | 生成的 shader 无编译错误 | 低 |
| WebGL 3D Texture 支持 | `gl.texImage3D` + 采样测试 | 所有目标浏览器支持 | 低（WebGL2 标准功能） |
| HaldCLUT 8³ 解析正确性 | 恒等 LUT 测试（input == output） | 最大像素误差 ≤ 1 | 低 |
| OKLab 转换精度 | 对比 culori 参考实现 | 最大分量误差 < 0.001 | 低 |
| LMS 白平衡视觉效果 | 与 Lightroom 对照 | 主观一致 | 中 |
| PixiJS v7.4 兼容性 | 最小原型测试 | 95%+ 目标浏览器通过 | 低 |
| 2K 图像 2-pass 性能 | FPS 计数器 | ≥ 60fps | 低 |
| 4K 图像 2-pass 性能 | FPS 计数器 | ≥ 30fps | 中 |
| 3D Texture 内存 | `performance.memory` | 8³ LUT < 2MB | 低 |

### 11.3 里程碑定义

| 里程碑 | 定义 | 验收标准 |
|---|---|---|
| **MVP** (Phase 1 完成) | PixiJS 渲染引擎 + Shader Code Generator 上线，OKLab HSL + LMS 白平衡 + 3D LUT + 3 款胶片 | 现有功能不回退；新 shader 色彩明显优于旧版；LUT 可正确加载和混合 |
| **V1** (Phase 2 完成) | Halation/Bloom + 分区色偏 + 10 款胶片 | 效果媲美 VSCO/RNI Films 入门级 |
| **V2** (Phase 3 完成) | 完整六层模型 + 参数提取工具 | 可从 HaldCLUT 自动提取完整 FilmProfile |

### 11.4 实施进度（2026-02-16 更新）

| 阶段 | 状态 | 说明 |
|---|---|---|
| **Phase 1a — 渲染引擎重构** | ✅ 已完成 | PixiJS v7 集成、双 Pass Filter 管线、GLSL 300 es shader、3D Texture 手动绑定 |
| **Phase 1b — Master Shader** | ✅ 已完成 | OKLab HSL + LMS 白平衡 + 全部 17 项 Master 调整参数 |
| **Phase 1c — Film Shader MVP** | ✅ 已完成 | 特性曲线 + 3D LUT（HaldCLUT）+ Grain + Vignette |
| **Phase 1d — 集成与兼容** | ✅ 已完成 | `imageProcessing.ts` 集成、v1 数据兼容适配层、CPU 回退、feature flag 隔离 |
| **Shader Code Generator** | ✅ 已完成 | Compile-Time 生成架构、10 个模板片段、tsx 脚本、config-driven 功能切换 |
| **Phase 0 — 技术验证** | ⏳ 待验证 | 代码已就绪，需在浏览器中完成 shader 编译与渲染正确性验证 |
| **Phase 2 — 专业效果** | 🔲 未开始 | Halation/Bloom、分区色偏、10 款胶片 |
| **Phase 3 — 完整模型** | 🔲 未开始 | 色彩矩阵层、参数提取工具 |

**已交付的代码文件（更新到 2026-02-16）：**

```
src/glsl.d.ts                                  # GLSL 模块声明（?raw 导入）
src/lib/renderer/
├── shader.config.ts                            # 【新】功能配置（MasterConfig + FilmConfig）
├── types.ts                                    # MasterUniforms / FilmUniforms 接口
├── PixiRenderer.ts                             # PixiJS Application 封装 + 渲染入口
├── uniformResolvers.ts                         # EditingAdjustments / FilmProfile → Uniforms 转换
├── LUTLoader.ts                                # HaldCLUT PNG → WebGL 3D Texture
├── LUTCache.ts                                 # LRU 缓存管理（≤5 个 3D Texture）
├── shaders/
│   ├── default.vert                            # 共享顶点着色器（GLSL 300 es）
│   ├── MasterAdjustment.frag                   # 主调整片段着色器（17 项参数，生成源）
│   ├── FilmSimulation.frag                     # 胶片模拟片段着色器（生成源）
│   ├── templates/                              # 【新】GLSL 模板片段（9 个文件）
│   │   ├── srgb.glsl
│   │   ├── oklab.glsl
│   │   ├── lms.glsl
│   │   ├── luminance.glsl
│   │   ├── hash.glsl
│   │   ├── toneResponse.glsl
│   │   ├── lut3d.glsl
│   │   ├── colorCast.glsl
│   │   ├── grain.glsl
│   │   └── vignette.glsl
│   └── generated/                              # 【新】构建时输出（gitignore）
│       ├── MasterAdjustment.frag
│       ├── FilmSimulation.frag
│       └── default.vert
├── filters/
│   ├── MasterAdjustmentFilter.ts               # PixiJS Filter — 科学色彩调整 Pass
│   └── FilmSimulationFilter.ts                 # PixiJS Filter — 胶片模拟 Pass
└── HalationBloomFilter.ts                      # 【新】PixiJS Filter — 光学效果 Pass（4-pass）
scripts/
└── generate-shaders.ts                         # 【新】Compile-Time Shader Code Generator
```

**集成方式：** 新渲染器通过 `window.__FILMLAB_USE_PIXI = true` feature flag 启用，默认关闭。`imageProcessing.ts` 中采用动态 `import()` 加载 PixiJS 模块，不影响默认包体积（PixiJS 独立 chunk ~488KB）。

**Shader Code Generator 详情：**
- 配置文件：`src/lib/renderer/shader.config.ts`（定义启用的功能）
- 模板目录：`src/lib/renderer/shaders/templates/`（10 个 GLSL 片段）
- 生成器：`scripts/generate-shaders.ts`（~250 行 tsx 脚本）
- 输出目录：`src/lib/renderer/shaders/generated/`（gitignore）
- 构建集成：`package.json` scripts — `pnpm generate:shaders` 在 dev/build 前执行
- 关键特性：
  - 自动死代码消除（未启用功能的代码不出现在生成的 shader 中）
  - 生成的 shader 与手写版本字节级别一致（已验证）
  - 支持功能切换：修改 config 即可启用/禁用特性

**已知限制：**
- PixiJS v7 `mapType` 不识别 `sampler3D`，需在 `FilmSimulationFilter.apply()` 中手动绑定 3D Texture 到指定纹理单元。
- 需要浏览器完成 Phase 0 验证（shader 编译、色彩精度、性能基准）后方可去除 feature flag。

---

## 十二、性能目标与降级策略

### 12.1 性能指标

| 场景 | 目标 | 策略 |
|---|---|---|
| 2K 图像实时预览 | ≥ 60fps | PixiJS 2 Pass Filter 渲染，全分辨率 |
| 4K 图像实时预览 | ≥ 30fps | 降采样预览（2K），导出时全分辨率 |
| 导出 4K JPEG | < 3s | `renderer.extract.pixels()` + Canvas `toBlob` |
| 批量导出 ZIP | < 10s/10张 | fflate 流式压缩 + Web Worker |
| 3D LUT 加载 | < 200ms | 异步加载 + 缓存已解析的 3D Texture |
| 内存（3 LUT 同时加载） | < 10MB | 8³ LUT ≈ 1MB/个；按需加载，LRU 淘汰 |

### 12.2 LUT 缓存策略

```typescript
// src/lib/renderer/LUTCache.ts

class LUTCache {
  private cache = new Map<string, WebGLTexture>();
  private order: string[] = [];
  private maxSize = 5; // 最多缓存 5 个 3D Texture

  async get(
    gl: WebGL2RenderingContext,
    lutPath: string,
    level: 8 | 16
  ): Promise<WebGLTexture> {
    if (this.cache.has(lutPath)) {
      // 移到最近使用
      this.order = this.order.filter(k => k !== lutPath);
      this.order.push(lutPath);
      return this.cache.get(lutPath)!;
    }

    // 加载新 LUT
    const texture = await loadHaldCLUT(gl, lutPath, level);
    this.cache.set(lutPath, texture);
    this.order.push(lutPath);

    // LRU 淘汰
    while (this.order.length > this.maxSize) {
      const evicted = this.order.shift()!;
      const tex = this.cache.get(evicted);
      if (tex) {
        gl.deleteTexture(tex);
        this.cache.delete(evicted);
      }
    }

    return texture;
  }

  dispose(gl: WebGL2RenderingContext) {
    for (const tex of this.cache.values()) {
      gl.deleteTexture(tex);
    }
    this.cache.clear();
    this.order = [];
  }
}
```

### 12.3 智能降级策略

| 条件 | 降级动作 | 检测方式 |
|---|---|---|
| WebGL 不可用 | CPU 回退管线（简化版） | PixiJS 初始化失败捕获 |
| FPS < 30 | 降采样预览到 1080p | `requestAnimationFrame` 计时 |
| 3D Texture 不支持 | 跳过 LUT 层，使用 v1 色彩近似 | `gl.getParameter(gl.MAX_3D_TEXTURE_SIZE)` |
| 内存 > 400MB | 释放非活跃 LUT 缓存 | `performance.memory`（Chrome only）或启发式 |
| 移动端 | 默认降采样 + 关闭 Halation/Bloom | `navigator.userAgent` + screen size |

---

## 十三、风险评估与应对

| 风险 | 概率 | 影响 | 应对策略 |
|---|---|---|---|
| OKLab 色域溢出（负值 RGB） | 高 | 低 | `clamp(0, 1)` + 在 OKLab 空间限制色度半径 |
| HaldCLUT 格式不统一 | 中 | 中 | 加载时校验尺寸 + 提供格式转换脚本 |
| v1→v2 迁移数据丢失 | 低 | 高 | 保留 v1 管线作为回退，双轨运行至少 1 个版本周期 |
| 移动端 WebGL2 性能不足 | 高 | 中 | 智能降级 + 降采样预览 |
| 色彩空间转换精度 | 中 | 中 | 使用 culori 作为参考实现做自动化色差校验 |
| PixiJS Filter 兼容性 | 低 | 高 | 检测 `PIXI.utils.isWebGLSupported()`，失败时回退 CPU 管线 |
| Shader Code Generator 维护成本 | 中 | 中 | 保持模板简洁，每个模板 < 30 行；Generator 本身 < 300 行 |

---

## 十四、开发规范

### 14.1 GLSL 编码规范

- 所有色彩计算在线性空间进行，仅在输入/输出时做 sRGB 转换
- Uniform 命名：`u_` 前缀 + camelCase（如 `u_exposure`、`u_lutIntensity`）
- 函数命名：`applyXxx`（变换）、`rgb2xxx` / `xxx2rgb`（色彩空间转换）
- 每个 shader 文件顶部注明输入/输出格式和色彩空间
- 可开关的功能用 `uniform bool u_xxxEnabled` + early return

### 14.2 TypeScript 编码规范

- 渲染器代码放在 `src/lib/renderer/`，不依赖 React
- Filter 类继承 `PIXI.Filter`，通过 `updateUniforms()` 方法接收参数
- Uniforms 通过纯函数从 `EditingAdjustments` / `FilmProfileV2` 解析
- 3D Texture 等 PixiJS 未封装的 GL 操作，通过 `renderer.gl` 直接访问原生 WebGL context
- 所有 GPU 资源在 `dispose()` / `destroy()` 中释放
- Shader Code Generator 放在 `scripts/`，通过 `pnpm generate:shaders` 执行

### 14.3 测试策略

| 类型 | 工具 | 覆盖范围 |
|---|---|---|
| 色彩转换单元测试 | Vitest | OKLab / LMS / sRGB↔Linear 精度 |
| HaldCLUT 解析测试 | Vitest | 恒等 LUT 验证（input == output） |
| v1→v2 迁移测试 | Vitest | 所有 8 个内置 profile 迁移正确 |
| 视觉回归测试 | 脚本 + 截图对比 | 标准色卡渲染后 ΔE < 2 |
| 性能基准测试 | 脚本 | 2K/4K 图像 FPS 和内存 |

---

## 十五、批量导出与 fflate 集成

### 15.1 导出流程

```
用户选择多张图片 → 逐张渲染（PixiJS）→ toBlob() → fflate ZIP 打包 → 下载
```

### 15.2 ZIP 导出实现

```typescript
// src/lib/export/zipExporter.ts

import { zipSync, strToU8 } from "fflate";

interface ExportItem {
  filename: string;
  data: Uint8Array;
}

/**
 * 将多个渲染结果打包为 ZIP 文件。
 * 使用 fflate 同步压缩（< 100ms for 10 images）。
 */
export function createExportZip(items: ExportItem[]): Blob {
  const files: Record<string, Uint8Array> = {};
  for (const item of items) {
    files[item.filename] = item.data;
  }

  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped], { type: "application/zip" });
}

/**
 * 批量导出：渲染 + 打包 + 下载。
 * 配合 Web Worker 避免阻塞 UI。
 */
export async function batchExport(
  assets: Array<{ id: string; name: string; blob: Blob }>,
  renderFn: (asset: { id: string; blob: Blob }) => Promise<Blob>,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const items: ExportItem[] = [];

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const rendered = await renderFn(asset);
    const buffer = new Uint8Array(await rendered.arrayBuffer());
    items.push({
      filename: asset.name.replace(/\.[^.]+$/, ".jpg"),
      data: buffer,
    });
    onProgress?.(i + 1, assets.length);
  }

  const zipBlob = createExportZip(items);
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `filmlab-export-${Date.now()}.zip`;
  link.click();
  URL.revokeObjectURL(url);
}
```

---

## 十六、推荐胶片预设清单

### Phase 1（3 款 MVP）

| 胶片 | 类型 | 特点 | LUT 来源 |
|---|---|---|---|
| Kodak Portra 400 | 负片 | 温暖肤色、柔和对比 | RawTherapee CLUT |
| Fuji Velvia 50 | 正片 | 鲜艳色彩、高饱和 | RawTherapee CLUT |
| Ilford HP5+ | 黑白 | 经典颗粒、中等对比 | RawTherapee CLUT (desaturate) |

### Phase 2（+7 款）

| 胶片 | 类型 | 特点 |
|---|---|---|
| Kodak Ektar 100 | 负片 | 鲜艳色彩、细颗粒 |
| Fuji Provia 100F | 正片 | 自然色彩、准确还原 |
| Kodak Tri-X 400 | 黑白 | 新闻摄影经典 |
| Fuji Superia 400 | 负片 | 冷调、日系色彩 |
| Kodak Gold 200 | 负片 | 暖调、怀旧感 |
| Fuji Acros 100 | 黑白 | 超细颗粒、高锐度 |
| Polaroid 600 | 即时 | 复古褪色、绿色调 |

---

## 十七、参考资源

| 资源 | 链接 |
|---|---|
| PixiJS v7 文档 | https://pixijs.com/ |
| PixiJS Filter 指南 | https://pixijs.io/guides/components/filters.html |
| OKLab 色彩空间 | https://bottosson.github.io/posts/oklab/ |
| HaldCLUT 格式说明 | https://www.quelsolaar.com/technology/clut.html |
| RawTherapee CLUT 集合 | https://github.com/Beep6581/RawTherapee |
| culori 色彩库 | https://culorijs.org/ |
| fflate 压缩库 | https://github.com/101arrowz/fflate |
| WebGL2 3D Texture | https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/texImage3D |
| CAT02 色适应 | https://en.wikipedia.org/wiki/CIECAM02 |

---

## 十八、一句话总结

> **采用 PixiJS v7 + Compile-Time 分层生成架构，构建时根据配置生成优化 GLSL，运行时通过 PixiJS FilterSystem 管理 Master + Film 双 Pass 管线。Master Pass 用 OKLab + LMS 实现科学色彩调整，Film Pass 用 3D LUT + 特性曲线 + 渐进式六层模型实现胶片模拟。保持 v1 数据兼容，通过适配层实现平滑过渡，配合 fflate 实现高效批量导出。分 3 个 Phase 在约 6 周内完成从 MVP 到完整模型的迭代。**
