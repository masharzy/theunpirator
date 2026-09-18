# @unpirator/sdk-js

Browser bootstrap helpers for The Unpirator protected player. Most React applications should use
`@unpirator/react`; custom integrations can combine this package with `@unpirator/player`.

```js
import { createPlaybackBootstrap } from "@unpirator/sdk-js";

const bootstrap = createPlaybackBootstrap({
  endpoint: "/api/unpirator/playback",
  playbackRef,
  getAccessToken: () => firebaseUser.getIdToken(),
});
```

The SDK creates a stable random device UUID in browser storage and sends only playback selection,
device/client context and customer-authentication headers to the customer's same-origin endpoint.
It does **not** send or accept a trusted viewer email. Your server endpoint must authenticate the
request, resolve the email from its own session or verified bearer token, authorize access, then
call Unpirator server-to-server.

`getAccessToken` sends an `Authorization: Bearer ...` header. Use asynchronous `getHeaders` for a
different authorization scheme. Static `headers` are also supported.

See the [complete integration guide](https://github.com/masharzy/theunpirator/blob/main/docs/PACKAGE-INTEGRATION.md).
