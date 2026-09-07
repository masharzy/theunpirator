-- Section 4 + 5: data-driven plans, manual payments and customer console.

ALTER TABLE plans ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_minor integer;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'BDT';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS billing_interval text NOT NULL DEFAULT 'month';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS duration_days integer NOT NULL DEFAULT 30;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 14;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS badge text;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE TABLE IF NOT EXISTS payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL UNIQUE,
  display_name text NOT NULL,
  account_number text NOT NULL,
  account_name text,
  account_type text,
  instructions text,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  min_amount_minor integer,
  max_amount_minor integer,
  created_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_methods_enabled_order_idx
  ON payment_methods(enabled, sort_order);

CREATE TABLE IF NOT EXISTS payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  plan_id text NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  payment_method_id uuid NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
  plan_name_snapshot text NOT NULL,
  amount_minor_snapshot integer NOT NULL,
  currency_snapshot text NOT NULL,
  duration_days_snapshot integer NOT NULL,
  sender_number text NOT NULL,
  transaction_id text NOT NULL,
  proof_reference text,
  customer_note text,
  status text NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  rejection_reason text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payment_method_id, transaction_id)
);
CREATE INDEX IF NOT EXISTS payment_requests_tenant_created_idx
  ON payment_requests(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_requests_status_created_idx
  ON payment_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  action_url text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_account_created_idx
  ON notifications(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_tenant_created_idx
  ON notifications(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  name text NOT NULL,
  encrypted_config text NOT NULL,
  status text NOT NULL DEFAULT 'configured',
  last_test_at timestamptz,
  last_success_at timestamptz,
  last_error_code text,
  created_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);
CREATE INDEX IF NOT EXISTS provider_connections_tenant_provider_idx
  ON provider_connections(tenant_id, provider);

ALTER TABLE assets ADD COLUMN IF NOT EXISTS connection_id uuid
  REFERENCES provider_connections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS assets_connection_idx ON assets(connection_id);

CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'Asia/Dhaka',
  default_security_policy text NOT NULL DEFAULT 'strict',
  notification_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer',
  token_hash text NOT NULL UNIQUE,
  invited_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_invitations_tenant_email_idx
  ON tenant_invitations(tenant_id, email);

UPDATE plans
SET description = COALESCE(description, CASE id
      WHEN 'starter' THEN 'Essential protected playback for smaller teams.'
      WHEN 'pro' THEN 'More capacity and controls for growing platforms.'
      WHEN 'business' THEN 'Higher limits and advanced security for larger operations.'
      ELSE name
    END),
    currency = COALESCE(currency, 'BDT'),
    billing_interval = COALESCE(billing_interval, 'month'),
    duration_days = COALESCE(duration_days, 30),
    is_public = COALESCE(is_public, true),
    sort_order = CASE id WHEN 'starter' THEN 10 WHEN 'pro' THEN 20 WHEN 'business' THEN 30 ELSE sort_order END,
    updated_at = now()
WHERE id IN ('starter', 'pro', 'business');
