# @unpirator/player

Core protected playback runtime for The Unpirator. It manages media playback, short-lived grants,
refresh, heartbeat, watermarking, and session cleanup.

Version 0.1.3 adds seeking for protected segments, with independent audio/video
timelines and server-validated playback windows. Deploy the matching gateway
update before upgrading clients. Existing integrations keep the same props.

Application developers should normally install `@unpirator/react` or
`@unpirator/web-component` instead of mounting this low-level package directly.

See the [complete integration guide](https://github.com/masharzy/theunpirator/blob/main/docs/PACKAGE-INTEGRATION.md).
