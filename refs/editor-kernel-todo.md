# Editor Historical Notes

记录日期：`2026-04-02`

- 项目没有继续维护独立的 `src/features/editor/*` 渲染树。
- 单图渲染内核收口到了 `src/render/image/*`。
- scene/global 与 media-native render 后续任务已关闭，相关决策见 `docs/decisions.md`。
- 当前相关模块：
  - `src/render/image/*`
