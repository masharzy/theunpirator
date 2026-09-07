# Security Baseline

## Implemented foundation controls

- Argon2id password hashing
- HTTP-only secure session cookie support
- CSRF double-submit protection for cookie-authenticated mutations
- Zod request validation
- Helmet and strict configurable CORS
- API key hashing and scoped authentication
- Ed25519 short-lived playback signatures
- Key-ring/KID rotation model
- Tenant-scoped authorization helpers
- Provider credential envelope encryption (AES-256-GCM)
- Asset-only media routing; no open `url=` proxy
- Source hostname allowlists
- Gateway session revocation state
- Structured Pino logs with request IDs
- Audit event persistence
- Rate-limit hooks backed by Redis when configured
- Sanitized public errors

## Required production operations

- Use high-entropy unique secrets.
- Place API and database on restricted network paths where possible.
- Configure TLS end-to-end.
- Set real CORS origins and cookie domain.
- Enable database backups and periodically test restore.
- Rotate API/signing/encryption keys under documented procedures.
- Configure Cloudflare WAF/rate limiting according to traffic profile.
- Do not enable restricted providers without appropriate authorization.

## Threats intentionally rejected

The media gateway will not accept arbitrary external URLs from viewers. This prevents open-proxy abuse and materially reduces SSRF risk. Provider creation validates hostnames against tenant-configured/source-specific allowlists.
