# Canvas 模块架构审计

日期: 2026-03-23
范围: `src/pages/canvas.tsx`、`src/stores/canvasStore.ts`、`src/stores/canvasRuntimeStore.ts`、`src/features/canvas/*`
评价口径: 是否适合后续迭代，不评价 UI 完成度

## 状态更新

- 状态: `canvasStore` 第一阶段 seam 拆分已落地；`CanvasViewport` 第二刀 seam 拆分也已落地，已从“stage shell + viewport navigation hook + marquee selection hook + text/overlay host”继续收缩为“composition shell + stage shell + tool/input orchestrator + overlay host + lifecycle/navigation seam”；panel 第一刀 seam 收口也已落地，已从“panel 直接决定领域更新”收缩为“panel view + model hook + pure planner/state seam”。
- 总评: `7.8/10`
- 当前最强的一层: 文档内核
- 当前最弱的两层: runtime preview / 文本会话、页面与路由装配
- 当前最明显的结构热点: 页面入口仍带一部分恢复策略、`useCanvasTextSession` 仍承担跨 workbench 迁移与持久化/回滚、`canvasRuntimeStore` 仍直接依赖全局 store 取数
- 验证基线: `pnpm test` 通过，相关回归共 `113` 个测试文件、`456` 个 case 全部通过；`pnpm lint` 通过，但保留 `5` 个既有 warning；`pnpm build:client` 通过；本轮额外做了 architecture + bug/regression 两轮 review，均无新增阻断问题
- 下一阶段优先级:
  1. 处理页面入口 / 文本会话 / runtime preview 的应用层边界
  2. 再继续收紧 `canvasStore` 的 active-workbench 门面，避免它重新长回万能入口
  3. 把 `CanvasExportDialog` / `CanvasImageEditPanel` 等剩余入口继续并入现有 seam，避免局部反弹

## 评分口径

每个子系统按 10 分制评分，默认权重如下:

- 职责清晰度 30%
- 边界与耦合 25%
- 状态/变更安全性 20%
- 可扩展性 15%
- 可测试性 10%

## 整体判断

当前画布模块不是失控状态，但已经明显出现“健康内核 + 失衡应用层”的结构分化。

- 健康部分主要集中在文档内核，也就是 `CanvasWorkbench` / `CanvasCommand` / snapshot / resolve / patch 这条链路。
- 失衡部分主要集中在应用层，也就是 `useCanvasStore`、`CanvasViewport`、若干 panel 组件。
- 这意味着后续如果继续加功能，风险不在底层模型被改坏，而在更多功能被继续塞进少数大文件，导致改动面越来越大、回归越来越难控。

我的判断是:

- 现在的架构还能继续迭代，但已经不适合“持续堆功能”。
- 如果不先做 seam 级别拆分，后面的复杂度会继续集中到 `canvasStore.ts`、`CanvasViewport.tsx` 和 panel 层。
- 文档内核应该保护，不应该跟着上层一起推倒重来。

## 1. 页面与路由装配

文件重点:

- `src/pages/canvas.tsx`

职责:

- 页面入口装配
- 初始化 canvas store
- 路由与 active workbench 对齐
- workbench 缺失时恢复或创建
- 维护导出弹窗和当前选中 slice
- 图片选中后自动切换 edit panel

输入/输出:

- 输入: router params、`useCanvasStore`、本地 UI state
- 输出: 传给 `CanvasViewport`、`CanvasFloatingPanel`、`CanvasExportDialog` 的 props

依赖方向:

- 页面依赖 store、router 和 canvas feature 组件
- 没有反向被底层领域层依赖

关键状态转换/不变量:

- `init()` 完成前不执行恢复逻辑
- 路由 workbench 不存在时必须恢复到有效 workbench 或创建新 workbench
- `activeWorkbenchId` 最终需要和路由一致
- 当前选中的 slice 必须始终落在有效 slice 集合内

优点:

- 恢复逻辑考虑得比较完整
- 对 epoch 失效有保护
- 页面仍然保持在单入口层，而不是把所有行为打散到更多地方

问题:

