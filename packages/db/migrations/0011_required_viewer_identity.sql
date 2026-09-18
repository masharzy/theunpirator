-- Viewer email identity and the SDK device ID are required baseline security controls.
-- They are no longer optional plan entitlements.
UPDATE plans
SET entitlements = entitlements - 'device_tracking' - 'require_device_id'
WHERE entitlements ? 'device_tracking' OR entitlements ? 'require_device_id';
