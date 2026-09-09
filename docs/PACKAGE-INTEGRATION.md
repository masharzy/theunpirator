# Package integration

The browser never receives the workspace API key. Every integration has two parts: a same-origin
customer endpoint that creates playback sessions, and a player component that calls that endpoint.

## Next.js server route

Install the server helper and React component:

```bash
pnpm add @unpirator/integration-nextjs @unpirator/react
```

Set server-only variables. Do not prefix the API key with `NEXT_PUBLIC_`.

```text
UNPIRATOR_API_URL=https://theunpirator.vercel.app/control-api
UNPIRATOR_API_KEY=up_live_...
UNPIRATOR_SITE_ID=...
```

Create `app/api/unpirator/playback/route.js`:

```js
import { createUnpiratorPlaybackHandler } from "@unpirator/integration-nextjs";
import { auth } from "@/auth";

export const POST = createUnpiratorPlaybackHandler({
  apiUrl: process.env.UNPIRATOR_API_URL,
  apiKey: process.env.UNPIRATOR_API_KEY,
  siteId: process.env.UNPIRATOR_SITE_ID,
  resolveViewer: async () => {
    const session = await auth();
    return session?.user
      ? { id: session.user.id, label: session.user.email || session.user.name }
      : null;
  },
});
```

Omit `resolveViewer` to allow anonymous playback. The helper creates a stable guest identity from
the player-generated device ID. Supplying `currentUser` in browser code is presentation metadata;
authorization always comes from `resolveViewer` on the server.

## React and Next.js player

```jsx
"use client";

import { UnpiratorPlayer } from "@unpirator/react";

export function LessonVideo({ youtubeUrl }) {
  return <UnpiratorPlayer src={youtubeUrl} />;
}
```

For Bunny, HLS, S3, R2, or direct assets registered in the dashboard, pass the asset UUID:

```jsx
<UnpiratorPlayer assetId="ASSET_UUID" />
```

Use `onReady`, `onError`, `poster`, `autoPlay`, `className`, and `style` as optional props.

## Plain HTML, PHP, Django, Laravel, or WordPress

Load the universal Web Component from an ESM CDN after the npm package is published:

```html
<script type="module" src="https://esm.sh/@unpirator/web-component@0.1.0"></script>

<unpirator-player
  src="https://www.youtube.com/watch?v=VIDEO_ID"
  endpoint="/api/unpirator/playback"
></unpirator-player>
```

For a registered provider asset:

```html
<unpirator-player asset-id="ASSET_UUID"></unpirator-player>
```

The server endpoint must call `POST /v1/playback/sessions` using the secret API key. It returns the
JSON response unchanged to the component. Verify the request comes from the same site, read the
logged-in viewer from the server session when available, and never accept an API key from the
browser.

The request body sent by the component is:

```json
{
  "src": "https://www.youtube.com/watch?v=VIDEO_ID",
  "deviceId": "browser-generated-stable-id",
  "client": { "browser": "...", "os": "..." }
}
```

## Publishing

The repository includes **Actions > Publish npm packages**. Before running it:

1. Create or obtain access to the `@unpirator` npm organization.
2. Add an npm automation token as the repository Actions secret `NPM_TOKEN`.
3. Confirm the five package versions are not already published.
4. Run the workflow manually.

Publishing order is core player, browser SDK, Web Component, React wrapper, then Next.js helper so
all workspace dependencies exist when consumers install them.
