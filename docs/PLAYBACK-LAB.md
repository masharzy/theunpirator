# Playback Lab

Playback Lab is an authenticated developer page at `/dashboard/playback-lab`. It exercises the same protected session, bootstrap, ticket, integrity, seek, and refresh path used by customer players.

## Source modes

- **YouTube URL** creates an on-demand `youtube_custom` session. The dashboard account becomes the viewer identity; no tenant API key is exposed to the browser.
- **Existing protected asset** tests any asset already registered in the workspace.
- **New authorized source** registers a reusable protected asset, then starts playback. It supports direct files, HLS, Bunny, S3, and R2.

## Origins requiring credentials or headers

Use a saved provider connection when credentials will be reused. For a one-off test, enter a provider config JSON object. Examples:

```json
{
  "headers": {
    "Authorization": "Bearer origin-token",
    "Referer": "https://customer.example"
  }
}
```

```json
{
  "endpoint": "https://account.r2.cloudflarestorage.com",
  "region": "auto",
  "accessKeyId": "...",
  "secretAccessKey": "..."
}
```

The dashboard sends this configuration to the authenticated control API over HTTPS. The API encrypts it at rest with `APP_ENCRYPTION_KEY_BASE64`; the player response never contains the origin credentials. Use saved connections for routine testing.

`Allowed hosts` limits redirects and resolved media requests. If left blank, Playback Lab derives the host from an HTTP source URL. Object references such as S3 keys require an explicit allowed host.
