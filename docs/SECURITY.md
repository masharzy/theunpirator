# Security Baseline

## Viewer identity trust boundary

Viewer identity is server-authoritative.

- Protected playback requires an authenticated viewer email and a stable device ID.
- Customer/browser code never chooses the trusted email used by Unpirator.
- Official browser packages do not expose a trusted `email`, `currentUser`,
  `externalUserId` or `displayLabel` channel.
- The customer backend resolves the email from its own authenticated session or verified bearer
  token, authorizes the requested content, then calls Unpirator server-to-server.
- The Unpirator workspace API key remains server-side.

## Viewer-data minimization and storage

Unpirator does not mirror a customer's user-profile database.

For viewer-level playback/security operations it stores:

- an internal UUID;
- a deterministic keyed HMAC of normalized email for lookup/correlation;
- the email encrypted with AES-256-GCM;
- tenant identity as authenticated associated data for the encrypted email;
- device IDs and device metadata;
- playback/session/video/security-event linkage.

The keyed lookup value is not used as a display value. Authorized workspace/admin APIs decrypt the
email only when it must be shown operationally. Raw encrypted identity columns are not returned by
viewer/security/device/session APIs.

## Dynamic watermark

When enabled by plan entitlement, the control API returns a server-authorized watermark policy
containing the authenticated viewer email and a short session code. The protected player renders
that value inside the protected surface.

The customer does not create the trusted watermark label in browser code. Protected playback
integrity checks monitor the protected watermark surface for removal/hiding as defense in depth.
This is not DRM and cannot make a fully compromised viewer device incapable of screen capture.

## Security incidents

Gateway security telemetry records the concrete failure code, HTTP status, gateway path, message
and upstream status where available. The control API associates gateway incidents with the
playback session's viewer and snapshots the session/device state at event ingestion.

Security Center should distinguish:

- the session status captured at the event time;
- the session's current status;
- viewer email;
- device and browser;
- viewer IP/user-agent context;
- exact gateway failure reason/evidence.

An event name alone is not proof of piracy. For example, token expiry, upstream origin failure or a
segment ticket denial can have normal operational causes.

## Implemented foundation controls

- Argon2id password hashing
- HTTP-only secure account session cookie support
- CSRF protection for cookie-authenticated mutations
- Zod request validation
- Helmet and strict configurable CORS
- API key hashing and scoped authentication
- Ed25519 short-lived playback signatures
- Key-ring/KID rotation model
- Tenant-scoped authorization helpers
- Provider credential envelope encryption
- Application-level AES-256-GCM encryption for stored viewer email
- Keyed HMAC viewer lookup instead of plaintext email indexing
- Asset-only media routing; no open `url=` proxy
- Source hostname allowlists
- Gateway session revocation state
- Structured request IDs and security telemetry
- Audit event persistence
- Rate-limit hooks backed by Redis when configured
- Sanitized public errors

## Production operations

- Use high-entropy unique secrets and separate secrets by environment.
- Keep application encryption/signing/API keys out of source control.
- Prefer managed key/secrets storage where available and plan key rotation.
- Restrict database/network access.
- Configure TLS end-to-end.
- Configure real CORS origins and cookie settings.
- Back up databases and test restores.
- Define retention/deletion policy for viewer/session/security data.
- Configure Cloudflare WAF/rate limits according to traffic profile.
- Do not enable restricted providers without appropriate authorization.