- 页面已经不只是装配层，开始承载 route recovery policy 和 panel policy
- `pendingRouteRecoveryRef`、`hasInitializedCanvas`、自动切 panel 这些逻辑说明入口层已经有一部分应用服务职责
- 后续如果再加 URL state、workspace mode、multi-tab 恢复，这里会继续膨胀

评分: `6/10`

重构优先级: `P2`

判断:

- 还没有坏到必须立刻拆，但已经超出“纯页面壳”的范围。

## 2. 文档内核

文件重点:

- `src/features/canvas/document/commands.ts`
- `src/features/canvas/document/resolve.ts`
- `src/features/canvas/document/model.ts`
- `src/features/canvas/document/patches.ts`
- `src/types/canvas.ts`

职责:

- 定义文档模型和命令边界
- 把 snapshot 解析成 runtime renderable nodes
- 执行节点命令
- 生成 forward/inverse patch
- 维护 group/reparent/move 等几何语义

输入/输出:

- 输入: `CanvasWorkbenchSnapshot`、`CanvasCommand`
- 输出: `CanvasWorkbench`、patch、历史可回放结果

依赖方向:

- 上层 store 和 UI 依赖它
- 它基本不依赖 UI 组件

关键状态转换/不变量:

- snapshot 必须能 resolve 成稳定 runtime
- group/ungroup/reparent/move 需要保持世界坐标语义正确
- patch 必须可逆
- hierarchy sanitize 后不能留下失效 parent/child 关系

优点:

- 命令语义集中，边界清楚
- `resolveCanvasWorkbench`、`executeCanvasCommand` 的职责清晰
- patch 回放和 geometry 规则没有散落到 UI
- 测试覆盖最好，可信度高

问题:

- 仍有少量和上层约定耦合的地方，比如文本归一化行为依赖文本工具链
- 读取节点仍主要通过数组查找和 snapshot clone，未来数据规模变大时可能有性能压力
- 当前还没有显式 use case 层包装它，上层经常直接拿它的细粒度能力用

评分: `8.5/10`

重构优先级: `P3`

判断:

- 这是当前最值得保留的部分。
- 后续重构应该围绕“保护这层”展开，而不是重写它。

## 3. 持久化与提交队列

文件重点:

- `src/stores/canvasStore.ts`
- `src/features/canvas/store/canvasWorkbenchService.ts`
- `src/features/canvas/store/canvasWorkbenchState.ts`
- `src/features/canvas/store/canvasStoreTypes.ts`

职责:

- Zustand state
- workbench 生命周期
- 初始化与用户切换重置
- 持久化与失败回滚
- 同 workbench 串行提交
- 历史记录
- 选择状态
- 部分节点转换与业务策略

输入/输出:

- 输入: UI 意图、文档命令、DB 读写结果、用户重置信号
- 输出: 可订阅的 canvas app state，以及所有 mutation API

依赖方向:

- 几乎所有 canvas UI 都直接依赖它
- 它依赖 DB、document 内核、auth、事件系统

关键状态转换/不变量:

- 同一 workbench 的 mutation 需要串行
- 生命周期任务需要在 epoch 失效后丢弃
- 持久化失败时不能只改内存态
- undo/redo 只能在 patch 持久化成功后提交到 store
- 当前用户 reset 后，旧任务结果不能落回新状态

优点:

- `canvasStore.ts` 已明显变薄，主要保留订阅状态、UI setter 和 active-workbench 级门面
- workbench 生命周期、串行提交、持久化回滚、undo/redo、epoch 失效、补偿逻辑已下沉到 `canvasWorkbenchService`
- 纯状态迁移和 history 变更已下沉到 `canvasWorkbenchState`，边界比原来清楚很多
- `patchWorkbench` 已收口 workbench 顶层更新，`CanvasAppBar` / `CanvasStoryPanel` / `CanvasWorkbenchPanel` 不再走整份 workbench 回写
- 本轮 review 抓出的两个真实问题已修掉:
  - delete/group 现在在队列内部基于最新 workbench 快照计算
  - reset 现在会清空并 gate pending compensation，旧 epoch 不会把债务写回新会话

问题:

