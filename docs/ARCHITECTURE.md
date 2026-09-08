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
short-lived GoogleVideo source immediately before delivery so customer users never receive it.

## Protected YouTube delivery

YouTube playback never exposes a native MP4 gateway response. The resolver selects separate AVC
video and MP4A audio representations with initialization and SIDX ranges. The gateway converts
those indexes into bounded segments and requires a one-time Durable Object ticket for each segment.

At bootstrap, the player creates an ephemeral RSA-OAEP key pair. The gateway creates a random
session AES-GCM key, stores it in the session Durable Object, and returns it wrapped to the player's
public key. The private key and imported AES key remain non-extractable inside a dedicated browser
Worker. Network responses contain authenticated ciphertext; decrypted fragments move directly to
MediaSource buffers and no plaintext media URL is created.

Tickets are bound to session, track, variant, sequence and a short integrity lease. Replay,
out-of-window harvesting, expired integrity, revoked sessions, unsupported embedded browsers, and
verified-origin mismatches fail closed. Removing the player or watermark sends a tamper signal,
terminates the crypto Worker, clears the client runtime and blocks further tickets. These controls
raise the cost of automated downloading but are not DRM and do not claim to prevent screen capture
or a purpose-built instrumented browser.
