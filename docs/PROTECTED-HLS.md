# Protected HLS transport

Assets using the `hls` provider, and Bunny/S3/R2 assets whose reference ends in `.m3u8`, use the protected HLS transport.

## Request flow

1. The authenticated customer backend creates a playback session.
2. The player creates a non-exportable RSA-OAEP key pair and sends only its public key to `/bootstrap`.
3. The gateway creates a random session AES-GCM key, wraps it for that browser session, and stores the server copy in session state.
4. Hls.js asks the custom loader for a playlist, key, initialization section, or media segment.
5. The loader obtains a short-lived, one-time ticket bound to that resource.
6. The gateway validates the session, viewer origin, recent integrity heartbeat, ticket, mapped origin host, and optional byte range.
7. The gateway fetches the authorized origin resource and returns an AES-GCM ciphertext with unique IV and authenticated context.
8. The player decrypts it in memory and passes the result directly to Hls.js.

The legacy plaintext `/media` and `/hls/:objectId` paths reject protected HLS assets. Captured network responses therefore contain encrypted bytes rather than reusable media segments.

## Source requirements

- Individual HLS resources must be no larger than 16 MB.
- The origin must support HTTPS and all manifest hosts must appear in the asset allowlist.
- Live and VOD playlists are supported. Byte-range playlists preserve the declared ranges.
- Progressive MP4 is not a segmented streaming format. Under `strict` or `maximum` policy it returns `PROTECTED_SOURCE_REQUIRED`. Convert it to HLS/fMP4 during ingest. Native MP4 remains available only with the explicit `standard` policy and is not download-protected.

This raises the cost of copying and blocks ordinary download managers. As with all browser playback, a modified browser can capture decrypted buffers or decoded frames; forensic watermarking and abuse controls remain necessary.