- 这层仍不是“纯 UI store”，而是“薄 store 壳 + 一层应用门面”，active-workbench 级包装 API 还在
- `selectedElementIds`、`tool`、`viewport`、`activePanel` 等 UI 状态仍和文档 mutation 门面共存于同一个 Zustand store
- panel / viewport / text session 仍普遍直接依赖 `useCanvasStore`，所以上层耦合压力只是被转移和减轻，还没有完全解开
- `toNode`、`cloneNodeTree` 这类节点适配逻辑目前仍在 service 内，后续如果 node use case 继续增多，这里还会再长

评分: `7.5/10`

重构优先级: `已完成本轮 P1，后续降为 P2`

判断:

- 这层已经从“最大结构瓶颈”降到了“可继续承接后续拆分”的状态。
- 目前不需要立刻继续深拆它，下一刀应该转向 `CanvasViewport`、文本会话与 runtime preview。

## 4. 运行时预览管线

文件重点:

- `src/stores/canvasRuntimeStore.ts`
- `src/features/canvas/boardImageRendering.ts`

职责:

- 草稿调整态
- 图片预览缓存
- interactive/background 预览升级
- selection preview
- 预览任务排队和淘汰

输入/输出:

- 输入: element id、draft adjustments、viewport scale、asset 数据
- 输出: `previewEntries`、selection preview ids

依赖方向:

- runtime store 依赖 `useCanvasStore.getState()` 和 `useAssetStore.getState()`
- element 组件和 edit panel 依赖 runtime store

关键状态转换/不变量:

- interactive preview 优先于 background preview
- 交互结束后要自动升级为 settled/background 版本
- 缓存淘汰不能踢掉 rendering/queued 中的任务
- preview source 释放时要及时清空 backing store

优点:

- 相比持久化 store，这层至少已经被单独抽出来
- preview 调度和缓存语义明确
- 对交互预览和背景预览做了清晰区分

问题:

- 还不是真正独立的 runtime service，仍直接从全局 store 拉数据
- 通过 element id 全局扫描 workbench element，边界不够清晰
- 模块级队列和 slot 状态让这层更像“全局单例运行时”，未来做 workbench scope、销毁时机会更麻烦

评分: `6.5/10`

重构优先级: `P2`

判断:

- 拆分方向是对的，但还没拆彻底。

## 5. 视口与交互引擎

文件重点:

- `src/features/canvas/CanvasViewport.tsx`
- `src/features/canvas/CanvasViewportStageShell.tsx`
- `src/features/canvas/CanvasViewportOverlayHost.tsx`
- `src/features/canvas/hooks/useCanvasViewportLifecycle.ts`
- `src/features/canvas/hooks/useCanvasViewportNavigation.ts`
- `src/features/canvas/hooks/useCanvasViewportToolOrchestrator.ts`
- `src/features/canvas/hooks/useCanvasMarqueeSelection.ts`
- `src/features/canvas/tools/toolControllers.ts`
- `src/features/canvas/hooks/useCanvasViewportOverlay.ts`
- `src/features/canvas/hooks/useCanvasInteraction.ts`

职责:

- 组合 stage / overlay / controls
- Stage host
- tool controller 路由与指针事件编排
- pan / zoom / fit-to-view / 空格平移
- marquee 交互与 selection preview
- selection overlay
- text editor host
- text toolbar host
- slice 可视化
- 底部 HUD

输入/输出:

- 输入: active workbench、tool、selection、zoom/viewport、runtime preview、text session state
- 输出: Konva stage 行为、overlay DOM、对 store 的提交

依赖方向:

- 组合壳仍直接依赖多个 store selector 和多个 canvas hooks
- stage / overlay / tool seam 之间通过显式 props 与 action port 协作，不再依赖宽 context
- element 组件再往回依赖 runtime/store

关键状态转换/不变量:

- marquee preview 和最终 selection 提交要一致
- pan 与 tool 状态不能冲突
- text editor overlay 需要跟随 node transform 和 viewport 变化
- 初次进入 workbench 时要做 fit-to-view 初始化

优点:

