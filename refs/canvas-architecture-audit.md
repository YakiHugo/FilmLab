# Canvas 模块架构审计

日期: 2026-03-23
范围: `src/pages/canvas.tsx`、`src/stores/canvasStore.ts`、`src/stores/canvasRuntimeStore.ts`、`src/features/canvas/*`
评价口径: 是否适合后续迭代，不评价 UI 完成度

## 状态更新

- 状态: `canvasStore` 第一阶段 seam 拆分已落地，已从“单文件过载 store”拆成“薄 store 壳 + workbench service + 纯状态变更模块”。
- 总评: `6.8/10`
- 当前最强的一层: 文档内核
- 当前最弱的两层: `CanvasViewport`、panel 层
- 当前最明显的结构热点: viewport host 膨胀、panel 层直接承载领域规则、页面入口仍带一部分恢复策略
- 验证基线: 已复跑 4 个目标测试文件，共 45 个 case，全部通过；针对本轮改动补了 1 个纯状态测试文件；两轮 review 已完成，最终无新增问题
- 下一阶段优先级:
  1. 先拆 `CanvasViewport`
  2. 再收口 panel 层的领域逻辑
  3. 再处理页面入口 / 文本会话 / runtime preview 的应用层边界

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
- 目前不需要立刻继续深拆它，下一刀应该转向 `CanvasViewport` 和 panel 层。

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
- `src/features/canvas/tools/toolControllers.ts`
- `src/features/canvas/hooks/useCanvasViewportOverlay.ts`
- `src/features/canvas/hooks/useCanvasInteraction.ts`

职责:

- Stage host
- pan / zoom
- marquee 交互
- tool controller 路由
- selection overlay
- text editor host
- text toolbar host
- slice 可视化
- 底部 HUD

输入/输出:

- 输入: active workbench、tool、selection、zoom/viewport、runtime preview、text session state
- 输出: Konva stage 行为、overlay DOM、对 store 的提交

依赖方向:

- 这层直接依赖多个 store 和多个 canvas hooks
- element 组件再往回依赖 runtime/store

关键状态转换/不变量:

- marquee preview 和最终 selection 提交要一致
- pan 与 tool 状态不能冲突
- text editor overlay 需要跟随 node transform 和 viewport 变化
- 初次进入 workbench 时要做 fit-to-view 初始化

优点:

- 当前行为集中，单点调试路径清楚
- tool controller 已经是一个正确的抽象方向
- overlay 相关的纯计算已抽出去一部分

问题:

- 这是典型的 super-host component
- 交互状态机、渲染壳、overlay 宿主、文本宿主都挤在一个组件里
- 未来任何新工具、新 overlay、新 gesture 都会继续堆到这里
- `toolControllers.ts` 虽然存在，但 viewport 仍然承担绝大多数 orchestration

评分: `4.5/10`

重构优先级: `P1`

判断:

- 这是第二拆分目标。
- 拆法应该按 seam 拆，不是简单抽几个 hook 减行数。

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
- 真正的会话管理依赖 viewport host、store mutation API 和 DOM refs

关键状态转换/不变量:

- create 模式只有第一次出现非空内容时才 materialize 节点
- cancel 在未 materialize 与已 materialize 两条路径上行为不同
- 切换 workbench 时要区分 `noop`、`wait`、`persist-source`、`reset`
- 文本写入必须串行

优点:

- 这块已经有明显状态机意识
- commit / cancel / workbench transition 的纯判定被抽出来了
- 文本 mutation queue 让副作用顺序更可控

问题:

- 真实状态机仍主要靠 ref + effect 协作，不够显式
- 会话逻辑虽然独立成 hook，但仍高度依赖 viewport 生命周期与 DOM 宿主
- 后续如果再加富文本、inline style、multi-node text edit，这里会快速变难维护

评分: `6.5/10`

重构优先级: `P2`

判断:

- 方向是对的，但还没完全落成真正独立的 session service。

## 7. 面板层

文件重点:

- `src/features/canvas/CanvasLayerPanel.tsx`
- `src/features/canvas/CanvasPropertiesPanel.tsx`
- `src/features/canvas/CanvasStoryPanel.tsx`
- `src/features/canvas/CanvasWorkbenchPanel.tsx`
- `src/features/canvas/CanvasExportDialog.tsx`

职责:

- 图层管理
- 属性编辑
- 故事切片与 guide/safe-area 设置
- workbench 管理
- 导出 UI

输入/输出:

- 输入: store state、selection model、active workbench
- 输出: 直接调用 store mutation 或直接组装文档 patch

依赖方向:

- panel 普遍直接依赖 `useCanvasStore`
- 部分 panel 同时依赖 selection hooks、asset store 和本地领域 helper

关键状态转换/不变量:

- 图层拖拽重排要保持 parent / sibling 顺序正确
- 切片变更要始终保持选中 slice 有效
- 属性编辑不能破坏节点基础结构

优点:

- 面板体验完整
- UI 上手快，读一个 panel 基本能看懂这一块做什么

问题:

- panel 层并不只是 view/controller，而是在重复写应用层规则
- `CanvasLayerPanel` 里自己决定 reorder / reparent 分支
- `CanvasStoryPanel` 里自己决定 preset、slice、guide、safe-area 的文档更新
- `CanvasPropertiesPanel` 直接拼 `upsertElement` patch
- 这些规则没有统一收口，后续很容易出现“同一类更新在不同入口行为不一致”

评分: `5/10`

重构优先级: `P1`

判断:

- panel 层要收口成“发意图”，不该继续自己决定领域更新细节。

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
- 视口与交互: `src/features/canvas/CanvasViewport.tsx`
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
- `src/features/canvas/viewportOverlay.test.ts`

## 重构优先级排序

### P1

- 拆 `CanvasViewport`
- 收口 panel 层的领域逻辑

### P2

- 页面入口的恢复策略下沉为更明确的应用层
- 文本会话从 hook 进一步收口成更显式的 session service
- runtime preview 从全局 store 读取模型转向更明确的 workbench-scoped 输入
- 继续收紧 `canvasStore` 的 active-workbench 门面，避免它重新长回“万能接口集合”

### P3

- 保护文档内核，不做推倒重写
- 统一导出主路径，减少 stage snapshot 分支

## 推荐的拆分顺序

1. 先把 `CanvasViewport` 拆成至少三层:
   - stage shell
   - input controller
   - text/overlay host
2. 再把 panel 层统一改成只发意图:
   - layer reorder intent
   - story/preset/slice intent
   - element property intent
3. 再处理页面入口 / 文本会话 / runtime preview 的 service 化和边界下沉
4. 最后再继续收紧 `canvasStore` 对上层暴露的 active-workbench 门面

## 最终判断

这轮之后，最紧急的 seam 已经从 `canvasStore` 转移到了 `CanvasViewport` 和 panel 层。

- 如果继续堆功能，复杂度会优先继续集中在 `CanvasViewport.tsx` 和 panel 层，而不是重新首先压垮 `canvasStore.ts`
- `canvasStore` 现在已经能继续承接下一轮拆分，但还不值得宣布“完成”
- 文档内核这条健康链路仍然应该继续被保护，后续重构仍应围绕上层应用边界展开
