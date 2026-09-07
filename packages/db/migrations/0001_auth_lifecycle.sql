ALTER TABLE accounts ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_login_ip text;

CREATE TABLE IF NOT EXISTS account_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  kind text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_tokens_account_kind_idx ON account_tokens(account_id, kind);

CREATE TABLE IF NOT EXISTS oauth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_subject)
);
CREATE INDEX IF NOT EXISTS oauth_identities_account_idx ON oauth_identities(account_id);
