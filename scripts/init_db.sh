#!/usr/bin/env bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export LC_ALL="en_US.UTF-8"
export LANG="en_US.UTF-8"

echo "=== Initializing PostgreSQL Database for AI Agent Workflow Builder ==="

# Check if postgres service is running or start local cluster
DB_PATH="/opt/homebrew/var/postgresql@16"

if [ ! -d "$DB_PATH" ]; then
  echo "Initializing PostgreSQL database cluster at $DB_PATH..."
  initdb --locale=C -E UTF-8 "$DB_PATH"
fi

# Start postgres in background if not running
if ! pg_isready -q; then
  echo "Starting PostgreSQL background service..."
  pg_ctl -D "$DB_PATH" -l "$DB_PATH/server.log" start || true
  sleep 2
fi

# Create database vocalls_db if it doesn't exist
psql postgres -tAc "SELECT 1 FROM pg_database WHERE datname='vocalls_db'" | grep -q 1 || psql postgres -c "CREATE DATABASE vocalls_db;"

echo "Running DDL Migrations..."
psql vocalls_db -f "$(dirname "$0")/../hasura/migrations/01_init_schema.sql"

echo "Populating Seed Data..."
psql vocalls_db -f "$(dirname "$0")/../hasura/seeds/01_seed_data.sql"

echo "=== PostgreSQL Setup Complete! ==="
