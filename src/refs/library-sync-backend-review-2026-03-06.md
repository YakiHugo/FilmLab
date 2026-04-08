# Library Sync Historical Notes

记录日期：`2026-04-02`

- 资产链路曾经面临过三类核心风险：
  - 鉴权边界不可靠
  - 变更游标与下行同步语义不稳
  - canonical 资产标识在上传、去重、删除路径上不闭环
- 服务端资产实现已经迁到：
  - `server/src/assets/*`
  - `server/src/routes/assets.ts`
- 客户端同步主模型已经统一到 `assetId`，不再以 `remoteAssetId` 为事实边界。
