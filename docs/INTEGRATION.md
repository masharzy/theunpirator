# Customer Integration

## Protected playback flow

1. Customer signs up and creates/verifies a site.
2. Customer configures or resolves its private video source server-side.
3. Customer creates a `playback:create` API key and stores it only in server secret storage.
4. The official player calls the customer's same-origin playback endpoint with the playback
   reference, stable random device ID and browser metadata.
5. Customer backend authenticates the viewer.
6. Customer backend resolves the viewer's email from trusted auth/session state.
7. Customer backend verifies that the viewer purchased/can access the requested content.
8. Customer backend calls Unpirator `POST /v1/playback/sessions` with `email`, `deviceId`,
   viewer request context and the server API key.
9. Unpirator maps the normalized email to an internal keyed identity, stores the email encrypted,
   creates the device/session linkage and issues protected playback.
10. If the plan enables dynamic watermarking, the player renders the server-authorized email and
    session marker inside the protected player surface.

## What the browser may send

The browser may send:

- `playbackRef` / `assetId` / supported source selection;
- SDK-generated `deviceId`;
- client browser/OS metadata;
- customer authentication headers or cookies.

The browser must not be trusted to provide the viewer email. Even if a malicious request includes
an `email` field, the customer server integration must ignore it and resolve the email from the
authenticated server context.

## What Unpirator stores

Unpirator is not a customer user database. It stores the minimum viewer linkage needed for
playback/security operations: encrypted email, keyed email lookup, device records, sessions,
viewed assets and security events. It does not need the customer's viewer password, profile,
address, course profile fields or unrelated account data.

## Viewer request context

The customer endpoint should forward the viewer IP and user-agent derived from the incoming request
as `viewerIp` and `viewerUserAgent`. This keeps Security Center forensic context tied to the
viewer request rather than to the customer's server-to-server HTTP client.

## Packages

- `@unpirator/react@0.2.0`
- `@unpirator/sdk-js@0.2.0`
- `@unpirator/player@0.2.0`
- `@unpirator/web-component@0.2.0`
- `@unpirator/integration-nextjs@0.2.0`

See `docs/PACKAGE-INTEGRATION.md` for stack-specific examples.
