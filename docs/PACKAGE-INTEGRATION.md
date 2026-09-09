# The Unpirator customer integration

The Unpirator uses a customer-owned server endpoint and a browser player. The browser never
receives the workspace API key, provider credentials, or registered source URL.

## Before installation

Complete these steps in The Unpirator dashboard:

1. Create a site for the customer application.
2. Add and verify its production hostname.
3. Create a `playback:create` API key and copy it once.
4. Enable the required provider and feature for the workspace.
5. Register provider connections and assets for Bunny, HLS, S3, R2, or direct media. YouTube URLs
   can be supplied when playback starts and do not require one asset record per video.

Keep these values in server-only environment variables:

```text
UNPIRATOR_API_URL=https://theunpirator.vercel.app/control-api
UNPIRATOR_API_KEY=up_live_replace_me
UNPIRATOR_SITE_ID=00000000-0000-0000-0000-000000000000
```

Never use a public prefix such as `NEXT_PUBLIC_`, `VITE_`, or `PUBLIC_` for the API key.

## Next.js quick start

```bash
pnpm add @unpirator/react @unpirator/integration-nextjs
```

Create `app/api/unpirator/playback/route.js`:

```js
import { createUnpiratorPlaybackHandler } from "@unpirator/integration-nextjs";
import { auth } from "@/auth";

export const runtime = "nodejs";

export const POST = createUnpiratorPlaybackHandler({
  apiUrl: process.env.UNPIRATOR_API_URL,
  apiKey: process.env.UNPIRATOR_API_KEY,
  siteId: process.env.UNPIRATOR_SITE_ID,
  resolveViewer: async () => {
    const session = await auth();
    if (!session?.user?.id) {
      const error = new Error("Sign in required");
      error.status = 401;
      throw error;
    }
    return {
      id: session.user.id,
      label: session.user.email || session.user.name || session.user.id,
    };
  },
});
```

Render a YouTube video in a Client Component:

```jsx
"use client";

import { useCallback } from "react";
import { UnpiratorPlayer } from "@unpirator/react";

export function LessonVideo({ youtubeUrl, firebaseUser }) {
  const getAccessToken = useCallback(() => firebaseUser.getIdToken(), [firebaseUser]);
  return (
    <UnpiratorPlayer
      src={youtubeUrl}
      title="Lesson video"
      getAccessToken={getAccessToken}
      onError={(error) => console.error("Playback failed", error)}
    />
  );
}
```

For a registered Bunny, HLS, S3, R2, or direct asset, pass its UUID:

```jsx
<UnpiratorPlayer assetId="00000000-0000-0000-0000-000000000000" />
```

Pass either `src` or `assetId`, never both. The default endpoint is
`/api/unpirator/playback`; use the `endpoint` prop for another path.

### Authenticated and guest playback

`resolveViewer` runs only on the customer server. Return a stable application user ID and optional
watermark label after checking the user's content entitlement:

```js
resolveViewer: async (request) => {
  const viewer = await authenticateRequest(request);
  if (!viewer || !(await viewerCanWatch(viewer))) {
    const error = new Error("This account cannot watch this lesson");
    error.status = 403;
    throw error;
  }
  return { id: viewer.id, label: viewer.email };
};
```

Omit `resolveViewer`, or return `null`, to allow guest playback. The helper creates a stable guest
identity from the browser-generated device ID. Browser-side `currentUser` is presentation metadata;
it is never trusted for authorization or identity. Throw a `401` or `403` error when a configured
viewer resolver must deny access.

## React component API

Import `UnpiratorPlayer` from `@unpirator/react`.

| Prop             | Type               | Required   | Description                                                         |
| ---------------- | ------------------ | ---------- | ------------------------------------------------------------------- |
| `src`            | `string`           | One source | YouTube watch, short, or embed URL                                  |
| `assetId`        | `string`           | One source | UUID of a registered provider asset                                 |
| `endpoint`       | `string`           | No         | Same-origin session endpoint; defaults to `/api/unpirator/playback` |
| `title`          | `string`           | No         | Display/audit title for URL-based playback                          |
| `poster`         | `string`           | No         | Video poster URL                                                    |
| `autoPlay`       | `boolean`          | No         | Requests autoplay; browser policy may reject it                     |
| `className`      | `string`           | No         | Class applied to the 16:9 player host                               |
| `style`          | `object`           | No         | Inline style overrides for the player host                          |
| `headers`        | `HeadersInit`      | No         | Static same-origin session request headers                          |
| `getHeaders`     | Async callback     | No         | Resolves fresh custom headers before session creation               |
| `getAccessToken` | Async callback     | No         | Resolves a token sent as `Authorization: Bearer ...`                |
| `onReady`        | `(player) => void` | No         | Called after the protected player mounts                            |
| `onError`        | `(error) => void`  | No         | Called when session creation or playback fails                      |

