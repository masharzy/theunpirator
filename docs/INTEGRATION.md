# Customer Integration

1. Customer signs up and creates a site.
2. Customer publishes the TXT record shown by `/v1/sites/:siteId/domains` and verifies it.
3. Customer registers an authorized asset/provider and allowed origin hosts.
4. Customer owner creates a `playback:create` API key.
5. Customer backend verifies that its own user purchased/can access the course.
6. Customer backend calls The Unpirator `/v1/playback/sessions`.
7. Browser receives only the returned gateway URL/token, never the customer API key or provider credential.
8. Universal player handles HLS authorization headers, watermark movement, heartbeat and grant refresh.

For highest browser compatibility with short-lived grants, HLS plus a customer-branded/same-site media domain is preferred over a raw MP4 element with a long-lived query token.
