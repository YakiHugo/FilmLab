# Historical Decisions

记录日期：`2026-04-02`

## Canvas

- 画布从更宽的 `activeWorkbench` 门面逐步收口到更窄的 `loadedWorkbench` 状态、命令、结构和历史 seam。
- 当前的 route-first workbench 激活与文本预提交 guard 不是偶然实现，而是为了解掉切换 workbench 时的文本会话竞争问题。
- history 从 `past/future` 双栈改成了 `entries + cursor` 的 delta 模型，这是刻意的结构收敛，不是局部实现细节。

## Assets And Image Lab

- 资产系统曾经经历过 `remoteAssetId/threadAssetId` 过渡期，最终统一到了规范 `assetId`。
- 资产接口迁到 Fastify 服务端之后，浏览器可读图像 URL 也收口到 `/api/assets/:assetId/:kind` 这一层，而不是直接暴露存储层地址。
- image-lab 现在把服务端 conversation view 当成耐久边界；浏览器 session 持久化被明确退休。
- `image.edit` 与 `image.variation` 被保留为语义操作，即便某些模型最终会降级成 generate-only 执行。

## Render

- 项目没有继续维持一套单独的 `src/features/editor/*` 渲染架构，而是把那条线退休，保留 `src/render/image/*` 作为单图内核。
- scene/global render 工作被故意拆成后续任务，而不是继续往单图 cutover 任务里塞。