- `CanvasViewport` 已进一步退化成组合壳，stage 渲染、tool/input 编排、overlay DOM 宿主已经分层
- `CanvasViewportStageShell` 把 Konva stage、layer 结构、slice/guide/marquee 可视化收到了一个单独 seam
- `useCanvasViewportToolOrchestrator` 用分组 `CanvasToolActionPort` 收口工具输入，`toolControllers.ts` 不再依赖“什么都能做”的宽 context
- `CanvasViewportOverlayHost` 接管了 text editor / toolbar / dimensions badge、outside-click commit 和全局 Escape cancel
- `useCanvasTextSession` 已不再持有 DOM refs 或 document/window 监听
- `useCanvasViewportLifecycle` 把 stage registry、容器测量、首次 fit-to-view、空格键状态从导航控制里拆了出去
- `useCanvasMarqueeSelection` 把框选 preview / commit / runtime preview 同步收到了一个明确 seam
- 视口数学已抽成纯函数模块，`viewportNavigation.test.ts` 把 fit-to-view 和 zoom anchor 的关键语义锁住了
- `toolControllers.test.ts` 仍能直接锁住 select / hand / text / shape 的关键行为，不需要通过 `CanvasViewport` 做回归

问题:

- `CanvasViewport` 虽然已经瘦身，但仍是一个应用层组合中心，直接拉取较多 store state 和跨 seam view model
- `useCanvasMarqueeSelection` 虽然独立成 hook，但仍依赖 Konva node `getClientRect()` 和 runtime store preview，同样还不是纯 selection policy
- `useCanvasViewportOverlay` 仍然依赖 stage 测量和 DOM 几何计算，overlay 布局还不是完全可替换的纯布局层
- `useCanvasTextSession` 仍然带着跨 workbench 迁移、持久化/回滚与 selection 同步职责，text session 只是退出了 DOM 宿主，还没有退出应用层状态机
- `useCanvasViewportNavigation` 已经大幅收窄，但依然承担 pan / zoom / pointer transform 的全部控制逻辑，后续如果继续堆手势语义，这里还是会长胖

评分: `8.6/10`

重构优先级: `已完成本轮 P1，后续降为 P2`

判断:

- 这一层已经达到本轮目标，可以从“首要拆分对象”降到“需要防止反弹的已收口 seam”。
- 后续重点不该再回到把功能重新堆进 `CanvasViewport`，而是保持它作为组合壳，继续把更高层的恢复策略和文本会话边界往外推。

## 6. 文本编辑状态机

文件重点:

- `src/features/canvas/hooks/useCanvasTextSession.ts`
- `src/features/canvas/textSession.ts`
- `src/features/canvas/textRuntimeViewModel.ts`
- `src/features/canvas/textMutationQueue.ts`

职责:

- 文本创建
- 文本提交/取消
- workbench 切换时会话保持或回收
- 文本 draft 与持久化顺序控制
- 文本 toolbar / editor / overlay view model 解析

输入/输出:

- 输入: active workbench、selected ids、editing draft、文本输入事件
- 输出: 文本会话状态、提交命令、view model

依赖方向:

- 纯判定逻辑被拆到 `textSession.ts`
- 真正的会话管理依赖 viewport host 与 store mutation API，但已不再直接依赖 DOM refs 或全局监听

关键状态转换/不变量:

- create 模式只有第一次出现非空内容时才 materialize 节点
- cancel 在未 materialize 与已 materialize 两条路径上行为不同
- 切换 workbench 时要区分 `noop`、`wait`、`persist-source`、`reset`
- 文本写入必须串行

优点:

- 这块已经有明显状态机意识
- commit / cancel / workbench transition 的纯判定被抽出来了
- 文本 mutation queue 让副作用顺序更可控
- DOM 宿主已经移到 `CanvasViewportOverlayHost`，`useCanvasTextSession` 的边界比上一轮清楚

问题:

- 真实状态机仍主要靠 ref + effect 协作，不够显式
- 会话逻辑虽然独立成 hook，但仍高度依赖 viewport 生命周期与 store mutation 门面
- 跨 workbench 迁移、持久化/回滚、selection 同步仍塞在同一个 hook 里，状态边界还不够薄
- 后续如果再加富文本、inline style、multi-node text edit，这里会快速变难维护

评分: `7.3/10`

重构优先级: `P1`

判断:

- 这块比上一轮健康，但还没有达到 `8.5/10`，下一刀应该把它从“hook + refs + effects”继续推进成更显式的 session service / state machine seam。

## 7. 面板层

文件重点:

