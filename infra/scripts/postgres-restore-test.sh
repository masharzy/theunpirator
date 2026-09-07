#!/usr/bin/env sh
set -eu
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${1:?Pass path to .dump backup}"
pg_restore --clean --if-exists --no-owner --no-acl --dbname "$RESTORE_DATABASE_URL" "$1"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c "select count(*) as tenants from tenants;" -c "select count(*) as assets from assets;"
echo "Restore smoke test passed"
