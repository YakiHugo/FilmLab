# FilmLab 技术栈与架构（当前实现）

## 1. 技术栈
- 构建与框架：Vite + React 18 + TypeScript
- UI：Tailwind CSS + Radix UI（shadcn/ui 风格组件）
- 状态管理：Zustand
- 路由与数据：TanStack Router / Query
- 本地存储：IndexedDB（idb）

## 2. 目录与模块
- `src/pages/`：Landing / Library / Batch Studio / Editor / Export
- `src/components/`：UI 组件与页面结构组件
- `src/stores/`：`projectStore` 管理项目与素材
- `src/lib/`：`db`（IndexedDB）、`adjustments`（默认调色参数）
- `src/data/`：`presets`（预设数据）
- `src/types/`：核心类型

## 3. 数据模型（核心）
- Project：`id / name / createdAt / updatedAt`
- Asset：`id / name / type / size / createdAt / blob / objectUrl / thumbnailBlob / metadata / presetId / intensity / group / adjustments`
- EditingAdjustments：亮度、对比度、饱和度、色温、暗角、颗粒等基础参数
- Preset：`id / name / intensity / adjustments`

## 4. 数据流（当前）
1. 导入素材 → IndexedDB 持久化 → 生成 objectUrl 展示
2. Library 选择集/分组 → Batch Studio 应用 preset 与强度
3. Editor 修改调整项 → Zustand 更新 → Canvas 渲染预览（叠加预设）
4. Export 点击导出 → Canvas 渲染导出（格式/质量/尺寸配置）

## 5. 已实现能力与占位能力
- 已实现：基础页面、导入/选择/分组、预设应用、缩略图/EXIF、Canvas 预览与导出、本地持久化
- 占位：AI 推荐、离屏渲染导出

## 6. 未来扩展建议
- 引入 Canvas/WebGL 管线用于高质量预览与导出
- Worker + OffscreenCanvas 处理缩略图与导出队列
- AI 分析与推荐策略（规则引擎或模型）