- `src/features/canvas/CanvasLayerPanel.tsx`
- `src/features/canvas/CanvasPropertiesPanel.tsx`
- `src/features/canvas/CanvasStoryPanel.tsx`
- `src/features/canvas/CanvasWorkbenchPanel.tsx`
- `src/features/canvas/CanvasAppBar.tsx`
- `src/features/canvas/CanvasExportDialog.tsx`
- `src/features/canvas/hooks/useCanvasWorkbenchActions.ts`
- `src/features/canvas/hooks/useCanvasStoryPanelModel.ts`
- `src/features/canvas/hooks/useCanvasLayerPanelModel.ts`
- `src/features/canvas/hooks/useCanvasPropertiesPanelModel.ts`
- `src/features/canvas/workbenchPanelState.ts`
- `src/features/canvas/storyPanelState.ts`
- `src/features/canvas/layerPanelState.ts`
- `src/features/canvas/propertyPanelState.ts`

职责:

- 图层管理 UI
- 属性编辑 UI
- 故事切片与 guide/safe-area UI
- workbench 管理 UI
- 把 panel 意图翻译为 `patchWorkbench`、`executeCommandInWorkbench`、`reorderElements`、`reparentNodes`、`createWorkbench`、`deleteWorkbench`

输入/输出:

- 输入: store state、selection model、active workbench、页面层传入的 `selectedSliceId`
- 输出: model hook 统一调用 store mutation API；pure planner 输出 patch、command 和 layer drop plan

依赖方向:

- panel 组件依赖 panel model hook
- model hook 依赖 `useCanvasStore`、selection hooks、router/page props
- pure planner/state 模块只依赖类型、slice helper、preset helper、document graph
- UI 不再直接组装领域 patch / command 细节

关键状态转换/不变量:

- 图层拖拽重排保持 parent / sibling 顺序正确
- group 不能拖进自己的后代
- 切片变更始终保持选中 slice 有效
- 属性编辑只能发出对节点类型合法的 `UPDATE_NODE_PROPS`

优点:

- panel 层已经从“view + 领域规则”收缩成“view + intent”
- `CanvasWorkbenchPanel` 与 `CanvasAppBar` 现在共用同一套 workbench action seam
- `CanvasStoryPanel` 的 preset / slice / guide / safe-area 规划集中到了 `storyPanelState.ts`
- `CanvasLayerPanel` 的 reorder / reparent 判定集中到了 `layerPanelState.ts`
- `CanvasPropertiesPanel` 已改成“字段 intent -> UPDATE_NODE_PROPS”
- panel 级规则现在可以通过 4 个 pure planner 测试文件独立回归

问题:

- `CanvasExportDialog` 还没有并入这套 seam
- 这层仍通过 model hook 直接依赖 `useCanvasStore`，不是完全独立的 use-case 层
- 后续如果 `CanvasImageEditPanel` 或 viewport 侧属性修改入口继续增长，需要复用 `propertyPanelState.ts`，否则会重新分叉

评分: `8.5/10`

重构优先级: `已完成本轮 P1，后续降为 P2`

判断:

- 这一层已经不再是当前最危险的结构热点。
- 后续重点不是继续深拆 panel，而是防止新的属性入口和导出入口绕开现有 seam。

## 8. 渲染与导出

文件重点:

- `src/features/canvas/renderCanvasDocument.ts`
- `src/features/canvas/hooks/useCanvasExport.ts`

职责:

- 以 `CanvasWorkbench` 为输入做导出渲染
- 图片、文本、形状的最终合成
- 切片裁剪
- 导出下载流程

输入/输出:

- 输入: `CanvasWorkbench`、asset 列表、导出尺寸参数
- 输出: 导出 canvas、data URL、slice 图像

依赖方向:

- 导出渲染依赖 editor render pipeline 和图片后处理
- 导出 UI 依赖 export hook

关键状态转换/不变量:

- 导出必须以文档数据为准，而不是依赖编辑 overlay
- 隐藏 group descendants 时导出必须正确跳过
- 切片裁剪必须使用和最终输出一致的 scale

优点:

- 主导出路径已经尽量基于文档模型，而不是直接截图编辑视图
- `renderCanvasWorkbenchToCanvas` 的职责比较集中
- 切片裁剪逻辑是独立函数

问题:

