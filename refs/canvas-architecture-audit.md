# Canvas Historical Notes

记录日期：`2026-04-02`

- 长期风险仍然集中在：
  - 预览与导出边界没有完全统一
  - `CanvasViewport` 是复杂度热点
- 页面装配和 workbench seam 已经收口到当前的 `loadedWorkbench*` 与直接页面组合模式。
- 当前相关模块：
  - `src/pages/canvas.tsx`
  - `src/features/canvas/hooks/useCanvasLoadedWorkbenchState.ts`
  - `docs/tasks/canvas-preview-performance-followup.md`
