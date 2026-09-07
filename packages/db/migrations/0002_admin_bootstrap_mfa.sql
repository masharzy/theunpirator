ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mfa_secret_encrypted text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mfa_confirmed_at timestamptz;
ALTER TABLE account_sessions ADD COLUMN IF NOT EXISTS mfa_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS platform_bootstrap_state (
  id text PRIMARY KEY DEFAULT 'platform',
  completed_at timestamptz,
  completed_by uuid REFERENCES accounts(id),
  bootstrap_version integer NOT NULL DEFAULT 1
);
