# Public API Contract

Base path: `/v1`.

## Trust boundary

The browser never supplies a trusted viewer identity. The customer's backend authenticates the
viewer, checks content access, resolves the viewer's email from trusted server-side auth/session
state, then calls Unpirator with its secret API key.

The official browser SDK supplies a stable random device ID and client metadata. A viewer email in
browser JSON, HTML attributes or public JavaScript must be ignored by the customer backend.

## Customer server-to-server playback

`POST /v1/playback/sessions` with:

```http
Authorization: Bearer up_live_replace_me
Content-Type: application/json
```

Registered asset:

```json
{
  "siteId": "SITE_UUID",
  "assetId": "ASSET_UUID",
  "email": "viewer@example.com",
  "deviceId": "stable-random-device-uuid",
  "viewerIp": "203.0.113.10",
  "viewerUserAgent": "Mozilla/5.0 ...",
  "client": {
    "browser": "Mozilla/5.0 ...",
    "os": "Win32",
    "deviceName": "Browser device"
  }
}
```

Approved YouTube Custom workspace:

```json
{
  "siteId": "SITE_UUID",
  "source": {
    "provider": "youtube_custom",
    "url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "title": "Lesson video"
  },
  "email": "viewer@example.com",
  "deviceId": "stable-random-device-uuid",
  "viewerIp": "203.0.113.10",
  "viewerUserAgent": "Mozilla/5.0 ..."
}
```

### Required viewer fields

- `email` is required and must come from the customer's authenticated server-side user context.
- `deviceId` is required. Official SDKs generate a random stable UUID automatically.
- `viewerIp` and `viewerUserAgent` are optional API fields, but official server integrations
  derive them from the incoming viewer request so Security Center records viewer context instead of
  the customer server's Node/PHP/Python request.
- `externalUserId` and `displayLabel` are not part of the v0.2 playback contract.

## Viewer-data storage model

Unpirator does not copy the customer's user profile database. For protected playback it keeps only
the operational linkage required for security and playback history:

- an internal viewer record ID;
- a keyed HMAC lookup derived from the normalized email;
- the email encrypted at application level with AES-256-GCM and tenant-bound associated data;
- device records;
- playback sessions, assets and security events linked to that internal viewer record.

Plaintext email is returned only to authorized workspace/admin APIs when needed for operations and
is included in the protected player response only when the plan's dynamic watermark is enabled.
Unpirator does not store the customer's viewer password or profile fields.

## Response

A protected response contains a session ID, short-lived playback grant, gateway playback URL,
refresh URL, delivery mode and enabled feature snapshot. Session responses use
`Cache-Control: no-store`.

When dynamic watermarking is enabled, the response also contains a server-authorized watermark
policy. The protected player renders the authenticated viewer email plus a short session code.
Customer/browser code does not choose the trusted watermark label.

## Security requirements

- Keep the Unpirator API key server-side only.
- Authenticate the viewer before creating a playback session.
- Authorize the requested video/course before calling Unpirator.
- Never trust a browser-supplied email, user object or customer account ID as viewer identity.
- Keep the player bootstrap endpoint same-origin and retain CSRF protections appropriate to the
  customer's authentication model.
- Return `Cache-Control: no-store` from the customer playback endpoint.
- Do not log API keys, complete playback URLs, playback tokens or decrypted viewer email unless
  operationally necessary and access-controlled.
- Use HTTPS in production.

Dashboard APIs use HTTP-only cookie sessions, CSRF validation and tenant context.
