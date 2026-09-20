ALTER TABLE playback_sessions
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revocation_reason text,
  ADD COLUMN IF NOT EXISTS revoked_by text,
  ADD COLUMN IF NOT EXISTS revocation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE playback_sessions
SET revoked_at = ended_at
WHERE status = 'revoked'
  AND revoked_at IS NULL;
