CREATE INDEX IF NOT EXISTS assets_tenant_created_idx
  ON assets (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS assets_tenant_status_created_idx
  ON assets (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS playback_sessions_tenant_started_idx
  ON playback_sessions (tenant_id, started_at DESC);

CREATE INDEX IF NOT EXISTS playback_sessions_tenant_status_started_idx
  ON playback_sessions (tenant_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS end_users_tenant_updated_idx
  ON end_users (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS end_users_tenant_status_updated_idx
  ON end_users (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS devices_tenant_last_seen_idx
  ON devices (tenant_id, last_seen_at DESC);
