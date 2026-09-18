# The Unpirator package integration

Protected playback uses a strict server-authoritative identity model.

The browser selects the video and supplies a stable random device ID. The customer backend
authenticates the viewer, resolves the viewer's email from trusted server-side auth state, checks
content entitlement, then calls Unpirator with the secret workspace API key.

## Packages

```bash
npm install @unpirator/react@0.2.0 @unpirator/integration-nextjs@0.2.0
```

Universal HTML/template integrations can load:

```html
<script type="module" src="https://esm.sh/@unpirator/web-component@0.2.0"></script>
```

Published package set:

- `@unpirator/player@0.2.0`
- `@unpirator/sdk-js@0.2.0`
- `@unpirator/web-component@0.2.0`
- `@unpirator/react@0.2.0`
- `@unpirator/integration-nextjs@0.2.0`

> Package versions in the repository are release candidates until the npm publish workflow has
> completed. Do not assume a version is available from npm until the release is verified.

## Required trust boundary

Browser request:

```json
{
  "playbackRef": "ASSET_OR_PLAYBACK_REF",
  "deviceId": "random-stable-device-uuid",
  "client": {
    "browser": "Mozilla/5.0 ...",
    "os": "Win32"
  }
}
```

The browser does **not** supply trusted viewer email.

Customer server resolves:

```text
authenticated request
  -> customer auth/session
  -> viewer.email
  -> content entitlement check
  -> Unpirator server-to-server session request
```

Unpirator request:

```json
{
  "siteId": "SITE_UUID",
  "assetId": "ASSET_UUID",
  "email": "viewer@example.com",
  "deviceId": "random-stable-device-uuid",
  "viewerIp": "203.0.113.10",
  "viewerUserAgent": "Mozilla/5.0 ...",
  "client": {
    "browser": "Mozilla/5.0 ...",
    "os": "Win32"
  }
}
```

`email` and `deviceId` are required. `viewerIp` and `viewerUserAgent` should be derived by the
customer backend from the incoming viewer request. `externalUserId` and `displayLabel` are not
part of the v0.2 playback contract.

## Next.js App Router

Server route:

```js
// app/api/unpirator/playback/route.js
import { createUnpiratorPlaybackHandler } from "@unpirator/integration-nextjs";
import { auth } from "@/auth";
import { db } from "@/db";

export const runtime = "nodejs";

export const POST = createUnpiratorPlaybackHandler({
  apiUrl: process.env.UNPIRATOR_API_URL,
  apiKey: process.env.UNPIRATOR_API_KEY,
  siteId: process.env.UNPIRATOR_SITE_ID,

  resolveViewer: async () => {
    const session = await auth();
    if (!session?.user?.email) {
      const error = new Error("Sign in required");
      error.status = 401;
      throw error;
    }

    // id may remain available to YOUR authorization callback.
    // Only email is forwarded to Unpirator as trusted viewer identity.
    return {
      id: session.user.id,
      email: session.user.email,
    };
  },

  authorizePlayback: async ({ body, viewer }) => {
    const lesson = await db.lesson.findFirst({
      where: { unpiratorPlaybackRef: body.playbackRef },
    });
    if (!lesson) return false;
    return hasCourseAccess(viewer.id, lesson.courseId);
  },
});
```

Player:

```jsx
"use client";

import { UnpiratorPlayer } from "@unpirator/react";

export function LessonVideo({ playbackRef }) {
  return (
    <UnpiratorPlayer
      playbackRef={playbackRef}
      endpoint="/api/unpirator/playback"
      onError={console.error}
    />
  );
}
```

The Next.js helper rejects cross-site requests, requires the SDK device ID, ignores browser identity,
derives viewer IP/user-agent from the request, requires `resolveViewer`, requires
`authorizePlayback`, and returns `Cache-Control: no-store`.

## React + Node/Express backend

Browser:

```jsx
import { UnpiratorPlayer } from "@unpirator/react";

export function LessonVideo({ playbackRef, authToken }) {
  return <UnpiratorPlayer playbackRef={playbackRef} getAccessToken={() => authToken} />;
}
```

