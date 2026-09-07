CREATE TABLE IF NOT EXISTS restricted_integration_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  eligibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  reason text,
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, provider)
);
CREATE INDEX IF NOT EXISTS restricted_integration_status_idx ON restricted_integration_access(status, updated_at DESC);
