# @unpirator/web-component

Universal protected player for HTML, PHP, Django, Laravel, WordPress and browser frameworks.

```html
<script type="module" src="https://esm.sh/@unpirator/web-component@0.2.0"></script>
<unpirator-player
  playback-ref="YOUR_PLAYBACK_REF"
  endpoint="/api/unpirator/playback"
></unpirator-player>
```

The component generates/sends the stable device ID automatically. It intentionally has no viewer
email attribute or trusted browser identity property. The same-origin endpoint must authenticate the
viewer, resolve their email on the server, authorize the content, and call Unpirator with the
server-side workspace API key.

Never place the workspace API key or a trusted viewer email in HTML attributes or public JavaScript.

See the [complete integration guide](https://github.com/masharzy/theunpirator/blob/main/docs/PACKAGE-INTEGRATION.md).
