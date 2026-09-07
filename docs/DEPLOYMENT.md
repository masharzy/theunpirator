# Deployment

## Production topology

```text
Vercel        -> apps/dashboard
VPS           -> apps/api
Neon          -> PostgreSQL initially
Upstash       -> Redis initially
Cloudflare    -> workers/media-gateway
```

Docker is optional. The API can run with `node`, systemd, PM2, or a container.

## Database portability

The application depends on standard PostgreSQL through `DATABASE_URL`; Neon-specific APIs are not used by the core data layer. Migration to a VPS PostgreSQL instance is:

1. provision a compatible PostgreSQL version,
2. create database/user,
3. `pg_dump` from Neon,
4. `pg_restore` on VPS,
5. change `DATABASE_URL`,
6. run smoke tests and switch traffic.

## Redis portability

`packages/cache` supports a standard Redis URL and Upstash REST credentials. Moving to self-hosted Redis changes environment configuration, not business logic.

## Cloudflare

Create the `SOURCE_CACHE` KV namespace. `SESSION_STATE` is a Durable Object binding and is created through the Worker migration.

Populate Worker secrets:

- `PLAYBACK_PUBLIC_KEYS_B64`
- `GATEWAY_CONTROL_SECRET`
- `INTERNAL_API_URL`
- `GATEWAY_INTERNAL_SECRET`

Do not place private playback signing keys in the Worker.
