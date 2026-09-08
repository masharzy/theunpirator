# Architecture

## Control plane vs data plane

The Express API is the **control plane**: tenants, sites, assets, auth, plans, feature flags, sessions, device policy, auditing, and billing metadata. It must not carry normal video payloads.

Cloudflare Worker is the **media data plane**: validate playback grants, check fast session state, resolve registered assets through the internal API, resolve approved on-demand YouTube sources at the edge, proxy byte ranges/HLS objects, rewrite manifests, and emit telemetry.

```text
Viewer -> Customer site -> Customer backend -> Express Control API
                                            -> signed playback grant
Viewer -> media.example.com -> Cloudflare Worker -> registered origin
```

## Trust boundaries

- Browser is untrusted.
- Customer frontend is untrusted.
- Customer backend authenticates with scoped API keys.
- Worker receives only public playback verification keys.
- Provider credentials are only decrypted in trusted control-plane code.
- Arbitrary origin proxying is forbidden.

## Multi-tenancy

Every tenant-owned table includes `tenant_id`. Services must call tenant-scoped queries rather than accepting arbitrary ownership IDs from the client.

## Fast state

PostgreSQL is the source of truth. Redis holds short-lived playback/session/rate-limit/cache state. Gateway revocation uses a per-session Cloudflare Durable Object synchronized by the control API.

## Provider model

Providers implement a shared server-side source-resolution contract. A resolved URL never becomes a public API response. Secure gateway URLs use internal asset IDs.

The YouTube Custom provider is separately gated by an environment switch, a global feature flag,
tenant approval and provider health. The plugin sends a YouTube URL at session creation; the control
plane canonicalizes it and creates or reuses an internal managed asset. The Worker resolves the
short-lived GoogleVideo source immediately before proxying so customer users never receive it.
