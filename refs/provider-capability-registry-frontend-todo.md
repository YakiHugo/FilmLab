# Provider Capability Registry 前端 TODO

> 状态：已按 `catalog -> config sanitize -> generate` 主链路完成一版接入。本文档只保留基于当前实现仍然缺失的前端能力，不再沿用早期“单独 capability facts / health / BYOK 接口”的假设。

## 0. 当前已完成

- catalog 已经是前端唯一事实入口：
  - `src/lib/ai/imageModelCatalog.ts`
  - `src/features/image-lab/hooks/useGenerationConfig.ts`
- model capability facts 已经通过 catalog 下发到前端：
  - `constraints`
  - `parameterDefinitions`
  - `defaults`
  - `supportsUpscale`
  - `defaultProvider`
  - `health`
- 本地参数收敛已完成：
  - `sanitizeGenerationConfigWithCatalog(...)`
  - `generationConfigStore`
- 参数面板已经按 catalog 驱动显示/隐藏：
  - unsupported common params
  - custom size 开关
  - reference image 能力
  - model-specific extra params
- ProviderApiKeyPanel 已经改成“服务端托管凭证”展示，不再是浏览器本地 BYOK。

## 1. 已过时的 TODO 假设

这些不应再作为前端必做项：

- 单独的 `capability facts` 查询接口和 `useProviderCapabilityFacts(...)`
  - 现在 catalog 已经承载这部分数据，继续拆一套接口会重复。
- 单独的 `health` 查询接口和 `useProviderModelHealth(...)`
  - 只要 catalog 继续返回 model health，前端优先直接消费 catalog。
- `ProviderApiKeyPanel` 的“用户录入/校验 API Key”流程
  - 现在是 server-managed credentials，不再是前端凭证输入面板。

保留为可选后续项：

- 如果未来 health 需要高频刷新，再单独拆 `health` 查询。
- 如果未来 compatibility 需要服务端给出 explainable issues/fallbacks，再补专门接口。

## 2. 当前真正还缺的前端能力

### 2.1 模型健康态还没有真正展示

问题：

- catalog 已经返回 `model.health`，但 UI 没有消费。
- 模型列表目前只透传了 `id/name/description/providerName`，丢掉了 `health`、`configured`、`modelFamily`、`supportsUpscale`。

现状入口：

- `src/pages/image-lab.tsx`
- `src/features/image-lab/ImagePromptInput.tsx`

需要补齐：

- 模型选择器显示：
  - `healthy / degraded / down / unknown`
  - provider configured 状态
  - 必要时显示 `modelFamily`
- 当前选中模型区域显示健康提示：
  - `degraded` 给 warning
  - `down` 给 blocking 提示

### 2.2 参数兼容性只有“静默裁剪”，没有解释型 UX

问题：

- 当前 `sanitizeGenerationConfigWithCatalog(...)` 会自动裁掉不支持参数。
- 但用户看不到“为什么被裁”“哪些参数不兼容”“推荐替代值是什么”。

现状入口：

- `src/lib/ai/imageModelCatalog.ts`
- `src/stores/generationConfigStore.ts`
- `src/features/image-lab/ImagePromptInput.tsx`

需要补齐：

- 字段级 incompatibility 提示
- tooltip 或说明文案：
  - 为什么某项不可用
  - 为什么某项被自动清空
- 若继续走纯前端 compatibility：
  - 在 sanitize 时产出 warnings/issues 供 UI 使用
- 若改成服务端 explainable compatibility：
  - 增加 `issues` / `fallbacks` 响应消费层

### 2.3 提交按钮还没有接 provider/model 状态 gating

问题：

- 当前 Generate 按钮只看：
  - prompt 是否为空
  - 是否正在生成
- 不看：
  - provider 是否缺凭证
  - model health 是否 `down`
  - 当前配置是否存在已知不兼容

现状入口：

- `src/features/image-lab/ImagePromptInput.tsx`

需要补齐：

- provider 未配置时禁用生成，并给出明确原因
- model `down` 时禁用生成
- model `degraded` 时允许生成，但给出 warning
- 若后续接入 explainable compatibility，则把 blocking issue 纳入禁用条件

### 2.4 结构化错误码映射还没打通

问题：

- 服务端当前只返回 `{ error }`
- 客户端当前只消费字符串 message
- TODO 里规划的 `errorCode -> 文案映射` 目前没有真实输入源

现状入口：

- `server/src/routes/image-generate.ts`
- `src/lib/ai/imageGeneration.ts`
- `src/features/image-lab/hooks/useImageGeneration.ts`

需要补齐：

- 服务端返回：
  - `errorCode`
  - 可选 `field`
  - 可选 `details`
- 前端建立错误映射表：
  - toast
  - inline field error
  - provider/model health 提示

### 2.5 `supportsUpscale` 已入 catalog，但 UI 仍未透传

问题：

- `supportsUpscale` 已经在 catalog/schema 中存在。
- 但历史流和结果卡片仍然把它硬编码为 `false`。

现状入口：

- `src/features/image-lab/ImageChatFeed.tsx`

需要补齐：

- 从 turn/model metadata 中拿到真实 `supportsUpscale`
- 结果卡片按模型能力决定是否显示 upscale 入口
- 在 capability 关闭时不要暴露死按钮或误导性文案

### 2.6 Provider/模型元数据在页面层被过度裁剪

问题：

- `ImageLabPage` 组装 `imageModels` 时只保留少量展示字段。
- 这会导致后续想加 health badge、capability tag、configured 提示时只能继续回查 catalog。

现状入口：

- `src/pages/image-lab.tsx`

需要补齐：

- 至少保留：
  - `health`
  - `configured`
  - `modelFamily`
  - `supportsUpscale`
  - `defaultProvider`

## 3. 建议优先级

### P0

- 模型/Provider 健康态展示
- Generate gating
- `supportsUpscale` 真实透传

### P1

- 结构化错误码映射
- 参数兼容性解释型 UX

### P2

- 如有必要，再拆独立 compatibility / health 查询接口

## 4. 具体改动入口

优先关注这些文件：

- `src/pages/image-lab.tsx`
- `src/features/image-lab/hooks/useGenerationConfig.ts`
- `src/features/image-lab/hooks/useImageGeneration.ts`
- `src/features/image-lab/ImagePromptInput.tsx`
- `src/features/image-lab/ImageChatFeed.tsx`
- `src/features/image-lab/ProviderApiKeyPanel.tsx`
- `src/lib/ai/imageGeneration.ts`
- `server/src/routes/image-generate.ts`

## 5. 验收标准

- 模型选择器可直接看到 provider configured + model health
- `down` 模型无法提交生成
- `degraded` 模型可提交但会提示风险
- unsupported 参数不再只是静默消失，用户能知道原因
- `supportsUpscale` 能从 catalog 真实传到结果卡片
- 生成失败时前端不再只显示裸 `error.message`，而是按错误类型给出对应文案
