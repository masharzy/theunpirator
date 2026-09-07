# Production Foundation — 70-Point Completion Map

All 70 foundation requirements are represented in code, configuration, tests, or deployment runbooks. Items that require third-party credentials (Vercel/Neon/Upstash/Cloudflare/DNS) are **deployment-ready**, not falsely marked as already live.

1. **Product boundary** — public secure-media product separated from restricted custom providers.
2. **High-level architecture** — documented control plane/data plane split in `docs/ARCHITECTURE.md`.
3. **Monorepo** — apps, workers, packages, providers, integrations, infra and tests are separated.
4. **Locked stack** — Next.js/JS/Tailwind/shadcn, Express/JS, PostgreSQL, Drizzle, Redis, Cloudflare Workers.
5. **Multi-tenancy** — tenant IDs and scoped authorization are built into tenant-owned records/routes.
6. **Database foundation** — tenants, accounts, sites, assets, devices, sessions, events, usage, billing, webhooks, audit.
7. **Feature flags** — global + tenant scopes; plan entitlements are independent from hard-coded plan names.
8. **Restricted YouTube feature** — isolated adapter, global env switch, global flag, tenant flag, Super Admin control; default off.
9. **Super Admin panel/API** — tenant list, provider health, restricted feature toggle and emergency control APIs.
10. **API key architecture** — one-time secrets, hashed storage, prefixes, scopes, expiry/revoke model.
11. **Signing-key architecture** — Ed25519 private signing in API, public verification ring in Worker.
12. **Playback token** — KID, tenant/site/user/asset/device/session/policy, issue/expiry claims.
13. **Playback session lifecycle** — create, concurrency policy, Redis state, refresh, heartbeat and revoke.
14. **No PostgreSQL per media segment** — Worker verifies grants locally and caches source mappings at edge.
15. **Revocation architecture** — Redis truth/cache plus Worker Durable Object session-state synchronization.
16. **Source manager** — provider registry and normalized server-only source contract.
17. **Credential protection** — AES-256-GCM encrypted provider/webhook secrets; secrets redacted from logs.
18. **Media gateway** — Cloudflare Worker data-plane implementation.
19. **Range requests** — Range/206 headers are proxied and preserved.
20. **HLS support** — manifests and URI attributes rewritten to opaque gateway object IDs.
21. **Caching** — source mapping TTL and Cloudflare fetch cache hints after authorization.
22. **Protected player** — universal JS player package with HLS.js/native support.
23. **Dynamic watermark** — session/user label overlay with randomized movement.
24. **Device control** — registered external device IDs, metadata, status and limits.
25. **Concurrent playback** — configurable block-new or revoke-old behavior.
26. **Security engine** — risk-event catalogue, scoring and decision thresholds.
27. **Audit logs** — authentication/admin/key/site/asset/feature/device/session actions persist.
28. **Usage metering** — playback/gateway/heartbeat events plus monthly rollups.
29. **Subscription/entitlements** — Starter/Pro/Business seed plans and effective entitlement service.
30. **Rate limiting** — Redis-backed login/playback buckets with graceful degradation.
31. **Webhooks** — signed webhooks, endpoint secrets, persistent delivery queue, exponential retry job.
32. **Idempotency** — playback creation supports tenant-scoped `Idempotency-Key` caching.
33. **API versioning** — public API is rooted under `/v1`.
34. **Input validation** — shared Zod contracts and strict schemas.
35. **Error model** — stable codes, request IDs, no internal stack/source leakage.
36. **Observability** — structured Pino logs, request IDs, latency and gateway telemetry.
37. **Health endpoints** — `/health/live`, `/health/ready`, Worker `/health`.
38. **Environment separation** — development/staging/production topology documented; secrets are env-driven.
39. **Configuration validation** — Express refuses to boot with invalid/missing critical environment values.
40. **Secret handling** — `.env` ignored, `.env.example` included, signing/encryption generator supplied.
41. **Database migrations** — Drizzle config plus initial PostgreSQL migration and seeded baseline.
42. **Backups** — `pg_dump` backup and isolated restore-smoke scripts included.
43. **CI** — GitHub Actions syntax/lint/format/test/dashboard-build/Worker dry-run pipeline.
44. **Deployment pipeline foundation** — Vercel/VPS/Neon/Upstash/Cloudflare topology documented.
45. **Docker** — optional API/PostgreSQL/Redis/full-dashboard compose layer; app remains Docker-independent.
46. **Testing strategy** — Vitest, Supertest and Playwright configurations/tests supplied.
47. **Security tests** — signing/encryption, source allowlist, risk engine, open-proxy contract tests.
48. **Open-proxy prevention** — Worker routes accept UUID asset IDs only; no `?url=` route exists.
49. **Origin allowlisting** — source manager rejects resolved hosts not registered on the asset.
50. **Domain verification** — DNS TXT challenge/verify API; only verified extra domains reach gateway allowlist.
51. **SDK strategy** — universal JS SDK plus Next.js/PHP/Django/Laravel/WordPress thin integrations.
52. **Public player contract** — customer backend bootstrap pattern; browser never receives customer secret API key.
53. **Emergency controls** — global feature kill, tenant/site/asset/provider status controls, revoke-all-tenant-sessions.
54. **Maintenance capability** — `secure_gateway` global feature can stop new protected playback without code deploy.
55. **Provider health** — provider health records, enforcement and success/failure updates.
56. **No core vendor lock-in** — standard PostgreSQL/Redis abstractions; Neon/Upstash are initial hosts only.
57. **Foundation milestone 1** — monorepo, shared config, schema, auth, RBAC, flags, assets, keys, audit, CI, docs.
58. **Media milestone 2** — Worker, token/session validation, Range/HLS proxy, origin allowlist, telemetry.
59. **Player milestone 3** — bootstrap, HLS auth header, token refresh, heartbeat, watermark, errors.
60. **Provider milestone 4** — direct, HLS, S3/R2 and Bunny provider adapters.
61. **Subscription milestone 5** — plan/entitlement/subscription/usage primitives and billing dashboard API.
62. **Security milestone 6** — devices, concurrency, risk, revoke, rate limits and security events.
63. **Framework milestone 7** — integration samples for Next.js, PHP, Django, Laravel and WordPress.
64. **Restricted-provider stage** — custom YouTube adapter remains isolated/non-functional until an independently authorized integration exists.
65. **Foundation definition-of-done assets** — local startup docs, env template, migrations, RBAC, flags, keys, audit, CI and health supplied.
66. **Media definition-of-done assets** — our-domain routes, source isolation, Range/HLS, revocation, allowlist and streaming implementation supplied.
67. **Commit strategy** — logical commit plan documented in architecture history guidance; generated project is ready to initialize as a repo.
68. **Production trust principle** — browser/front-end untrusted; authorization/signatures/state enforced server/edge-side.
69. **Explicit non-goals** — no inspect-disable tricks, no JS URL encryption, no open proxy, no plaintext credentials, no unofficial YouTube resolver.
70. **Target final architecture** — customer site → control API → signed grant → universal player → Cloudflare gateway → registered authorized origin.

## Deployment-only external work

The source code cannot create or verify accounts/credentials that were not provided. Before public traffic, provision Neon PostgreSQL, Upstash/Redis, Cloudflare Worker + KV namespaces, Vercel, DNS/TLS, and a VPS; load generated secrets; run the migration; bootstrap the Super Admin; deploy and run the included smoke/E2E/load tests against the real environment.
