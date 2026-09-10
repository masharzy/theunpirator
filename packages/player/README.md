# @unpirator/player

Core protected playback runtime for The Unpirator. It manages media playback, short-lived grants,
refresh, heartbeat, watermarking, and session cleanup.

Version 0.1.3 adds seeking for protected segments, with independent audio/video
timelines and server-validated playback windows. Deploy the matching gateway
update before upgrading clients. Existing integrations keep the same props.

Version 0.1.4 adds a quality menu and Reload video button for protected segments.
Expired tokens are refreshed once across concurrent requests. After a long inactive
period, an expired refresh credential triggers the application's authenticated
bootstrap callback again, restoring the playback position and paused state.
The callback must verify current access on every call; revoked/blocked responses
are terminal. Recoverable playback failures stay inside the player instead of
calling a consumer's fatal `onError` handler.

The player retains roughly 45 seconds behind and 90 seconds ahead of the playhead;
seeking outside buffered ranges fetches authorized segments again. AES keys are
unwrapped directly into non-exportable Web Crypto keys. This is not DRM and does
not prevent a compromised browser from capturing decrypted media.

Application developers should normally install `@unpirator/react` or
`@unpirator/web-component` instead of mounting this low-level package directly.

See the [complete integration guide](https://github.com/masharzy/theunpirator/blob/main/docs/PACKAGE-INTEGRATION.md).

See [recovery, quality controls and security limits](https://github.com/masharzy/theunpirator/blob/main/docs/PLAYBACK-RECOVERY-SECURITY.md)
for deployment order and verification.
