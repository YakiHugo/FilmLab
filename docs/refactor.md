Refactor Review: 渲染管线重构实现问题清单

Context

refactor/all 分支实现了渲染管线的色彩空间统一（Master
始终输出 sRGB、Film 处理 sRGB 输入、HSL 升级 OKLab）以及大
量编辑器功能扩展（局部调整、透视校正、镜头校正、B&W
mix、校准、点曲线等）。整体实现质量较高，架构清晰，但存在
以下需要修复的问题。

---

P0: 必须修复

1.  彻底移除 legacyColorPipeline 及 u_outputSRGB

计划要求 Master 始终输出 sRGB 并移除
u_outputSRGB。手写模板已更新，但生成器和运行时仍保留了  
 legacy 回滚路径。需要彻底清理：

generate-shaders.ts:

- 移除 uniform bool u_outputSRGB 声明 (line 244)
- 移除 Step 10 的 if (u_outputSRGB) 条件分支 (lines  
  457-459)，改为无条件 color = linear2srgb(color)

MasterAdjustmentFilter.ts:

- 移除 u_outputSRGB: true uniform 默认值 (line 37)
- 移除 updateUniforms 中 options?.outputSRGB 逻辑 (line

77.

- 移除 outputSRGB option 类型定义

PixiRenderer.ts:

- 移除 legacyColorPipeline 字段 (line 80) 和初始化 (line

116.

- 移除 outputSRGB 传参 (line 329-331)，updateUniforms 只传
  masterUniforms
- 移除传给 FilmSimulationFilter 的 legacyColorPipeline  
  option (line 124)

FilmSimulationFilter.ts:

- 移除 legacyColorPipeline option 和
  FilmSimulationFilterOptions 接口
- 移除 legacyFragmentSrc import (line 10)
- 始终使用 modernFragmentSrc (line 55)

config.ts:

- 从 RenderFeatures 接口移除 legacyColorPipeline (line 9)
- 从默认值移除 (line 41)
- 从 getRendererRuntimeConfig 移除读取逻辑 (lines 142-144)

config.test.ts:

- 移除 legacyColorPipeline 相关测试断言 (lines 55, 71)

删除文件:

- src/lib/renderer/shaders/FilmSimulation.frag — 旧版 Film
  shader，不再需要

文档更新:

- docs/editor.md:203 — 移除 legacyColorPipeline rollback  
  switch 描述
- docs/film_pipeline.md:63 — 移除 legacy rollback 说明

2.  EditorAdjustmentPanel.tsx 中文字符串 mojibake

src/features/editor/EditorAdjustmentPanel.tsx:62-107 的  
 FILM_MODULE_LABELS 和 FILM_PARAM_DEFINITIONS
中所有中文标签都是乱码（如 鑹插僵绉戝 应为
色彩科学）。虽然是已知问题，但这些字符串直接渲染到
UI，用户会看到乱码。

建议：修复为正确的 UTF-8 中文字符串。

文件: src/features/editor/EditorAdjustmentPanel.tsx

---

P1: 应该修复

3.  normalizeLocalDeltaValue 冗余分支

src/lib/adjustments.ts:179-182:

if (key === "sharpening" || key === "noiseReduction" ||  
 key === "colorNoiseReduction") {
return clampValue(value, -100, 100); // 与 default  
 完全相同
}
return clampValue(value, -100, 100);

两个分支返回相同结果。推测原意是 sharpening/NR 类参数应为  
 [0, 100]（非负），但实际写成了 [-100, 100]。

建议：确认局部调整的 sharpening/NR
是否允许负值。如果不允许，改为 clampValue(value, 0,  
 100)；如果允许，删除冗余 if 分支。

文件: src/lib/adjustments.ts

4.  Film v1 resolver u_toneEnabled 设为 true 但参数为  
    identity

src/lib/renderer/uniformResolvers.ts 中
resolveFilmUniforms 对 v1 profile 设置 u_toneEnabled =  
 toneAmount > 0，但 shoulder/toe/gamma 都是 identity 值  
 (0/0/1.0)。当 toneAmount > 0 时 tone response pass
会执行但不产生任何效果。

建议：对 v1 profile 设置 u_toneEnabled = false，跳过无效的
tone response 计算。

文件: src/lib/renderer/uniformResolvers.ts

5.  HSL shader weightSum 变量名遮蔽

src/lib/renderer/shaders/HSL.frag 中 B&W mix 块（约 line  
 188）声明了 float weightSum，遮蔽了外层 HSL
调整循环中的同名变量（约 line 118）。GLSL
作用域处理正确所以不是 bug，但容易在维护时引起混淆。

建议：将 B&W mix 块中的变量重命名为 bwWeightSum。

文件: src/lib/renderer/shaders/HSL.frag

---

P2: 可选改进

6.  OKLab 编辑后无 gamut mapping

HSL shader 在 OKLab 空间编辑后直接 oklab2rgb + max(...,  
 0.0) + 最终 clamp。极端饱和度编辑可能产生超出 sRGB gamut  
 的值，仅靠 clamp 会导致微妙的色相偏移。

建议：可在 oklab2rgb 后添加简单的 soft-clip 或 chroma  
 reduction gamut
mapping。非阻塞，当前行为与大多数照片编辑器一致。

7.  Detail shader 纹理采样开销

Detail pass 每像素 38 次纹理采样（5x5 bilateral 25 + cross
blur 5 + ring blur 8）。桌面端可接受，低端移动 GPU  
 可能成为瓶颈。

建议：可考虑在移动端降低 bilateral kernel 到 3x3（9  
 次采样）。非阻塞。

8.  sampleRingBlur 仅 4 对角采样

Detail shader 的 medium/coarse ring blur 仅采样 4
个对角方向，是高斯模糊的粗略近似。对于 high-pass 提取用途  
 可接受，但在强对角纹理内容上可能产生轻微方向性伪影。

建议：可增加到 8 采样（加入上下左右）。非阻塞。

---

修复顺序

1.  P0 #1: 彻底移除 legacyColorPipeline +
    u_outputSRGB（已确认移除）
2.  P0 #2: 修复 mojibake
3.  P1 #3-5
4.  P2 按需处理

验证

- pnpm generate:shaders 编译通过
- pnpm vitest 测试通过（特别是 editorPanelConfig.test.ts,  
  config.test.ts, renderProfile.test.ts）
- 浏览器中验证：Master -> HSL -> Curve -> Detail -> Film  
  -> Halation 全链路色彩正确
- 验证 Film module override 面板中文标签显示正常
- 验证局部调整 sharpening/NR 滑块范围符合预期
