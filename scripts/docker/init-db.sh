#!/usr/bin/env bash
set -euo pipefail

PG_VERSION="$(ls /etc/postgresql 2>/dev/null | head -1)"
PG_BIN="/usr/lib/postgresql/${PG_VERSION}/bin"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[init-db] Initializing PostgreSQL data directory at $PGDATA"
  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
  su postgres -c "$PG_BIN/initdb --auth-host=trust --auth-local=trust --encoding=UTF8 --locale=C -D $PGDATA"

  echo "host all all 0.0.0.0/0 trust" >> "$PGDATA/pg_hba.conf"
  echo "listen_addresses = '*'"        >> "$PGDATA/postgresql.conf"
fi

echo "[init-db] Starting Postgres for one-shot bootstrap..."
su postgres -c "$PG_BIN/pg_ctl -D $PGDATA -l /tmp/postgres-init.log -w start"

if ! su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='openlinear'\"" | grep -q 1; then
  echo "[init-db] Creating role + database 'openlinear'"
  su postgres -c "psql -c \"CREATE USER openlinear WITH SUPERUSER PASSWORD 'openlinear';\""
  su postgres -c "psql -c \"CREATE DATABASE openlinear OWNER openlinear;\""
fi

echo "[init-db] Stopping bootstrap Postgres..."
su postgres -c "$PG_BIN/pg_ctl -D $PGDATA -m fast -w stop"
