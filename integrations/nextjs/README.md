# @unpirator/integration-nextjs

Server-side playback authorization helpers for Next.js App Router.

Protected playback requires a trusted viewer email and a stable browser device ID. The browser SDK
creates the device ID automatically, but the email must be resolved from your authenticated
server-side session. The helper never accepts viewer identity from the request body.

```js
import { createUnpiratorPlaybackHandler } from "@unpirator/integration-nextjs";

export const POST = createUnpiratorPlaybackHandler({
  apiUrl: process.env.UNPIRATOR_API_URL,
  apiKey: process.env.UNPIRATOR_API_KEY,
  siteId: process.env.UNPIRATOR_SITE_ID,

  resolveViewer: async () => {
    const user = await requireAuthenticatedUser();
    return { email: user.email, id: user.id };
  },

  authorizePlayback: async ({ body, viewer }) => canViewPlayback(viewer.id, body.playbackRef),
});
```

The helper:

- rejects cross-site playback bootstrap requests;
- requires a device ID;
- resolves the viewer email only through `resolveViewer`;
- ignores browser-supplied email or user objects;
- derives viewer IP and user-agent from the incoming request;
- performs the customer authorization callback before creating the Unpirator session;
- returns playback authorization with `Cache-Control: no-store`.

Keep the Unpirator API key, site ID and customer authorization logic server-side.

See the [complete integration guide](https://github.com/masharzy/theunpirator/blob/main/docs/PACKAGE-INTEGRATION.md).
