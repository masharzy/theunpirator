# @unpirator/sdk-js

Browser bootstrap helpers for The Unpirator protected player. Most React applications should use
`@unpirator/react`; custom integrations can combine this package with `@unpirator/player`.

```js
import { createPlaybackBootstrap } from "@unpirator/sdk-js";

const bootstrap = createPlaybackBootstrap({
  endpoint: "/api/unpirator/playback",
  src: "https://www.youtube.com/watch?v=VIDEO_ID",
});
```

See the [complete integration guide](https://github.com/masharzy/theunpirator/blob/main/docs/PACKAGE-INTEGRATION.md).