Customer server:

```js
app.post("/api/unpirator/playback", requireUser, async (req, res) => {
  const viewer = req.user;

  if (!viewer?.email) {
    return res.status(401).json({ error: { message: "Sign in required" } });
  }

  const lesson = await db.lesson.findFirst({
    where: { unpiratorPlaybackRef: req.body.playbackRef },
  });
  if (!lesson || !(await hasCourseAccess(viewer.id, lesson.courseId))) {
    return res.status(403).json({ error: { message: "Forbidden" } });
  }

  const deviceId = String(req.body.deviceId || "");
  if (deviceId.length < 8) {
    return res.status(400).json({ error: { message: "Stable deviceId is required" } });
  }

  const viewerIp = String(req.headers["x-forwarded-for"] || req.ip || "")
    .split(",")[0]
    .trim()
    .slice(0, 64);
  const viewerUserAgent = String(req.headers["user-agent"] || "").slice(0, 512);

  const upstream = await fetch(`${process.env.UNPIRATOR_API_URL}/v1/playback/sessions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.UNPIRATOR_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      siteId: process.env.UNPIRATOR_SITE_ID,
      assetId: req.body.playbackRef,
      email: viewer.email,
      deviceId,
      viewerIp,
      viewerUserAgent,
      client: req.body.client || {},
    }),
  });

  const data = await upstream.json();
  res.set("Cache-Control", "no-store");
  return res.status(upstream.status).json(data);
});
```

Do not forward `req.body.email` even if the browser sends it.

## Firebase authentication

The React player can send a Firebase ID token:

```jsx
<UnpiratorPlayer playbackRef={playbackRef} getAccessToken={() => firebaseUser.getIdToken()} />
```

The customer server verifies that token with Firebase Admin SDK, reads the verified user's email,
checks entitlement, and then calls Unpirator. The email is not trusted merely because Firebase
client JavaScript placed it in request JSON.

## PHP / Laravel

Browser/template:

```html
<unpirator-player
  playback-ref="<?= htmlspecialchars($playbackRef) ?>"
  endpoint="/api/unpirator/playback"
>
</unpirator-player>
```

Laravel-style endpoint core:

```php
public function playback(Request $request) {
    $viewer = $request->user();
    abort_unless($viewer && $viewer->email, 401);

    $lesson = Lesson::where(
        'unpirator_playback_ref',
        $request->input('playbackRef')
    )->first();

    abort_unless($lesson && $viewer->canWatch($lesson), 403);

    $deviceId = (string) $request->input('deviceId', '');
    abort_unless(strlen($deviceId) >= 8, 400, 'Stable deviceId is required');

    $payload = [
        'siteId' => env('UNPIRATOR_SITE_ID'),
        'assetId' => $request->input('playbackRef'),
        'email' => strtolower($viewer->email),
        'deviceId' => $deviceId,
        'viewerIp' => $request->ip(),
        'viewerUserAgent' => (string) $request->userAgent(),
        'client' => is_array($request->input('client'))
            ? $request->input('client')
            : [],
    ];

    $response = Http::withToken(env('UNPIRATOR_API_KEY'))
        ->post(rtrim(env('UNPIRATOR_API_URL'), '/') . '/v1/playback/sessions', $payload);

    return response($response->body(), $response->status())
        ->header('Content-Type', 'application/json')
        ->header('Cache-Control', 'no-store');
}
```

## Django / Flask

Django endpoint core:

```python
import json
import os
import requests
from django.http import JsonResponse
from django.views.decorators.http import require_POST

