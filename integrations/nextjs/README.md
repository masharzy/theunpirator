# @unpirator/integration-nextjs

Server-side playback session helpers for Next.js App Router.

```js
import { createUnpiratorPlaybackHandler } from "@unpirator/integration-nextjs";

export const POST = createUnpiratorPlaybackHandler({
  apiUrl: process.env.UNPIRATOR_API_URL,
  apiKey: process.env.UNPIRATOR_API_KEY,
  siteId: process.env.UNPIRATOR_SITE_ID,
});
```

Add `resolveViewer` to authorize signed-in viewers. Keep every configuration value server-side.

See the [complete integration guide](https://github.com/masharzy/theunpirator/blob/main/docs/PACKAGE-INTEGRATION.md).
