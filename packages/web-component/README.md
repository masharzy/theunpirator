# @unpirator/web-component

Universal protected player for HTML, PHP, Django, Laravel, WordPress, and browser frameworks.

```html
<script type="module" src="https://esm.sh/@unpirator/web-component@0.1.0"></script>
<unpirator-player
  src="https://www.youtube.com/watch?v=VIDEO_ID"
  endpoint="/api/unpirator/playback"
></unpirator-player>
```

The endpoint must create sessions using the server-side workspace API key. Never place the key in
HTML or browser JavaScript.

See the [complete integration guide](https://github.com/masharzy/theunpirator/blob/main/docs/PACKAGE-INTEGRATION.md).
