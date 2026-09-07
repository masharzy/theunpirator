CREATE TABLE IF NOT EXISTS tenant_support_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  author_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL, body text NOT NULL,
  edited_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_support_notes_tenant_created_idx ON tenant_support_notes(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE,
  reason text NOT NULL, expires_at timestamptz NOT NULL, ended_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_impersonation_active_idx ON admin_impersonation_sessions(admin_account_id, expires_at);
