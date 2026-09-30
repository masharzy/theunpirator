-- Admin-granted free trials. Trials never come from plans: an admin creates
-- an offer (plan + duration + audience) and eligible tenants claim it.

CREATE TABLE IF NOT EXISTS trial_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id text NOT NULL REFERENCES plans(id),
  duration_days integer NOT NULL CHECK (duration_days >= 1),
  audience text NOT NULL DEFAULT 'new_users'
    CHECK (audience IN ('everyone', 'new_users', 'user')),
  email text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  max_claims integer CHECK (max_claims IS NULL OR max_claims >= 1),
  claim_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trial_offers_status_idx ON trial_offers (status, audience);
