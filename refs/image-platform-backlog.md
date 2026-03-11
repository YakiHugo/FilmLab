# Image Platform Backlog

## Deferred after Phase 1

- Add real multi-candidate deployment selection and automatic fallback for the same logical model across providers.
- Externalize provider and deployment control-plane configuration instead of keeping `PROVIDERS` and `DEPLOYMENTS` as in-code registries.
- Design a versioned generation history bundle for export, import, and future cloud sync.
- Make reference images durable so replay does not depend on transient browser-local URLs.
- Migrate deployment ids from `*-primary` to `*-default` with history compatibility.

## Notes

- `provider` now means runtime provider only: `ark`, `dashscope`, `kling`.
- `modelFamily` is metadata for grouping and capability defaults, not the routing key for live requests.
- `runtimeProvider` response and persisted history fields stay unchanged in Phase 1 to avoid schema migration.
