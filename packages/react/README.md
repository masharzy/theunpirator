# @unpirator/react

React and Next.js component for The Unpirator protected player.

```bash
npm install @unpirator/react @unpirator/integration-nextjs
```

```jsx
import { UnpiratorPlayer } from "@unpirator/react";

export function Video({ playbackRef, firebaseUser }) {
  return (
    <UnpiratorPlayer
      playbackRef={playbackRef}
      getAccessToken={() => firebaseUser.getIdToken()}
      onError={console.error}
    />
  );
}
```

The component calls `/api/unpirator/playback` by default. Create that same-origin server route with
`@unpirator/integration-nextjs`; never expose the workspace API key in browser code.

Viewer identity is deliberately absent from the React props. The customer's server must resolve the
authenticated viewer email and authorize the requested content. A browser-supplied email, user ID or
user object is not a trusted identity source.

Use `getAccessToken` for bearer authentication or asynchronous `getHeaders` for another customer
authentication scheme. The callback runs immediately before the session request, so refreshed
tokens are used.

See the [complete integration guide](https://github.com/masharzy/theunpirator/blob/main/docs/PACKAGE-INTEGRATION.md).
