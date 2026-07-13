# FilmLab

FilmLab 是一个 image-first 的计算视觉工作台：输入一张图片，选择一套明确的视觉语言，完成社媒构图并导出可直接发布的静态作品。

## V1 可达结果

完整主路径是：

`图片输入 -> 计算风格 -> 语义叠层 -> 输出比例 -> PNG/JPEG -> 重载恢复`

- 输入：本地上传、拖放、粘贴图片、最近素材；AI 生成是可选输入源。
- 风格：Mono Terminal、Color Glyph、Print Screen、Signal Loss、Data Mosaic 五个方向；强度与 ASCII、Halftone、Signal 细调均从 Style Lab 可达。
- 表达：Caption、Timestamp、Watermark 三类语义叠层。
- 构图：1:1、4:5、9:16，切换后仍使用同一份可撤销画布文档。
- 输出：PNG 或 JPEG，1x 或 2x；质量预览和下载共用同一条作品渲染链。
- 恢复：同一浏览器重载后恢复素材、画布、风格、叠层与输出比例。

V1 只发布静态单图主路径。视频时间线、通用排版工具、多图拼贴、TIFF/16-bit 输出和完整专业调色台不属于当前产品承诺。

## 运行边界

| 层 | 职责 | 持久化边界 |
| --- | --- | --- |
| React / Canvas / WebGPU | 输入、作品文档、实时预览、风格与导出 | IndexedDB 保存当前浏览器的素材副本和 workbench |
| Fastify API | 认证、素材同步、可选 AI 生成 | 无持久配置时仅使用进程内存 |
| Postgres + Supabase Storage | 素材元数据、上传会话、原图和缩略图 | 生产环境必须同时配置，才能跨服务重启保留服务器素材 |

Workbench 文档在 V1 仍是浏览器本地状态，不承诺跨设备项目同步。AI 凭据缺失不会阻塞本地图片创作。

## 本地运行

要求 Node.js 20.19+（20.x）、22.13+（22.x）或 24+，pnpm 9，以及支持 WebGPU 的 Chromium 系浏览器。

```bash
pnpm install --frozen-lockfile
cp server/.env.example server/.env.local
pnpm dev
```

打开 `http://localhost:5173`。开发配置允许 `local-user` 无签名认证；浏览器 IndexedDB 会保留本地素材和 workbench。未配置 Postgres/Supabase 时，Fastify 的远端素材仓库只适合本地开发，服务重启后不会保留其中的数据。

## 生产持久化

生产环境至少需要以下服务端配置：

```dotenv
NODE_ENV=production
CORS_ORIGIN=https://your-client.example
DATABASE_URL=postgresql://...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=assets
AUTH_JWT_SECRET=...
ASSET_URL_SECRET=...
ALLOW_UNSIGNED_DEV_AUTH=false
```

在 Supabase 中预先创建私有 `assets` bucket；service role key 只能留在 Fastify 服务端。服务启动时会自动执行 `server/migrations` 中的 Postgres 迁移。生产部署还需要将静态客户端的 `/api` 同源代理到 Fastify，并把 `CORS_ORIGIN` 设置为实际客户端域名。

V1 没有内置登录页。生产宿主的认证服务必须签发带稳定 `sub` 用户 ID 的 HS256 JWT，并在加载 FilmLab 前写入浏览器 `localStorage` 的 `filmlab_auth_token`；签名使用服务端 `AUTH_JWT_SECRET`，不能把该 secret 暴露给客户端。若设置了 `AUTH_JWT_ISSUER` 或 `AUTH_JWT_AUDIENCE`，签发内容也必须匹配。

如果省略 `DATABASE_URL`，生产服务会拒绝启动；如果省略 Supabase 配置，二进制素材会退回进程内存，即使数据库存在也不能在服务重启后恢复原图。

AI 输入按需配置 `ARK_API_KEY`、`DASHSCOPE_API_KEY` 或 Kling 凭据；这些变量不是本地图片主路径的前置条件。

## 验证

```bash
pnpm verify
pnpm dead-code
```

自动检查只是回归证据。发布前仍需用固定的人像、风景和高细节素材逐一检查五种风格，并实际检查重载状态与导出文件。
