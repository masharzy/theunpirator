# Public API Contract

Base path: `/v1`.

## Customer server-to-server playback

`POST /v1/playback/sessions` with `Authorization: Bearer apk_<prefix>.<secret>` and scope `playback:create`.

```json
{
  "siteId": "uuid",
  "assetId": "uuid",
  "externalUserId": "customer-user-123",
  "deviceId": "customer-generated-stable-device-token",
  "displayLabel": "masked-user@example.com",
  "client": { "browser": "Chrome", "os": "Android", "deviceName": "Phone" }
}
```

For approved YouTube Custom workspaces, the plugin can create an on-demand session without a
customer-managed asset:

```json
{
  "siteId": "uuid",
  "source": {
    "provider": "youtube_custom",
    "url": "https://www.youtube.com/watch?v=VIDEO_ID"
  },
  "externalUserId": "customer-user-123",
  "deviceId": "customer-generated-stable-device-token"
}
```

The API creates or reuses an internal managed asset for the site and canonical video ID. The signed
upstream URL remains inside the Cloudflare gateway and is never returned by the public API.

The response contains the gateway playback URL, short-lived playback grant, refresh URL, session ID, and watermark policy. The customer secret API key must never reach the browser.

Dashboard APIs use HTTP-only cookie sessions plus CSRF header/cookie validation and tenant context in `x-tenant-id`.
