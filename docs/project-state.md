# Project State

更新日期：`2026-04-02`

这份文档以当前仓库实现为唯一事实来源。代码与文档冲突时，以代码为准。

## Product Surface

- `/` 与 `/canvas` 都进入画布工作台；`src/pages/studio.tsx` 只是 `CanvasPage` 的别名入口。
- `/library` 是资产库。
- `/assist` 是 image-lab，会话与图片生成入口。

## Canonical Boundaries

### Canvas

- 页面装配在 `src/pages/canvas.tsx`，直接组合路由同步、交互、runtime provider 和导出弹窗。
- 当前规范术语是 `loadedWorkbench*`，不是 `activeWorkbench*`。
- 活跃的画布 seam 是：
  - `useCanvasLoadedWorkbenchState`
  - `useCanvasLoadedWorkbenchCommands`
  - `useCanvasLoadedWorkbenchStructure`
  - `useCanvasHistory`
- 当前仍是单个 loaded workbench 会话模型，并保留切换前文本自动提交的 guard。

### Assets

- `assetId` 是唯一规范资产标识。
- 服务端资产入口在 `server/src/routes/assets.ts` 与 `server/src/assets/*`。
- 客户端通过 `src/lib/assetSyncApi.ts` 调用 `/api/assets/*`。
- 运行时已经没有 `remoteAssetId` 这套客户端主模型。

### Image Lab

- 请求模型是 `operation + inputAssets`。
- `image.edit` 与 `image.variation` 是语义操作，但当前运行时仍走统一的生成链路，没有独立 `/api/image-edit` 或 `/api/image-variation`。
- 会话状态以服务端 conversation view 为准；浏览器 session store 已移除。

### Render

- 规范的单图渲染内核在 `src/render/image/*`。
- 画布级预览与导出组合在 `src/features/canvas/*`。
- 当前仓库没有活跃的 `src/features/editor/*` 实现树；提到这棵树的文档都是历史归档。

## Validation Snapshot

以下状态在 `2026-04-02` 重新核对过：

- `pnpm lint`
  - 通过
- `pnpm --filter server typecheck`
  - 通过
- `pnpm exec tsc -p tsconfig.app.json --noEmit`
  - 失败
  - 当前首个报错点：
    - `src/features/canvas/document/model.ts(144)`
    - `src/render/image/types.ts(379)`
- `pnpm build`
  - 失败
  - 原因与上面的 app `tsc` 一致
- `pnpm test`
  - 失败
  - 当前失败用例：
    - `src/features/canvas/document/commands.test.ts > preserves unresolved legacy image nodes instead of fabricating generic render state`
