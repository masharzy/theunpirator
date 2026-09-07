# Free-tier tester deployment

This is for a small private test. Video files are never uploaded to Vercel, Neon, or Upstash.
Cloudflare Workers streams bytes from a registered origin to the viewer. Cloudflare may edge-cache
eligible responses.

The normal VPS entry point remains `apps/api/src/server.js`. The temporary Vercel adapter is
`apps/api/index.js`; delete that one file when the API moves to a VPS.

## Architecture

- Vercel project 1: Express Control API (`apps/api`)
- Vercel project 2: Next.js dashboard (`apps/dashboard`)
- Neon: PostgreSQL metadata and application records
- Upstash: rate limits and short-lived API state
- Cloudflare Worker: media gateway, KV mappings, and SQLite-backed Durable Objects

## 1. Push the repository to GitHub

If needed, create an empty GitHub repository, then run from this repository root:

```powershell
git init
git add .
git commit -m "feat: prepare tester deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Confirm `.env`, `.dev.vars`, `.deploy-secrets.txt`, and `wrangler.production.toml` are absent on
GitHub.

## 2. Create Neon PostgreSQL

Create a free Neon project. In its Connect dialog copy the pooled connection string for Vercel and
the direct connection string for migrations. Apply the migration from your terminal:

```powershell
$env:DATABASE_URL = Read-Host "Paste the Neon direct connection string"
node packages/db/src/migrate.js
Remove-Item Env:DATABASE_URL
```

The final line should be `Migrations complete`.

## 3. Create Upstash Redis

Create a free Redis database. Keep these values ready for the API project:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Do not set `REDIS_URL` on Vercel when using Upstash REST.

## 4. Generate deployment secrets

Run once:

```powershell
node scripts/generate-signing-key.js > .deploy-secrets.txt
```

Never commit or paste that file into chat. It contains:

- `ACTIVE_SIGNING_KID`
- `SIGNING_KEYS_B64` — private, Vercel API only
- `PLAYBACK_PUBLIC_KEYS_B64` — Cloudflare only
- `APP_ENCRYPTION_KEY_BASE64` — private, Vercel API only

Generate two more secrets and save them privately:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Use one as `GATEWAY_CONTROL_SECRET` and the other as `GATEWAY_INTERNAL_SECRET`. Their values must
match between Vercel and Cloudflare.

## 5. Deploy the temporary Vercel API

Import the GitHub repository into Vercel as `the-unpirator-api-test`:

- Root Directory: `apps/api`
- Framework Preset: Other
- Node.js: 22

Add these Production environment variables before deployment:

```text
DATABASE_URL=<Neon pooled connection string>
UPSTASH_REDIS_REST_URL=<Upstash REST URL>
UPSTASH_REDIS_REST_TOKEN=<Upstash REST token>
APP_ENCRYPTION_KEY_BASE64=<generated value>
SIGNING_KEYS_B64=<generated value>
ACTIVE_SIGNING_KID=<generated value>
GATEWAY_CONTROL_SECRET=<first shared secret>
GATEWAY_INTERNAL_SECRET=<second shared secret>
GATEWAY_PUBLIC_URL=https://example.com
GATEWAY_CONTROL_URL=https://example.com
DASHBOARD_URL=https://example.com
SESSION_COOKIE_NAME=unpirator_session
SESSION_TTL_HOURS=24
YOUTUBE_CUSTOM_GLOBAL=false
NODE_ENV=production
```

Deploy, copy the API URL, and check it:

```powershell
Invoke-RestMethod https://YOUR_API_URL/health/ready | ConvertTo-Json
```

## 6. Deploy the Cloudflare gateway

```powershell
Set-Location workers/media-gateway
npx.cmd wrangler login
npx.cmd wrangler kv namespace create SOURCE_CACHE
Copy-Item wrangler.production.toml.example wrangler.production.toml
```

In the new untracked `wrangler.production.toml`, replace `REPLACE_WITH_KV_NAMESPACE_ID` with the ID
printed by the KV command. Then set secrets; each command securely prompts for its value:

```powershell
npx.cmd wrangler secret put PLAYBACK_PUBLIC_KEYS_B64 --config wrangler.production.toml
npx.cmd wrangler secret put GATEWAY_CONTROL_SECRET --config wrangler.production.toml
npx.cmd wrangler secret put GATEWAY_INTERNAL_SECRET --config wrangler.production.toml
npx.cmd wrangler secret put INTERNAL_API_URL --config wrangler.production.toml
npx.cmd wrangler deploy --config wrangler.production.toml
```

For `INTERNAL_API_URL`, enter the Vercel API URL without a trailing slash. Copy the resulting
`workers.dev` URL and verify its `/health` endpoint.

## 7. Connect the API to Cloudflare

Replace these API project placeholders with the Worker URL, then redeploy the API:

```text
GATEWAY_PUBLIC_URL=https://YOUR_WORKER.workers.dev
GATEWAY_CONTROL_URL=https://YOUR_WORKER.workers.dev
```

## 8. Deploy the Vercel dashboard

Import the same repository as `the-unpirator-test`:

- Root Directory: `apps/dashboard`
- Framework Preset: Next.js
- Node.js: 22

Add:

```text
NEXT_PUBLIC_API_URL=/control-api
CONTROL_API_ORIGIN=https://YOUR_API_URL
```

Deploy and copy the dashboard URL. In the API project change `DASHBOARD_URL` to this dashboard URL,
then redeploy the API. Browser API calls use the dashboard's same-origin `/control-api` rewrite, so
login cookies work without depending on third-party cookies.

## 9. Verify

```powershell
$env:PLAYWRIGHT_BASE_URL = "https://YOUR_DASHBOARD_URL"
npx.cmd --yes pnpm@10.15.0 test:e2e
Remove-Item Env:PLAYWRIGHT_BASE_URL

Invoke-RestMethod https://YOUR_API_URL/health/ready | ConvertTo-Json
Invoke-RestMethod https://YOUR_WORKER.workers.dev/health | ConvertTo-Json
```

Create a tester workspace from the public dashboard. Domain verification requires a real DNS TXT
record. Register only media origins you own or are authorized to stream.

## 10. Move to a VPS later

1. Deploy the existing `apps/api/src/server.js` to the VPS with the same environment values.
2. Change Cloudflare `INTERNAL_API_URL` and dashboard `CONTROL_API_ORIGIN` to the VPS API URL.
3. Change the VPS `DASHBOARD_URL` to the dashboard URL.
4. Verify health and playback.
5. Delete `apps/api/index.js` and the temporary Vercel API project.

No media migration is required because video files never reside in the Control API.
