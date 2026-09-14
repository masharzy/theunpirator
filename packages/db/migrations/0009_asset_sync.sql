ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "external_content_id" text;
CREATE UNIQUE INDEX IF NOT EXISTS "assets_external_content_uq"
  ON "assets" ("tenant_id", "site_id", "external_content_id");
