# @unpirator/react

React and Next.js component for The Unpirator protected player.

```bash
npm install @unpirator/react @unpirator/integration-nextjs
```

```jsx
import { UnpiratorPlayer } from "@unpirator/react";

export function Video({ youtubeUrl }) {
  return <UnpiratorPlayer src={youtubeUrl} onError={console.error} />;
}
```

The component calls `/api/unpirator/playback` by default. Create that same-origin server route with
`@unpirator/integration-nextjs`; never expose the workspace API key in browser code.

See the [complete integration guide](https://github.com/masharzy/theunpirator/blob/main/docs/PACKAGE-INTEGRATION.md).
