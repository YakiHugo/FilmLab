# FilmLab MVP 实现计划

基于 PRD 与技术架构文档，以下计划以「最小可交付闭环」为目标，优先覆盖导入 → 预览与基础编辑 → 批处理 → 单张精修 → 导出与持久化，AI 体检与推荐延后至后续版本。规划按里程碑拆分，并包含关键产出、接口边界、验收标准与风险预案。

## 1. MVP 范围与关键原则
- **范围**：导入/项目缓存、非破坏式编辑引擎、胶片 preset 系统（占位资源）、批处理预览面板、单张编辑器、导出队列（仅 JPG/PNG）。【F:prd.md†L106-L112】【F:prd.md†L260-L274】
- **技术基础**：React + TypeScript + Zustand + WebGL/Canvas + Worker + IndexedDB。【F:tech_stack_architecture.md†L4-L23】【F:tech_stack_architecture.md†L35-L69】
- **策略**：本地优先、可回退、性能优先（预览/导出分离），AI 体检/推荐先预留接口。 【F:prd.md†L229-L251】【F:tech_stack_architecture.md†L70-L89】

## 2. 里程碑拆解（M0-M4）

### M0 — 项目基建与数据模型（1 周）
**目标**：建立端到端数据流骨架与存储方案，为后续模块并行开发提供接口。

**产出**
- Vite + React + TS 基础脚手架与 Tailwind/shadcn/ui 引入。
- Zustand store 结构：Project/Assets/EditStack/Recommendations/ExportQueue。
- IndexedDB schema：项目、资源、缩略图、编辑参数、preset、自定义快照。
- 基础路由与页面壳：Landing / Library / Batch Studio / Editor / Export。

**关键接口**
- `ProjectStore`: `{ id, name, assets[], createdAt, updatedAt }`
- `Asset`: `{ id, fileRef, metadata, thumbnails, analysis, edits }`
- `EditStack`: `{ assetId, stack[], history[], snapshots[] }`
- `Preset`: `{ id, name, tags[], params, riskRules, explainTemplate }`

**验收标准**
- 页面可切换；IndexedDB 可写入/读取项目与空资产。
- Zustand store 能持久化并在刷新后恢复项目。

---

### M1 — 导入与资产管理（1–1.5 周）
**目标**：完成导入 → 缩略图生成 → EXIF/元信息读取 → 持久化，满足 100 张不卡死。

**产出**
- 拖拽/多选导入（JPG/PNG），文件校验与错误提示。
- Worker 生成缩略图（可逐步渲染）。
- EXIF/基础元信息读取（尺寸/文件名/拍摄时间）。
- Library 页面：虚拟列表 + 缩略图加载。
- 开发期素材：使用公开图片集并记录来源清单。

**验收标准**
- 100 张照片导入不卡死，缩略图分批生成。
- 刷新页面后，项目与缩略图可恢复。

---

### M2 — 非破坏式编辑引擎 + Preset 系统（1.5–2 周）
**目标**：建立参数化滤镜栈（LUT/曲线/颗粒/暗角）并支持撤销/快照。

**产出**
- WebGL/Canvas 预览管线：LUT、曲线、颗粒、暗角强度统一控制。
- 编辑栈序列化：`stack[]` + `history[]` + `snapshots[]`。
- Before/After 与分屏对比。
- Preset 系统：≥12 个 preset（4 类）占位资源，支持一键套用与强度调整。

**验收标准**
- 操作可撤销/重做，撤销后导出一致。
- 强度滑杆实时反馈，无明显卡顿。

---

### M3 — 批处理面板（1–1.5 周）
**目标**：完成批处理工作流与组内应用逻辑，确保 50 张图可快速初修（无 AI 体检与推荐）。

**产出**
- Batch Studio：组内应用/替换/统一强度；一致性优先/最适配优先模式（先基于手动分组或简单规则）。
- 预留 AI 推荐入口（UI 占位 + 数据结构），但不做体检与规则引擎。

**验收标准**
- 50 张图 1 分钟内完成批处理初步出片。

---

### M4 — 导出与稳定性（1 周）
**目标**：导出队列化、可取消、失败可重试，确保与预览一致。

**产出**
- 导出面板：格式仅 JPG/PNG，尺寸/质量/EXIF 选项。
- OffscreenCanvas + Worker 导出队列，支持取消与失败重试。
- 统一错误处理与兜底提示。

**验收标准**
- 导出结果与预览一致；失败不会阻塞其他任务。
- 崩溃后可恢复最近项目与编辑参数。

## 3. 并行开发建议（角色分工）
- **A（基础设施）**：M0/M1 的 IndexedDB、资产管理、导入与缩略图。
- **B（渲染与编辑）**：M2 的编辑管线、滤镜栈、预览与撤销。
- **C（批处理与扩展）**：M3 的批处理逻辑与分组策略，AI 入口占位。
- **D（体验与导出）**：M4 的导出队列、错误兜底、交互打磨。

## 4. 关键数据与流程定义（MVP 必备）

### 4.1 体检结果结构（后续版本预留）
```
analysis: {
  exposure: { histogram[], highlightClipPct, shadowClipPct },
  colorCast: { temperature: "warm|cool|neutral", strength },
  sharpness: { level: "good|soft|blurry", score },
  noise: { level: "low|mid|high", score },
  repairability: { score, breakdown: { dynamicRange, color, quality, subjectSep } }
}
```

### 4.2 推荐输出结构（后续版本预留）
```
recommendation: {
  group: "outdoor_day|indoor_warm|night|sunset|overcast",
  topPresets: [{ id, confidence, reasonTemplate, strengthSuggestion }],
  risks: [{ type, message }]
}
```

### 4.3 编辑栈结构
```
editStack: {
  filters: [
    { type: "lut", params },
    { type: "curves", params },
    { type: "grain", params },
    { type: "vignette", params }
  ],
  intensity: 0-100
}
```

## 5. MVP 交付清单（可直接用于作品集）
- 1 套完整闭环 Demo：导入 → 批处理 → 单张精修 → 导出。
- 12 个 preset（占位资源）+ 可扩展的 preset 结构。
- 批处理与编辑器核心 UI（AI 入口占位）。
- 关键性能策略说明：预览/导出分离、Worker 队列、IndexedDB 恢复。

## 6. 风险与降级策略
- **AI 功能延后**：以批处理与编辑闭环为主，保留推荐入口与数据结构。
- **大图性能压力**：预览用低分辨率纹理，导出全分辨率离屏。
- **素材获取不稳定**：使用公开图片集（注明来源），并在文档中记录素材清单。
