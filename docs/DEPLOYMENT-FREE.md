# Free-tier production deployment (no card, no VPS)

This is a complete production topology that costs nothing. It is an **alternative** to the VPS
topology in [DEPLOYMENT.md](DEPLOYMENT.md) — the same code, the same `node apps/api/src/server.js`
entry point, just hosted on free managed services. Moving to a VPS later is an env-var change
documented in [VPS-MIGRATION.md](VPS-MIGRATION.md).

```text
Vercel (free)              -> apps/dashboard
Render (free web service)  -> apps/api
Neon (free)                -> PostgreSQL
Upstash (free)             -> Redis
Cloudflare Workers (free)  -> workers/media-gateway
GitHub Actions (free)      -> cron jobs + keep-alive pings
```

## Free-tier limits to know

| Service            | Free allowance                                              | What happens when exceeded                                                    |
| ------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Render             | 750 hrs/month for one web service; sleeps after 15 min idle | Cold start (~30–60 s) if it sleeps; keep-alive workflow prevents this         |
| Neon               | 0.5 GB storage, autosuspend                                 | Compute auto-resumes on first query (small latency blip)                      |
| Upstash            | 10k Redis commands/day                                      | Commands rejected until reset — cache falls back to memory (`ResilientCache`) |
| Cloudflare Workers | 100k requests/day, free KV/DO tiers                         | Gateway requests fail — monitor usage in the dashboard                        |
| GitHub Actions     | 2,000 min/month for private repos                           | Scheduled jobs stop running; public repos are unlimited                       |

## 0. Prerequisites

Accounts (all free, none require a card): GitHub, Render, Neon, Upstash, Cloudflare, Vercel.
Locally: Node 22+, pnpm 10 (`corepack enable`), and the repo pushed to GitHub.

Generate the secrets once, store them in a password manager, and reuse them everywhere:

```powershell
node scripts/generate-signing-key.js   # SIGNING_KEYS_B64 + ACTIVE_SIGNING_KID
openssl rand -base64 32                # APP_ENCRYPTION_KEY_BASE64
openssl rand -hex 32                   # GATEWAY_INTERNAL_SECRET (repeat for GATEWAY_CONTROL_SECRET)
```

## 1. Neon PostgreSQL

1. Create a free project (region: Singapore). Copy the **pooled** connection string for the app
   and the **direct** one for migrations.
2. Apply migrations locally against the direct string:

   ```powershell
   $env:DATABASE_URL = "<neon direct connection string>"
   pnpm install
   pnpm db:migrate
   ```

3. Bootstrap the super admin per [ADMIN-BOOTSTRAP.md](ADMIN-BOOTSTRAP.md) while the env var is set.

## 2. Upstash Redis

Create a free database (region: Singapore, same region as Neon). Copy the REST URL and token.
These are `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.

## 3. Render — control API

1. Render dashboard → **New → Blueprint**, point it at the GitHub repo. It reads `render.yaml`
   at the repo root.
2. Fill the prompted values: `DATABASE_URL` = Neon **pooled** string, Upstash REST URL/token,
   the generated secrets, and the public URLs (Render assigns `https://unpirator-api.onrender.com`;
   the gateway/dashboard URLs can be corrected after steps 4–5 — Render redeploys on save).
3. Deploy. Verify `https://unpirator-api.onrender.com/health/ready` returns
   `{"status":"ready","checks":{"database":true,"cache":true}}`.

The blueprint runs `pnpm db:migrate` on every build, so schema changes ship automatically.

## 4. Cloudflare Workers — media gateway

1. `workers/media-gateway`: `wrangler login` (free plan is fine), create the `SOURCE_CACHE` KV
   namespace once and reference its id in `wrangler.toml`.
2. Set Worker secrets (`wrangler secret put ...`): `PLAYBACK_PUBLIC_KEYS_B64`,
   `GATEWAY_CONTROL_SECRET`, `INTERNAL_API_URL` = the Render URL, `GATEWAY_INTERNAL_SECRET`.
   Never put private playback keys in the Worker.
3. `wrangler deploy`. The `SESSION_STATE` Durable Object is created by the Worker migration.
4. Put the Worker URL into Render's `GATEWAY_PUBLIC_URL` / `GATEWAY_CONTROL_URL`.

## 5. Vercel — dashboard

1. Import `apps/dashboard` (root directory setting) as a Next.js project, free tier.
2. Env vars: API base URL → the Render URL. Deploy.
3. Put the dashboard URL into Render's `DASHBOARD_URL` and fix `API_PUBLIC_URL`/`COOKIE_DOMAIN`
   if a custom domain is added later.

## 6. GitHub Actions — keep-alive + cron

Repo **Settings → Secrets and variables → Actions**, add:

- `API_PUBLIC_URL` (keep-alive) — e.g. `https://unpirator-api.onrender.com`
- `DATABASE_URL` (Neon pooled), `APP_ENCRYPTION_KEY_BASE64`, `SIGNING_KEYS_B64`,
  `ACTIVE_SIGNING_KID`, `GATEWAY_INTERNAL_SECRET`, `GATEWAY_CONTROL_SECRET`,
  `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (scheduled jobs)
- Optional: `YOUTUBE_API_KEY` (piracy scanner), `SERPAPI_KEY` (optional web scanner)

The workflows in `.github/workflows/` do the rest:

- `keep-alive.yml` — pings `/health/ready` every 10 min so Render never sleeps; GitHub emails
  you if the API goes down (free uptime monitoring).
- `scheduled-jobs.yml` — runs the job scripts (usage rollup, webhook retries, subscription
  expiry, piracy scan) on UTC schedules. Manually triggerable from the Actions tab
  (**Run workflow**) for testing.

## Smoke test

1. Log in through the dashboard, create a site, register an asset, play it through the gateway.
2. Watch Render logs for the request path and Neon/Upstash consoles for activity.
3. Actions tab → run **Scheduled jobs** manually once and check the green ticks.

## Troubleshooting

- **Render build fails on `pnpm install`** — ensure the lockfile is committed; Render runs
  `corepack enable` itself via the blueprint's build command.
- **Cold-start slowness anyway** — GitHub cron can lag a few minutes off-schedule; that is
  expected and harmless.
- **`/health/ready` shows `cache: false`** — Upstash credentials missing/wrong in Render env;
  the API still runs (`ResilientCache` degrades to memory) but rate limits reset per-instance.
- **Worker 1027 errors** — `INTERNAL_API_URL` still points at localhost instead of the Render URL.