Unmounting the React component destroys its timers and media resources.

### Firebase authentication

Use `getAccessToken` when the customer endpoint verifies Firebase ID tokens:

```jsx
import { useCallback } from "react";
import { UnpiratorPlayer } from "@unpirator/react";

export function ProtectedLesson({ youtubeUrl, firebaseUser }) {
  const getAccessToken = useCallback(() => firebaseUser.getIdToken(), [firebaseUser]);
  return <UnpiratorPlayer src={youtubeUrl} getAccessToken={getAccessToken} />;
}
```

The customer server verifies the bearer token with Firebase Admin SDK and derives the viewer ID
from the verified token. It must never trust `currentUser`, a UID, or an email sent in the request
body. Keep callback props stable with `useCallback` to avoid unnecessarily remounting the player.

## HTML, PHP, Django, Laravel, or WordPress

Load the universal Web Component from an ESM CDN after publishing:

```html
<script type="module" src="https://esm.sh/@unpirator/web-component@0.1.0"></script>

<unpirator-player
  src="https://www.youtube.com/watch?v=VIDEO_ID"
  endpoint="/api/unpirator/playback"
  title="Lesson video"
></unpirator-player>
```

For a registered asset:

```html
<unpirator-player
  asset-id="00000000-0000-0000-0000-000000000000"
  endpoint="/api/unpirator/playback"
></unpirator-player>
```

Available attributes are `src`, `asset-id`, `endpoint`, `title`, `poster`, and `autoplay`. Customize
the ratio and handle its events as follows:

```css
unpirator-player {
  --unpirator-aspect-ratio: 4 / 3;
}
```

```js
const player = document.querySelector("unpirator-player");
player.addEventListener("unpirator-error", (event) => console.error(event.detail.error));
player.addEventListener("unpirator-ready", () => console.log("Playback ready"));
```

## Server endpoint contract

Non-Next.js applications need one same-origin `POST /api/unpirator/playback` endpoint. It must:

1. Authenticate the viewer and check content entitlement.
2. Accept the player body but ignore browser-supplied identity or API keys.
3. Send `POST {UNPIRATOR_API_URL}/v1/playback/sessions` using the server API key.
4. Return the upstream status code and JSON unchanged with `Cache-Control: no-store`.

YouTube upstream body:

```json
{
  "siteId": "SITE_UUID",
  "source": {
    "provider": "youtube_custom",
    "url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "title": "Lesson video"
  },
  "externalUserId": "customer-user-123",
  "displayLabel": "viewer@example.com",
  "deviceId": "browser-generated-device-id",
  "client": { "browser": "Mozilla/5.0 ...", "os": "Win32" }
}
```

For a registered asset, replace `source` with `assetId`. Authenticate upstream requests with:

```http
Authorization: Bearer up_live_replace_me
Content-Type: application/json
```

`externalUserId` should be an immutable customer database ID. `displayLabel` may be an email or
account label used in the watermark.

### PHP/Laravel endpoint core

Run normal authentication and entitlement middleware before this code:

```php
<?php
$input = json_decode(file_get_contents('php://input'), true);
$deviceId = (string)($input['deviceId'] ?? '');
if (strlen($deviceId) < 8) {
    http_response_code(400);
    exit(json_encode(['error' => ['message' => 'Invalid device ID']]));
}

$payload = [
    'siteId' => getenv('UNPIRATOR_SITE_ID'),
    'externalUserId' => (string)$viewer['id'],
    'displayLabel' => (string)$viewer['email'],
    'deviceId' => $deviceId,
    'client' => is_array($input['client'] ?? null) ? $input['client'] : [],
];
$payload[!empty($input['assetId']) ? 'assetId' : 'source'] = !empty($input['assetId'])
    ? (string)$input['assetId']
    : ['provider' => 'youtube_custom', 'url' => (string)($input['src'] ?? ''),
       'title' => (string)($input['title'] ?? 'Protected video')];

$curl = curl_init(rtrim(getenv('UNPIRATOR_API_URL'), '/') . '/v1/playback/sessions');
curl_setopt_array($curl, [
    CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . getenv('UNPIRATOR_API_KEY'),
                           'Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode($payload),
]);
$body = curl_exec($curl);
$status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
curl_close($curl);
http_response_code($status ?: 502);
header('Content-Type: application/json');
header('Cache-Control: no-store');
echo $body ?: json_encode(['error' => ['message' => 'Playback service unavailable']]);
```

