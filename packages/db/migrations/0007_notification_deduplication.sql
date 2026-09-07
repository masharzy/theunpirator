ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_account_dedupe_uq ON notifications(account_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
