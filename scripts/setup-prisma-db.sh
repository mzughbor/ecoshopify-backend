#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${DB_NAME:-echoshopify_db}"
DB_USER="${DB_USER:-malex_user}"
DB_PASSWORD="${DB_PASSWORD:-change-me-strong-password}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is not installed or not on PATH. Install PostgreSQL client tools first."
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required to create the database role and grant ownership."
  exit 1
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" 2>/dev/null | grep -q 1; then
  echo "Creating PostgreSQL role: ${DB_USER}"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${DB_PASSWORD}';"
else
  echo "Role already exists: ${DB_USER}"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${DB_PASSWORD}';"
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" 2>/dev/null | grep -q 1; then
  echo "Creating database: ${DB_NAME}"
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
else
  echo "Database already exists: ${DB_NAME}"
fi

sudo -u postgres psql -d "${DB_NAME}" -v ON_ERROR_STOP=1 -c "ALTER DATABASE \"${DB_NAME}\" OWNER TO \"${DB_USER}\";"
sudo -u postgres psql -d "${DB_NAME}" -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON DATABASE \"${DB_NAME}\" TO \"${DB_USER}\";"
sudo -u postgres psql -d "${DB_NAME}" -v ON_ERROR_STOP=1 -c "GRANT ALL ON SCHEMA public TO \"${DB_USER}\";"
sudo -u postgres psql -d "${DB_NAME}" -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"${DB_USER}\";"
sudo -u postgres psql -d "${DB_NAME}" -v ON_ERROR_STOP=1 -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO \"${DB_USER}\";"

cat <<EOF
Database setup complete.
Use this DATABASE_URL in your backend .env file:

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public"

Then run:
  npm install
  npx prisma db push
  npm run start
EOF
