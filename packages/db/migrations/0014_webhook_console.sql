ALTER TABLE webhook_endpoints
  ADD COLUMN IF NOT EXISTS name text;

UPDATE webhook_endpoints
SET name = 'Endpoint ' || substr(id::text, 1, 8)
WHERE name IS NULL;

ALTER TABLE webhook_endpoints
  ALTER COLUMN name SET NOT NULL;

ALTER TABLE webhook_endpoints
  ALTER COLUMN name SET DEFAULT 'Webhook endpoint';

CREATE INDEX IF NOT EXISTS webhook_deliveries_endpoint_created_idx
  ON webhook_deliveries (endpoint_id, created_at DESC);

CREATE INDEX IF NOT EXISTS webhook_deliveries_endpoint_status_created_idx
  ON webhook_deliveries (endpoint_id, status, created_at DESC);
