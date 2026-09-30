-- Viewer policy overrides: tenants choose their own devices-per-viewer and
-- concurrent-stream limits within the ceilings their plan allows. NULL falls
-- back to the plan values.

ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS device_limit_override integer;

ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS stream_limit_override integer;

ALTER TABLE tenant_settings
  DROP CONSTRAINT IF EXISTS tenant_settings_device_limit_override_check;

ALTER TABLE tenant_settings
  DROP CONSTRAINT IF EXISTS tenant_settings_stream_limit_override_check;

ALTER TABLE tenant_settings
  ADD CONSTRAINT tenant_settings_device_limit_override_check
  CHECK (device_limit_override IS NULL OR device_limit_override >= 1);

ALTER TABLE tenant_settings
  ADD CONSTRAINT tenant_settings_stream_limit_override_check
  CHECK (stream_limit_override IS NULL OR stream_limit_override >= 1);
