# Provider Capability Registry 前端联调 TODO

> 状态：**前端设计完成，等待后端接口先行落地后再联调**。

## 0. 依赖顺序（必须遵循）

1. **后端先行**：完成 Provider Capability Registry 的查询接口、错误码、健康度计算逻辑并稳定返回字段。
2. **前端接入**：在 `src/features/image-lab` 中按下述对接点接入接口与状态管理。
3. **联调验证**：基于真实后端响应联调 UI 与错误提示文案，覆盖正常/降级/不可用路径。
4. **回归测试**：补充或更新相关单测（hooks / panel）并验证不会破坏现有出图流程。

---

## 1. 需要新增的前端查询接口

> 建议统一放在 `src/features/image-lab` 下的 API 层（例如 `api/providerCapability.ts`），并通过 hooks 暴露给组件。

### 1.1 能力事实（Capability Facts）查询

- **用途**：根据 provider + model 拉取可用能力事实（是否支持文生图、图生图、最大尺寸、风格参数支持等）。
- **建议请求**：
  - `GET /api/providers/{providerId}/models/{modelId}/capability-facts`
- **建议响应字段**：
  - `providerId`, `modelId`, `version`
  - `supportsTextToImage`, `supportsImageToImage`
  - `maxResolution`, `allowedAspectRatios`
  - `supportedStyles`, `supportedOutputFormats`
  - `updatedAt`

### 1.2 兼容性（Compatibility）查询

- **用途**：在用户选择参数时判断当前模型与参数组合是否兼容，提供可执行建议。
- **建议请求**：
  - `POST /api/providers/{providerId}/models/{modelId}/compatibility-check`
- **建议请求体**：
  - `prompt`, `size`, `style`, `outputFormat`, `referenceImageEnabled` 等当前面板参数。
- **建议响应字段**：
  - `compatible: boolean`
  - `issues: Array<{ code: string; field?: string; message?: string }>`
  - `fallbacks: Array<{ field: string; suggestedValue: string; reasonCode: string }>`

### 1.3 健康度（Health）查询

- **用途**：显示 provider/model 健康状态（可用、降级、不可用），用于用户决策与错误前置提示。
- **建议请求**：
  - `GET /api/providers/{providerId}/models/{modelId}/health`
- **建议响应字段**：
  - `status: 'healthy' | 'degraded' | 'down'`
  - `latencyP95Ms`, `errorRate`, `windowMinutes`
  - `lastIncidentAt`, `message`

---

## 2. UI 入口建议

### 2.1 模型选择器（Model Selector）

- 在模型列表项追加能力标签与健康状态点（例如：`文生图` / `图生图` / `降级`）。
- 切换模型时触发：
  1. capability facts 拉取
  2. health 拉取
  3. 根据返回结果刷新参数面板可编辑状态

### 2.2 参数面板（Parameter Panel）

- 在参数变更（尺寸/风格/输出格式）时做 compatibility check（可做 debounce）。
- 不兼容参数使用 inline 提示，并提供“一键应用推荐配置（fallback）”按钮。
- 对不支持的选项直接置灰并附带 tooltip 原因。

### 2.3 错误提示（Error Messaging）

- 优先显示后端 `errorCode` 对应的人类可读文案（见第 4 节映射）。
- 文案分层：
  - 顶层 toast：请求失败/服务不可用
  - 字段级错误：参数不兼容
  - 空态说明：当前模型暂不支持该能力

### 2.4 健康状态徽标（Health Badge）

- 在 provider/model 名称旁展示徽标：
  - `healthy` → 绿色“可用”
  - `degraded` → 黄色“降级”
  - `down` → 红色“不可用”
- `degraded/down` 状态下默认展开提示详情（`message` + 最近事件时间）。

---

## 3. 与 `src/features/image-lab` 的对接点

### 3.1 `ImageGenerationPanel`

- 接入 capability facts + compatibility check 结果，驱动：
  - 生成按钮禁用条件
  - 参数项可编辑/只读状态
  - fallback 建议展示
- 在提交生成前做一次最终 compatibility check，避免后端可预判错误。

### 3.2 `ProviderApiKeyPanel`

- API Key 校验成功后，触发 provider 级别健康度预取（默认模型或最近使用模型）。
- 在 key 无效与 provider 健康异常时，使用不同错误文案，避免用户误以为仅是 key 问题。

### 3.3 Hooks 建议

- 新增：
  - `useProviderCapabilityFacts(providerId, modelId)`
  - `useModelCompatibility(providerId, modelId, config)`
  - `useProviderModelHealth(providerId, modelId)`
- 将三类查询结果在 `useImageGeneration` 或独立状态层中聚合，减少组件内重复请求逻辑。

---

## 4. 错误码到文案映射（对应后端 `errorCode`）

> 以后端最终错误码为准；前端先建立可扩展映射表，未知错误码回退通用提示。

| errorCode | 前端文案（建议） | 展示层级 | 处理建议 |
| --- | --- | --- | --- |
| `PROVIDER_UNAVAILABLE` | 当前服务暂时不可用，请稍后重试或切换其他模型。 | Toast + Health Badge | 引导切换模型 |
| `MODEL_DEGRADED` | 当前模型处于降级状态，生成速度或成功率可能受影响。 | Inline + Health Badge | 允许继续，给出风险提示 |
| `CAPABILITY_UNSUPPORTED` | 所选模型暂不支持该能力，请调整参数或切换模型。 | 字段级错误 | 高亮不支持字段 |
| `PARAM_INVALID_COMBINATION` | 当前参数组合不兼容，已为你提供推荐配置。 | 字段级错误 | 提供一键应用 fallback |
| `REFERENCE_IMAGE_NOT_SUPPORTED` | 当前模型不支持参考图，请关闭参考图后重试。 | 字段级错误 | 自动建议关闭 reference image |
| `RATE_LIMITED` | 请求过于频繁，请稍后再试。 | Toast | 增加重试间隔提示 |
| `API_KEY_INVALID` | API Key 无效或已过期，请更新后重试。 | Panel 错误区 | 引导前往 `ProviderApiKeyPanel` |
| `UPSTREAM_TIMEOUT` | 上游响应超时，请稍后重试。 | Toast | 提供重试按钮 |
| `UNKNOWN_ERROR` | 发生未知错误，请稍后重试。 | Toast | 保留 errorId 便于排查 |

---

## 5. 实施备注

- 前端在后端接口完成前可先：
  - 落地类型定义（TypeScript interfaces）
  - 落地错误码映射表
  - 预埋 UI 占位与 loading/skeleton
- **但联调与默认启用必须等待“后端先行完成后再联调”条件满足。**
