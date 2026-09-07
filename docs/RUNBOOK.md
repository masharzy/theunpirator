# Operations Runbook

## Global playback incident

1. Disable new playback via platform feature flag or API maintenance switch.
2. Keep existing sessions alive if safe.
3. Inspect API/gateway request IDs and provider health.
4. Revoke compromised sessions or API keys.
5. Rotate signing keys when compromise is suspected.

## Provider incident

Set provider health to `DEGRADED` or `DISABLED`; do not deploy a code change merely to stop a provider. Restricted providers additionally have a global environment kill switch.

## Signing-key rotation

1. Generate a new Ed25519 key pair.
2. Add it to the key ring with a new `kid`.
3. Distribute the new public-key ring to gateway.
4. Switch `ACTIVE_SIGNING_KID` on API.
5. Keep previous public key through maximum token TTL.
6. Remove old private material.

## Database restore drill

At regular intervals restore a backup into an isolated database, run migrations, execute smoke tests, and record the result. A backup that has never been restored is not considered verified.