### Django endpoint core

```python
import json, os, requests
from django.http import JsonResponse
from django.views.decorators.http import require_POST

@require_POST
def unpirator_playback(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": {"message": "Sign in required"}}, status=401)
    body = json.loads(request.body or "{}")
    device_id = str(body.get("deviceId", ""))
    if len(device_id) < 8:
        return JsonResponse({"error": {"message": "Invalid device ID"}}, status=400)
    payload = {
        "siteId": os.environ["UNPIRATOR_SITE_ID"],
        "externalUserId": str(request.user.pk),
        "displayLabel": request.user.email or str(request.user.pk),
        "deviceId": device_id,
        "client": body.get("client") if isinstance(body.get("client"), dict) else {},
    }
    if body.get("assetId"):
        payload["assetId"] = str(body["assetId"])
    else:
        payload["source"] = {"provider": "youtube_custom", "url": str(body.get("src", "")),
                             "title": str(body.get("title") or "Protected video")}
    response = requests.post(
        f'{os.environ["UNPIRATOR_API_URL"].rstrip("/")}/v1/playback/sessions',
        headers={"Authorization": f'Bearer {os.environ["UNPIRATOR_API_KEY"]}'},
        json=payload, timeout=25,
    )
    result = JsonResponse(response.json(), status=response.status_code)
    result["Cache-Control"] = "no-store"
    return result
```

Keep framework CSRF protection enabled for this endpoint.

## Direct JavaScript SDK

```js
import { mountProtectedPlayer } from "@unpirator/player";
import { createPlaybackBootstrap } from "@unpirator/sdk-js";

const player = await mountProtectedPlayer({
  element: document.querySelector("#player"),
  bootstrap: createPlaybackBootstrap({
    endpoint: "/api/unpirator/playback",
    src: "https://www.youtube.com/watch?v=VIDEO_ID",
  }),
  onError: console.error,
});

// Call when the containing view is removed.
player.destroy();
```

## Security checklist

- Keep the API key only in server-side secret storage.
- Authorize the logged-in viewer before creating a session.
- Use the verified site ID matching the browser hostname.
- Keep the player endpoint same-origin and retain CSRF protection.
- Return `Cache-Control: no-store` from the session endpoint.
- Do not log API keys, playback tokens, or complete playback URLs.
- Rotate a key if it appears in browser code, a public repository, or logs.
- Use HTTPS in production.

## Errors and troubleshooting

Packages surface an `Error` with `message` and, when supplied by the API, `code` and `status`.

| Result                     | Meaning                                        | Fix                                                         |
| -------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| `400 VALIDATION_ERROR`     | Invalid session field                          | Check UUIDs, device ID, and source/asset selection          |
| `401`                      | API key absent or invalid                      | Check server key and Authorization header                   |
| `403`                      | Site, origin, feature, or entitlement rejected | Verify domain, feature, and viewer access                   |
| `404`                      | Asset or provider connection missing           | Check that it belongs to the same workspace                 |
| `429`                      | Limit or rate policy reached                   | Respect `Retry-After`; avoid immediate retry loops          |
| `SOURCE_RESOLUTION_FAILED` | Provider could not produce a source            | Inspect provider and gateway logs using request ID          |
| `SEGMENT_TICKET_DENIED`    | Segment grant rejected or expired              | Start a fresh session and check gateway clock/configuration |

If playback starts and stops, capture the Network response, request ID, Control API log, and media
gateway log from the same attempt. Never post a complete signed playback URL publicly.

## Release and publishing

The repository includes **Actions > Publish npm packages**. For the first release, maintainers must:

1. Have publish access to the `@unpirator` npm organization.
2. Create a granular npm token with **Read and write** package permission and **Bypass 2FA** enabled.
3. Add that token as the GitHub Actions secret `NPM_TOKEN`.
4. Increment each released package version; npm versions are immutable.
5. Verify CI on `main`, then manually run `Publish npm packages`.
6. Verify installation in a clean example application.

The workflow publishes packages in dependency order. Publishing requires no database migration.
After the first release creates every package, configure npm Trusted Publishing for
`masharzy/theunpirator` and `publish-npm-packages.yml`, then remove the long-lived publish token.
