# Migrating from free tier to a VPS

The free-tier topology ([DEPLOYMENT-FREE.md](DEPLOYMENT-FREE.md)) makes no code-level commitments.
Every service below is swapped by changing environment variables and repointing DNS — the
application code, migrations, and job scripts are identical on both topologies.

| Free-tier piece           | VPS replacement                                                              | Code change |
| ------------------------- | ---------------------------------------------------------------------------- | ----------- |
| Render web service        | `node apps/api/src/server.js` under systemd/PM2/Docker (configs in `infra/`) | none        |
| Neon PostgreSQL           | self-hosted PostgreSQL, `DATABASE_URL` repointed                             | none        |
| Upstash Redis             | self-hosted Redis, `REDIS_URL` repointed                                     | none        |
| GitHub Actions cron       | crontab running the same job scripts                                         | none        |
| Cloudflare Worker gateway | keep it, **or** run `workers/media-gateway/node-server.js` on the VPS        | none        |
| Vercel dashboard          | keep it, **or** serve `apps/dashboard` from the VPS                          | none        |

## Switch-over checklist (~30 minutes, near-zero downtime)

1. **Provision the VPS** (any Ubuntu 22+/Debian 12 box, 1 vCPU/1 GB is enough to start) and copy
   the repo. Nothing installs beyond Node 22 + pnpm: `pnpm install --frozen-lockfile`.
2. **Postgres**: install PostgreSQL, create the database/user, then move the data:

   ```bash
   # from your machine, dump Neon (use the direct, non-pooled string)
   pg_dump "<neon direct url>" -Fc -f unpirator.dump
   # on the VPS
   pg_restore -d postgresql://unpirator:<pass>@localhost/unpirator --no-owner unpirator.dump
   ```

   Keep Neon untouched until cutover is verified — it is the rollback.

3. **Redis**: `apt install redis-server` (binds localhost). Set `REDIS_URL=redis://localhost:6379`
   and drop the Upstash REST vars.
4. **API**: copy `infra/systemd/the-unpirator-api.service` (or use PM2/Docker from `infra/`), set
   the same env vars Render had — `DATABASE_URL`, signing keys, gateway secrets,
   `API_PUBLIC_URL=https://api.yourdomain` — and start it. Verify `/health/ready`.
5. **Gateway**: either keep the Cloudflare Worker and update its `INTERNAL_API_URL` secret to the
   VPS URL (`wrangler secret put INTERNAL_API_URL`), or run the Node gateway adapter on the VPS
   (`node-server.js`) behind nginx and update `GATEWAY_PUBLIC_URL`.
6. **Dashboard**: either keep Vercel and repoint its API base URL env to the VPS, or self-host
   `apps/dashboard` (`next build && next start`) behind nginx.
7. **Cron**: install the job schedules (times in UTC, same as the GitHub workflows):

   ```cron
   17 1 * * *    cd /srv/the-unpirator && node apps/api/src/jobs/usage-rollup.js
   23 */6 * * *  cd /srv/the-unpirator && node apps/api/src/jobs/webhook-retry.js
   41 2 * * *    cd /srv/the-unpirator && node apps/api/src/jobs/subscription-expiry.js
   53 */4 * * *  cd /srv/the-unpirator && node apps/api/src/jobs/piracy-scan.js
   ```

   (The repo already ships systemd timer units for two of these —
   `infra/systemd/the-unpirator-webhooks.{service,timer}` and
   `the-unpirator-subscriptions.{service,timer}` — copy them to `/etc/systemd/system/` and
   `systemctl enable --now` them instead of writing crontab lines.) Then disable the GitHub
   workflows: Actions → Scheduled jobs → ⋮ → Disable workflow, and delete `keep-alive.yml`'s
   schedule (a VPS does not sleep).

8. **DNS**: repoint `api.yourdomain` (and any gateway/dashboard hostnames) to the VPS.
9. **Verify**: playback smoke test, dashboard login, one manual cron job run, 24 h of logs.
10. **Decommission**: delete the Render service; keep Neon for a week as backup, then delete.

## Rollback

Until step 8 (DNS), rolling back is just "do nothing": Render/Neon/Upstash keep serving because
nothing they do has changed. After the DNS switch, flip DNS back and re-enable the GitHub
workflows — Neon still holds the pre-migration copy only until you decommission it, so export a
final `pg_dump` from the VPS back to Neon if you want the safety net.
