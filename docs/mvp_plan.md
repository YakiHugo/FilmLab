# FilmLab MVP 计划（当前进度）

状态标记：[x] 已完成 ｜ [~] 部分完成 ｜ [ ] 未开始

## M0 基建与导航

- [x] Vite + React + TypeScript 工程搭建
- [x] TanStack Router 路由接入
- [x] 基础页面骨架（Landing / Library / Batch / Editor / Export）

## M1 资产导入与持久化

- [x] JPG/PNG 导入（多选/拖拽）
- [x] IndexedDB 持久化项目与素材
- [~] 缩略图与 EXIF 解析（目前仅 objectUrl）

## M2 批量处理工作流

- [x] 选择集与分组逻辑
- [x] 按分组/选择应用 preset 与强度
- [~] AI 推荐与规则引擎（当前为占位）

## M3 单张编辑

- [x] 基础调整项 UI（亮度、对比度、饱和度等）
- [x] 原图对比、复制/粘贴调整
- [~] 真实图像处理管线（目前为 CSS filter 预览）

## M4 导出

- [~] 导出入口与任务列表（当前为原图下载占位）
- [ ] 离屏渲染与导出队列

## 后续可选里程碑

- [ ] AI 分析/推荐逻辑接入
- [ ] WebGL/Canvas 图像管线
- [ ] 导出质量/尺寸/格式配置
- [ ] 文案与编码清理（统一 UTF-8）
