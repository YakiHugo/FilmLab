# FilmLab

面向摄影后期的 AI 胶片感工作流 Demo（本地优先、批量处理 + 单张精修）。

## 当前状态
- 已完成 Vite + React + TypeScript 前端原型与基础路由
- Library：JPG/PNG 导入、筛选、分页、选择集
- Batch Studio：按分组/选择应用 preset 与强度（AI 推荐为占位）
- Editor：基础调整项预览（CSS filter）、原图对比、复制/粘贴设置
- Export：原图导出占位（未接入离屏渲染）
- 本地持久化：IndexedDB 保存项目与素材

> 部分页面中文文案存在编码乱码，待统一 UTF-8 清理。

## 技术栈
- Vite + React 18 + TypeScript
- Tailwind CSS + Radix UI（shadcn/ui 风格组件）
- Zustand（状态管理）
- TanStack Router / Query
- IndexedDB（idb）

## 目录结构
- src/components/：通用组件与 UI
- src/pages/：Landing / Library / Batch Studio / Editor / Export
- src/stores/：Zustand 状态
- src/lib/：数据与工具（IndexedDB、adjustments）
- src/data/：内置 presets
- src/types/：类型定义
- public/：静态资源

## 开发
- `pnpm install`
- `pnpm dev`
- `pnpm build`
- `pnpm preview`

## 文档
- `docs/prd.md`：当前产品范围摘要
- `docs/mvp_plan.md`：MVP 里程碑与进度
- `docs/tech_stack_architecture.md`：技术栈与架构说明

## 下一步建议
- 统一文案编码为 UTF-8（修复乱码）
- 接入真实图像处理管线（Canvas/WebGL）
- 完善 AI 分析/推荐逻辑（现为占位）
- 导出队列与离屏渲染
