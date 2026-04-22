# Harness Improvements

## Intent

在 solo + pre-launch 约束下，把 harness 投资聚焦到三件事：**意图保真度 / agent 迭代反馈速度 / 有界漂移检测**。不搭团队规模的 pipeline 基础设施。

## 讨论起源的校准

- AGENTS.md / decisions.md 是 agent 从意图生成的，本身就是 harness 输出；harness 质量 = 意图保真度。
- 文档写多详细都挡不住漂移（半衰期倒挂、组合爆炸、检索反比、读写不对称），监测层不可省。
- lint codify 只适合窄交集；大多数语义规则走定期 cleanup task。

## 分层原则

| 层 | 用途 | 备注 |
|---|---|---|
| Executable | 在调用现场广播 helper 存在性 + 拦不可逆违反 | 按四判据筛 |
| Detection | 定期可视化已发生的漂移 | cleanup sweep + round-trip |
| Docs | 语义地图；不可从代码推导的理由 | 不再增加细节抗漂移 |

## lint codify 四判据（同时满足才上 lint）

1. runtime 不可逆后果（持久化、wire format、data corruption）
2. 机械可判（AST 层可枚举违反形状）
3. 修复是一行就地替换，不是架构重切
4. helper 不在 agent 默认反射路径上（lint 错误信息要能替代"agent 去读 decisions"）

不满足任何一条 → 交 cleanup task，不进 lint。

## Slices（执行状态见 JSON）

1. `lint-typecheck-feedback` — `typecheck` script + `no-unused-vars` 升 error + ESLint `--cache`
2. `retired-identifier-lint` — 删 AGENTS 500 行规则；核查 `remoteAssetId` / `threadAssetId` 是否符合四判据
3. `dead-code-scan` — 接入 knip 或 ts-prune，只产报告
4. `intent-convention-and-roundtrip` — task md 顶部 `## Intent` 约定 + `scripts/roundtrip.ts`
5. `cleanup-sweep` — `scripts/cleanup-sweep.ts` 扫退役清单 + dead-code 输出，产报告
6. `initial-calibration` — round-trip 首跑 + 频率决策

## Validation Boundaries

- 每 slice 的 `passes` 必须是行为级断言，不接受"代码改了"。
- 脚本类 slice（4、5）`passes` 含"在一个真实 closed task 上跑一次"。
- round-trip 首跑是 harness 自身的验证信号；发散密度决定后续频率（0-2 / 3-5 / >5 分段）。
- 任一 slice fail 立即 `blocked`，在本 md 记录 first actionable failure，停止推进。

## 显式不做（scale-up 后再谈）

- ticket → agent 调度
- WORKFLOW.md / 版本化 agent 策略
- worktree 并行 worker 协议
- 往 AGENTS.md / decisions.md 加详细枚举抗漂移
- cleanup / round-trip 作为阻塞 CI 的 gate

## Validation Log

### `lint-typecheck-feedback` — done (2026-04-22)

- 改动：
  - `package.json`: 加 `typecheck` script (`tsc -b && pnpm --filter server typecheck`)，`lint` / `lint:fix` 加 `--cache --cache-location node_modules/.cache/.eslintcache`。
  - `eslint.config.js`: `@typescript-eslint/no-unused-vars` 从 `warn` 升 `error`。
  - `server/tsconfig.json`: 加 `composite: true` + `tsBuildInfoFile`，让 server 端也能增量。
  - `server/package.json`: `typecheck` 简化为 `tsc -b`。
- 验证：
  - `pnpm typecheck` 冷启 ~12s / 增量 ~5s（含 pnpm workspace 开销）。
  - `pnpm lint` 冷启 ~15s / 增量 ~2.6s（6x 加速）。
  - unused import probe 触发 `error` 退出码，全仓 `warn→error` 升级后现有代码零违反。
- 未改 `.gitignore`：`.eslintcache` 走 `node_modules/.cache/`（已覆盖），`*.tsbuildinfo` 已在列表。

