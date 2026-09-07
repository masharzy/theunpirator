CREATE TABLE IF NOT EXISTS account_mfa_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'totp',
  encrypted_secret text NOT NULL,
  verified_at timestamptz,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE(account_id, type)
);

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mfa_recovery_codes_account_idx ON mfa_recovery_codes(account_id);
