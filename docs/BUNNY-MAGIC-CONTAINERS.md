# Bunny Magic Containers deployment

This deployment moves only the media gateway to a long-running Node.js container. The dashboard
and control API remain on Vercel, PostgreSQL remains on Neon, and shared gateway state remains in
Upstash Redis.

## 1. Publish the image

Push the gateway files to `main`, then open GitHub **Actions → Publish media gateway image → Run
workflow**. The workflow publishes:

```text
ghcr.io/OWNER/the-unpirator-media-gateway:latest
```

For a private package, create a fine-grained GitHub personal access token with access to this
repository and read access to Packages. Bunny uses this token only to pull the image.

## 2. Connect the registry

In Bunny, open **Magic Containers → Container Registries → Add Registry** and enter:

```text
Registry: ghcr.io
Username: GITHUB_USERNAME
Password: GITHUB_PACKAGE_READ_TOKEN
```

## 3. Create the application

Choose **Single region deployment** and configure:

```text
App name: unpirator-media-gateway
Region: Singapore
Minimum instances: 1
Maximum instances: 1
Image: ghcr.io/OWNER/the-unpirator-media-gateway:latest
Container port: 8787
CPU: 1 core
RAM: 2 GB
```

Create an HTTP/CDN endpoint for container port `8787`. An Anycast IP is not required for the trial.

## 4. Add environment variables

Copy the existing values from the current gateway deployment. Do not commit their values.

```text
NODE_ENV=production
PORT=8787
INTERNAL_API_URL=https://theunpirator.vercel.app/control-api
GATEWAY_INTERNAL_SECRET=...
GATEWAY_CONTROL_SECRET=...
PLAYBACK_PUBLIC_KEYS_B64=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
REQUIRE_SESSION_STATE=true
REQUIRE_ORIGIN=true
```

`INTERNAL_API_URL` must be the public base that exposes `/internal/*`; do not append `/internal`.
Use either the Upstash variables above or `REDIS_URL`, never a local Redis hostname.

## 5. Configure health checks

Set startup, readiness, and liveness checks to:

```text
Protocol: HTTP
Port: 8787
Path: /health
```

The expected response is `{"status":"ok","service":"media-gateway"}`.

## 6. Switch traffic after verification

Open the Bunny endpoint `/health`. Only after it is healthy, update these variables in the Vercel
control API project:

```text
GATEWAY_PUBLIC_URL=https://YOUR-BUNNY-ENDPOINT
GATEWAY_CONTROL_URL=https://YOUR-BUNNY-ENDPOINT
```

Redeploy the control API. New playback sessions should now return the Bunny hostname in
`playbackUrl` and `refreshUrl`.

Keep the Cloudflare Worker deployed during the trial so rollback only requires restoring the two
Vercel environment variables.

## Optional automatic updates

After the first Bunny app is working, add its application ID as the GitHub Actions variable
`BUNNY_MAGIC_APP_ID` and add a Bunny API key as the Actions secret `BUNNYNET_API_KEY`. Every gateway
change pushed to `main` will then publish the image and update the `gateway` container automatically.
Enable **Always pull image** in Bunny so the `latest` tag is refreshed during each update.

## 7. Verify playback

Create a fresh playback session; old sessions still contain the previous gateway URL. Confirm:

1. `/health` returns HTTP 200.
2. A new `playbackUrl` uses the Bunny hostname.
3. A YouTube video starts, seeks, and plays for at least 30 minutes.
4. Token refresh succeeds after 90 seconds.
5. Bunny app logs contain no repeated `SOURCE_RESOLUTION_FAILED`, `ORIGIN_FAILURE`, or process
   restarts.

If startup reports missing environment variables, add the named variables in Bunny and redeploy the
container. If session creation succeeds but playback returns `SESSION_UNKNOWN`, verify that Bunny
and Vercel use the same `GATEWAY_CONTROL_SECRET` and that `GATEWAY_CONTROL_URL` points to Bunny.
