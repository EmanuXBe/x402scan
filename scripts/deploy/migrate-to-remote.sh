#!/usr/bin/env bash
#
# Move the local StellarScan databases to a remote deployment.
#
#   scripts/deploy/migrate-to-remote.sh "$REMOTE_SCAN_URL" "$REMOTE_TRANSFERS_URL"
#
# Both arguments are full postgres:// connection strings. The transfers target
# MUST be TimescaleDB — every dashboard aggregate is a Timescale materialized
# view, so a plain Postgres will accept the schema and then fail on the views.
#
# What this moves:
#   scan      — the service registry (origins, resources, accepts), including the
#               four Stellar services resolved through SEP-1
#   transfers — 2,540 indexed Stellar mainnet payments, plus the materialized
#               views they feed
#
# Re-runnable: each load drops and recreates its target schema.

set -euo pipefail

SCAN_TARGET="${1:?pass the remote scan database URL as the first argument}"
TRANSFERS_TARGET="${2:?pass the remote transfers database URL as the second argument}"

LOCAL_SCAN="${LOCAL_SCAN_URL:-postgresql://$(whoami)@localhost:5432/x402scan_scan}"
LOCAL_TRANSFERS="${LOCAL_TRANSFERS_URL:-postgresql://postgres:postgres@localhost:5433/x402scan_transfers}"

DUMP_DIR="$(mktemp -d)"
trap 'rm -rf "$DUMP_DIR"' EXIT

echo "==> Verifying the transfers target is TimescaleDB"
if ! psql "$TRANSFERS_TARGET" -tAc \
  "SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb'" | grep -q 1; then
  echo "ERROR: timescaledb is not available on the transfers target." >&2
  echo "       The dashboard aggregates are Timescale materialized views and" >&2
  echo "       will not build on stock Postgres. Use a Timescale image." >&2
  exit 1
fi
psql "$TRANSFERS_TARGET" -qc "CREATE EXTENSION IF NOT EXISTS timescaledb;"

echo "==> Dumping local databases"
# --no-owner / --no-acl so the dump restores under whatever role the host gives
# us, which is never the local one.
pg_dump --no-owner --no-acl --clean --if-exists \
  --file "$DUMP_DIR/scan.sql" "$LOCAL_SCAN"
pg_dump --no-owner --no-acl --clean --if-exists \
  --file "$DUMP_DIR/transfers.sql" "$LOCAL_TRANSFERS"

echo "    scan:      $(wc -l < "$DUMP_DIR/scan.sql") lines"
echo "    transfers: $(wc -l < "$DUMP_DIR/transfers.sql") lines"

echo "==> Loading scan"
psql "$SCAN_TARGET" -v ON_ERROR_STOP=1 -q -f "$DUMP_DIR/scan.sql"

echo "==> Loading transfers"
# ON_ERROR_STOP is deliberately off here. A Timescale dump replays hypertable
# and materialized-view definitions that the extension partly recreates itself,
# so benign "already exists" noise is expected; the row counts below are the
# real check.
psql "$TRANSFERS_TARGET" -q -f "$DUMP_DIR/transfers.sql" 2>&1 | grep -vi "already exists" || true

echo "==> Refreshing materialized views"
psql "$TRANSFERS_TARGET" -tAc \
  "SELECT format('REFRESH MATERIALIZED VIEW %I.%I;', schemaname, matviewname) FROM pg_matviews" \
  | psql "$TRANSFERS_TARGET" -q -f -

echo "==> Verifying"
LOCAL_COUNT=$(psql "$LOCAL_TRANSFERS" -tAc \
  "SELECT count(*) FROM \"TransferEvent\" WHERE chain='stellar'")
REMOTE_COUNT=$(psql "$TRANSFERS_TARGET" -tAc \
  "SELECT count(*) FROM \"TransferEvent\" WHERE chain='stellar'")
REMOTE_NULL=$(psql "$TRANSFERS_TARGET" -tAc \
  "SELECT count(*) FROM \"TransferEvent\" WHERE chain='stellar' AND log_index IS NULL")
REMOTE_SERVICES=$(psql "$SCAN_TARGET" -tAc \
  "SELECT count(*) FROM \"Accepts\" WHERE network::text='stellar'")

echo "    Stellar payments  local=$LOCAL_COUNT  remote=$REMOTE_COUNT"
echo "    NULL log_index    remote=$REMOTE_NULL (must be 0)"
echo "    Stellar services  remote=$REMOTE_SERVICES"

if [ "$LOCAL_COUNT" != "$REMOTE_COUNT" ] || [ "$REMOTE_NULL" != "0" ]; then
  echo "MISMATCH — do not point the app at this database yet." >&2
  exit 1
fi

echo "==> Done. Remote matches local."