- `useCanvasExport` 里仍保留一条基于 stage 的快照路径
- 编辑态 overlay 隐藏逻辑仍存在于 UI 侧导出工具中，说明“文档导出”和“视图导出”没有完全统一
- 图片导出仍需要跨到 editor render pipeline，技术上合理，但边界上偏重

评分: `7/10`

重构优先级: `P3`

判断:

- 这层总体健康，但导出入口还可以进一步统一。

## 核心证据

本轮判断主要基于以下代码和测试:

- 页面装配: `src/pages/canvas.tsx`
- 文档内核: `src/features/canvas/document/*`
- 持久化与提交队列: `src/stores/canvasStore.ts`、`src/features/canvas/store/*`
- 运行时预览: `src/stores/canvasRuntimeStore.ts`
- 视口与交互: `src/features/canvas/CanvasViewport.tsx`、`src/features/canvas/CanvasViewportStageShell.tsx`、`src/features/canvas/CanvasViewportOverlayHost.tsx`、`src/features/canvas/hooks/useCanvasViewportLifecycle.ts`、`src/features/canvas/hooks/useCanvasViewportNavigation.ts`、`src/features/canvas/hooks/useCanvasViewportToolOrchestrator.ts`、`src/features/canvas/hooks/useCanvasMarqueeSelection.ts`
- 文本会话: `src/features/canvas/hooks/useCanvasTextSession.ts`
- 面板层: `src/features/canvas/CanvasLayerPanel.tsx`、`CanvasStoryPanel.tsx`、`CanvasPropertiesPanel.tsx`
- 渲染导出: `src/features/canvas/renderCanvasDocument.ts`、`src/features/canvas/hooks/useCanvasExport.ts`

关键测试覆盖:

- `src/stores/canvasStore.test.ts`
- `src/features/canvas/store/canvasWorkbenchState.test.ts`
- `src/stores/canvasRuntimeStore.test.ts`
- `src/features/canvas/document/commands.test.ts`
- `src/features/canvas/document/resolve.test.ts`
- `src/features/canvas/renderCanvasDocument.test.ts`
- `src/features/canvas/textSession.test.ts`
- `src/features/canvas/tools/toolControllers.test.ts`
- `src/features/canvas/viewportOverlay.test.ts`
- `src/features/canvas/viewportNavigation.test.ts`

## 重构优先级排序

### P1

- 页面入口的恢复策略下沉为更明确的应用层
- 文本会话从 hook 进一步收口成更显式的 session service
- runtime preview 从全局 store 读取模型转向更明确的 workbench-scoped 输入

### P2

- 继续收紧 `canvasStore` 的 active-workbench 门面，避免它重新长回“万能接口集合”
- 把 `CanvasExportDialog` / `CanvasImageEditPanel` 等剩余入口继续并入现有 panel seam，避免局部反弹
- 保护 `CanvasViewport` 新的 stage / tool / overlay seam，不让新的交互策略重新堆回组合壳

### P3

- 保护文档内核，不做推倒重写
- 统一导出主路径，减少 stage snapshot 分支

## 推荐的拆分顺序

1. 先处理页面入口 / 文本会话 / runtime preview 的 service 化和边界下沉
2. 再继续收紧 `canvasStore` 对上层暴露的 active-workbench 门面
3. 同时保护 `CanvasViewport` 新的 stage / tool / overlay seam，不让新的交互策略重新回流
4. 最后把剩余未收口的 panel 入口并到现有 seam 上，避免重新长回组件内规则

## 最终判断

这轮之后，最紧急的 seam 已经从 panel 层和 viewport 残留宿主，转向了页面入口 / 文本会话 / runtime preview 的应用层边界。

- 如果继续堆功能，复杂度会优先集中在文本会话、页面入口和 runtime preview，而不是重新首先压垮 `CanvasViewport`、panel 层或 `canvasStore.ts`
- panel 层现在已经能继续承接下一轮拆分，但还不值得宣布“整个 canvas 完成”
- `CanvasViewport` 这一层已经可以承接后续功能，但前提是不要把新的恢复策略、DOM 宿主逻辑和工具策略重新塞回组合壳
- 文档内核这条健康链路仍然应该继续被保护，后续重构仍应围绕上层应用边界展开
