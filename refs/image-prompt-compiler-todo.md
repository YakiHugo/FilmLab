# Image Prompt Compiler Historical Notes

记录日期：`2026-04-02`

- `image.edit` 与 `image.variation` 仍然是语义操作。
- 当前运行时接受这两个语义操作，但仍可能通过统一的 generate 路径执行。
- 旧的 `assetRefs` / `referenceImages` 过渡语义已经让位给 `operation + inputAssets`。
- 当前相关模块：
  - `shared/imageGeneration.ts`
  - `shared/imageGenerationSchema.ts`
  - `src/pages/image-lab.tsx`
