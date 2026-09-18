# @unpirator/player

Core protected playback runtime for The Unpirator. It manages short-lived grants, refresh,
heartbeat, protected segments/HLS, watermarking, integrity checks and session cleanup.

The player receives a server-authorized watermark policy in the playback-session response. When
dynamic watermarking is enabled, Unpirator renders the authenticated viewer email and a short
session code inside the protected player surface. Customer/browser code does not choose the trusted
watermark identity.

The protected surface uses a closed shadow root where supported and the integrity runtime watches
for removal, hiding or material opacity changes to the protected watermark. This increases
tamper-resistance, but browser-side controls are defense-in-depth rather than DRM.

The player retains roughly 45 seconds behind and 90 seconds ahead of the playhead; seeking outside
buffered ranges fetches authorized segments again. AES keys are unwrapped directly into
non-exportable Web Crypto keys.

Application developers should normally install `@unpirator/react` or
`@unpirator/web-component` instead of mounting this low-level package directly.

See the [complete integration guide](https://github.com/masharzy/theunpirator/blob/main/docs/PACKAGE-INTEGRATION.md)
and [recovery/security notes](https://github.com/masharzy/theunpirator/blob/main/docs/PLAYBACK-RECOVERY-SECURITY.md).
