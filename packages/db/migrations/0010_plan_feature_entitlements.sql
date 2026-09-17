-- Security behavior is now composed exclusively from plan entitlements.
ALTER TABLE assets DROP COLUMN IF EXISTS security_policy;
ALTER TABLE tenant_settings DROP COLUMN IF EXISTS default_security_policy;

UPDATE plans
SET entitlements = (
  entitlements - 'max_security_policy' - 'advanced_security'
) || jsonb_build_object(
  'secure_gateway', COALESCE((entitlements->>'secure_gateway')::boolean, true),
  'protected_delivery', COALESCE((entitlements->>'protected_delivery')::boolean, true),
  'player_integrity', COALESCE((entitlements->>'player_integrity')::boolean, true),
  'secure_browser_restriction', COALESCE((entitlements->>'secure_browser_restriction')::boolean, true),
  'dynamic_watermark', COALESCE((entitlements->>'dynamic_watermark')::boolean, true),
  'device_tracking', COALESCE((entitlements->>'device_tracking')::boolean, true),
  'require_device_id', COALESCE((entitlements->>'require_device_id')::boolean, false),
  'device_control', COALESCE((entitlements->>'device_control')::boolean, true),
  'concurrent_stream_control', COALESCE((entitlements->>'concurrent_stream_control')::boolean, true),
  'webhooks', COALESCE((entitlements->>'webhooks')::boolean, true),
  'youtube_custom', COALESCE((entitlements->>'youtube_custom')::boolean, false)
);
