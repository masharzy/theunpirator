# Media Providers

Provider adapters resolve **registered assets** into short-lived origin instructions inside the control plane. They never accept viewer-supplied arbitrary URLs.

- `direct`: customer-authorized HTTP(S) media origin
- `hls`: customer-authorized HLS manifest
- `s3`: Amazon S3 and S3-compatible stores, including R2 via endpoint configuration
- `bunny`: customer-authorized Bunny origin/pull-zone endpoint
- `restricted/youtube-custom`: deliberately disabled stub; no unofficial resolver/extractor logic is included

Every asset includes an `allowedHosts` list. The source manager rejects resolved URLs outside this list.