### `retired-identifier-lint` — done (2026-04-22)

- 改动：
  - `AGENTS.md`: 删 500 行规则（Code Convention 首条与 Review checks 枚举里的 `function/file over ~500 lines`）。
- 审计 `remoteAssetId` / `threadAssetId`：
  - TS/JS 源树零匹配（`grep -n` 仅命中文档和本 task 的 md/json）。
  - SQL 层残留 `thread_asset_id`：`server/migrations/001_baseline.sql:109` 定义列，`conversationQueries.ts:117` `SELECT thread_asset_id AS asset_id` 对外收口到 `assetId`，`mutations.ts:514` 用作 INSERT 列名。列名是 snake_case，与 TS 标识符命名空间天然隔离。
  - 结论：不加 lint。`no-restricted-syntax` 只能约束 TS 标识符，而 TS 侧两个标识符已全量消失；agent 默认反射路径上全是 `assetId`（`assetSyncApi.ts`、`assets.ts`、查询 alias），没有反射触发点。四判据 (1) runtime 不可逆后果 与 (4) 不在反射路径 都不成立 → 归 cleanup task（未来若 DB 列迁移再处理）。

### `dead-code-scan` — done (2026-04-22)

- 改动：
  - 加 dev dep `knip@^6.6.1`（唯一 scanner，未装 ts-prune；ts-prune 已归档）。
  - 新建 `knip.json`：root + `server` 双 workspace；root 入口 `index.html` / `src/main.tsx` / `vite.config.ts` / `eslint.config.js` / `scripts/**/*.ts` / `api/**/*.ts` / `shared/**/*.test.ts`；server 入口 `src/index.ts` + `src/**/*.test.ts`。`ignore` 覆盖生成 shaders，`ignoreBinaries` 吃掉 `package.json` 里的 `python` 引用。
  - `package.json`: 加 `dead-code` script（`knip --no-progress --no-exit-code --reporter compact`）。不接 CI。
- 输出契约（feed cleanup-sweep 用）：
  - 人类视角：`pnpm dead-code`（compact reporter），按段分组 `Unused files` / `Unused dependencies` / `Unused exports` / `Unlisted binaries`，每行 `path: symbol`。
  - 机器视角：`pnpm dead-code --reporter json --no-exit-code` 覆写 reporter，顶层 `{ "issues": [{ file, files, exports, dependencies, devDependencies, unlisted, unresolved, duplicates, types, enumMembers, namespaceMembers, catalog, binaries, optionalPeerDependencies }] }`；cleanup-sweep 读这个形状即可映射到 stable anchor（`file` + 类别 + `name`）。
- 验证：
  - `node node_modules/knip/bin/knip.js --no-progress --no-exit-code --reporter compact` 成功产报告：19 unused files / 1 unused-deps 行（8 个包）/ 88 unused exports。
  - JSON reporter 可解析，163 条 file-scoped issue 记录。
  - 本 sandbox 的 `/bin/sh` 没有 `dirname`/`sed`/`uname`，`pnpm dead-code` 走 npm 的 shell shim 会崩在 coreutils 缺失——不是脚本缺陷，正常 dev 机不会触发。
- 首跑 findings 仅作 cleanup-sweep 输入，未自动修；典型可疑条目留给 slice 5 分类：
  - 8 个 runtime deps 仅在 `vite.config.ts` manualChunks 字符串里出现（`@ai-sdk/*`、`ai`、`@tanstack/react-query`、`react-markdown`、`remark-gfm`），真未被源码 import。
  - `shared/` 跨 workspace 导出被部分标记为未用——server 侧有引用，需 cleanup-sweep 校验是否是 knip cross-workspace 追踪漏报。

## Handoff

下 session 读本 md + JSON，按 `nextTaskId` 进入。slice 完成后更新 JSON `status`，未过就记 first actionable failure 到本 md 的 Validation Log 段。
