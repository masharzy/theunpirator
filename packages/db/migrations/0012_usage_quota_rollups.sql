ALTER TABLE usage_rollups
  ALTER COLUMN quantity TYPE BIGINT
  USING quantity::bigint;
