-- Piracy monitoring: watchlists drive scheduled scans, findings dedupe by
-- normalized URL hash per tenant, takedown cases track notice progress.

CREATE TABLE IF NOT EXISTS piracy_watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  keywords jsonb DEFAULT '[]'::jsonb NOT NULL,
  telegram_channels jsonb DEFAULT '[]'::jsonb NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS piracy_watchlists_tenant_idx
  ON piracy_watchlists (tenant_id);

CREATE TABLE IF NOT EXISTS piracy_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  watchlist_id uuid REFERENCES piracy_watchlists(id) ON DELETE SET NULL,
  source text NOT NULL,
  url text NOT NULL,
  url_hash text NOT NULL,
  title text,
  snippet text,
  matched_keywords jsonb DEFAULT '[]'::jsonb NOT NULL,
  status text DEFAULT 'active' NOT NULL,
  first_seen_at timestamptz DEFAULT now() NOT NULL,
  last_seen_at timestamptz DEFAULT now() NOT NULL,
  last_checked_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS piracy_findings_tenant_url_uq
  ON piracy_findings (tenant_id, url_hash);

CREATE INDEX IF NOT EXISTS piracy_findings_tenant_status_idx
  ON piracy_findings (tenant_id, status);

CREATE INDEX IF NOT EXISTS piracy_findings_watchlist_idx
  ON piracy_findings (watchlist_id);

CREATE TABLE IF NOT EXISTS takedown_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  finding_id uuid NOT NULL REFERENCES piracy_findings(id) ON DELETE CASCADE,
  platform text NOT NULL,
  status text DEFAULT 'detected' NOT NULL,
  notice_channel text,
  notice_sent_at timestamptz,
  resolved_at timestamptz,
  notes text,
  created_by_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS takedown_cases_finding_platform_uq
  ON takedown_cases (finding_id, platform);

CREATE INDEX IF NOT EXISTS takedown_cases_tenant_status_idx
  ON takedown_cases (tenant_id, status);
