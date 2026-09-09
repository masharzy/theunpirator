# The Unpirator

**Protected media infrastructure for modern platforms.**

Production-oriented multi-tenant protected media infrastructure across Next.js, PHP, Django, Laravel, WordPress and custom sites.

## Stack

- **Dashboard:** Next.js + JavaScript + Tailwind CSS + shadcn/ui-style local components
- **Control plane:** Express.js + JavaScript
- **Database:** PostgreSQL (Neon initially, provider-independent)
- **ORM:** Drizzle ORM
- **Fast state/cache:** Redis (Upstash supported, self-hosted Redis supported)
- **Media gateway:** Cloudflare Workers
- **Validation:** Zod
- **Password hashing:** Argon2id
- **Playback signing:** Ed25519
- **Logging:** Pino
- **Testing:** Vitest + Supertest + Playwright
- **CI:** GitHub Actions
- **Containers:** Docker/Docker Compose are optional convenience, not an application requirement

## Core security rules

1. The browser never receives provider credentials or raw registered-origin URLs in secure-gateway mode.
2. The gateway accepts **asset IDs**, never arbitrary `?url=` targets.
3. Tenant ownership is enforced on database reads and mutations.
4. Customer secrets are hashed or envelope-encrypted at rest.
5. Playback grants are short-lived and signed with Ed25519; edge verification uses public keys only.
6. Session revocation is synchronized to the gateway fast-state layer.
7. Restricted/custom provider integrations are isolated, default-off, and have a global kill switch.

## Quick start

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm keys:generate
```

Start local PostgreSQL/Redis yourself, or optionally use Docker:

```bash
docker compose up -d postgres redis
pnpm db:migrate
pnpm dev
```

Dashboard: `http://localhost:3100`  
API: `http://localhost:4100`  
Worker local: `pnpm dev:gateway`

## Customer integration

Use `@unpirator/react` for React and Next.js applications, or the
`@unpirator/web-component` custom element for HTML, PHP, Django, Laravel, WordPress, and other
browser-based applications. The secret API key stays in the customer's server route.

See `docs/PACKAGE-INTEGRATION.md` for the complete setup.

## Deployment model

- Next.js dashboard → Vercel
- Express API → VPS (Docker or systemd/PM2)
- PostgreSQL → Neon initially; migrate with `pg_dump`/`pg_restore` later
- Redis → Upstash initially; self-host later by changing `REDIS_URL`
- Media gateway → Cloudflare Workers

See `docs/DEPLOYMENT.md`, `docs/SECURITY.md`, and `docs/FOUNDATION-70.md`.

## Important provider boundary

The `youtube-custom` adapter is intentionally a **disabled stub**. It is not advertised as a standard provider and contains no unofficial extraction/resolver logic. Enabling a custom provider flag does not grant rights to access or re-stream third-party media; applicable provider authorization must exist independently.