@require_POST
def unpirator_playback(request):
    if not request.user.is_authenticated or not request.user.email:
        return JsonResponse({"error": {"message": "Sign in required"}}, status=401)

    body = json.loads(request.body or "{}")
    playback_ref = str(body.get("playbackRef", ""))
    device_id = str(body.get("deviceId", ""))

    if len(device_id) < 8:
        return JsonResponse(
            {"error": {"message": "Stable deviceId is required"}},
            status=400,
        )

    lesson = Lesson.objects.filter(
        unpirator_playback_ref=playback_ref
    ).first()

    if not lesson or not has_course_access(request.user, lesson):
        return JsonResponse({"error": {"message": "Forbidden"}}, status=403)

    viewer_ip = (
        request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
        or request.META.get("REMOTE_ADDR", "")
    )
    viewer_user_agent = request.META.get("HTTP_USER_AGENT", "")

    upstream = requests.post(
        f'{os.environ["UNPIRATOR_API_URL"].rstrip("/")}/v1/playback/sessions',
        headers={"Authorization": f'Bearer {os.environ["UNPIRATOR_API_KEY"]}'},
        json={
            "siteId": os.environ["UNPIRATOR_SITE_ID"],
            "assetId": playback_ref,
            "email": request.user.email.lower(),
            "deviceId": device_id,
            "viewerIp": viewer_ip,
            "viewerUserAgent": viewer_user_agent,
            "client": body.get("client") if isinstance(body.get("client"), dict) else {},
        },
        timeout=15,
    )

    response = JsonResponse(upstream.json(), status=upstream.status_code)
    response["Cache-Control"] = "no-store"
    return response
```

## Direct JavaScript SDK

```js
import { mountProtectedPlayer } from "@unpirator/player";
import { createPlaybackBootstrap } from "@unpirator/sdk-js";

const player = await mountProtectedPlayer({
  element: document.querySelector("#player"),
  bootstrap: createPlaybackBootstrap({
    endpoint: "/api/unpirator/playback",
    playbackRef,
  }),
  onError: console.error,
});
```

The direct SDK still calls a customer-controlled same-origin endpoint. It never makes browser
viewer identity authoritative.

## Dynamic watermark

When the plan enables dynamic watermarking:

```text
customer authenticated email
  -> server-authorized Unpirator session
  -> watermark policy
  -> protected player canvas
  -> viewer@example.com • sessionCode
```

The customer does not send the watermark label from browser code. Unpirator chooses it from the
trusted session identity.

## Viewer data stored by Unpirator

Unpirator intentionally does not copy the customer's user profile. It stores the minimum linkage
needed for playback/security operations:

- keyed HMAC lookup derived from normalized email;
- application-encrypted email;
- internal viewer record UUID;
- device IDs and device metadata;
- video/session/security event relationships.

Customer passwords, profile fields and unrelated account data are not part of the playback
identity model.

## Security checklist

- Keep `UNPIRATOR_API_KEY` only in server secret storage.
- Authenticate the customer viewer on every playback bootstrap.
- Resolve email from server-side auth/session state.
- Require the SDK device ID.
- Check course/video entitlement before creating an Unpirator session.
- Ignore browser `email`, `currentUser`, `externalUserId` and `displayLabel` fields.
- Derive viewer IP/user-agent server-side.
- Keep the player endpoint same-origin.
- Use HTTPS.
- Return `Cache-Control: no-store`.
- Never log API keys, signed playback URLs or playback tokens.
- Avoid logging decrypted viewer email unless operationally necessary and access-controlled.
- Treat Security Center events as evidence with context, not automatic proof of piracy.

## Errors

| Result                      | Meaning                                                       |
| --------------------------- | ------------------------------------------------------------- |
| `400 VALIDATION_ERROR`      | Required session field is missing or malformed                |
| `400 DEVICE_ID_REQUIRED`    | Stable device ID was not provided                             |
| `401 VIEWER_EMAIL_REQUIRED` | Customer server did not resolve an authenticated viewer email |
| `401`                       | Workspace API key or customer authentication is invalid       |
| `403 CONTENT_ACCESS_DENIED` | Customer authorization rejected the content                   |
| `403`                       | Site/origin/feature/viewer/device policy rejected playback    |
| `404`                       | Site/asset/provider resource is missing                       |
| `409`                       | Concurrency or state conflict                                 |
| `429`                       | Rate or quota policy reached                                  |

## Release

Package versions are immutable on npm. The repository workflow
`.github/workflows/publish-npm-packages.yml` publishes packages in dependency order after versions
are bumped and tests pass. Verify the npm release before telling customers to install a new
version.
