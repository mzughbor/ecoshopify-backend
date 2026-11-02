# Prisma + backend on the same VPS (production setup)

This guide explains how to set up PostgreSQL, Prisma, and the EcoShopify backend on the same Linux VPS so the app can connect to a local database and create the schema without permission issues.

## 1) Install PostgreSQL on the VPS

On Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
```

Verify the server is running:

```bash
sudo systemctl status postgresql
```

If it is not active:

```bash
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

## 2) Create the PostgreSQL role and database

The app has to be able to create tables in the database. The safest production pattern is to make the app user the owner of its database.

```bash
sudo -u postgres psql
```

Inside the PostgreSQL shell:

```sql
CREATE ROLE malex_user WITH LOGIN PASSWORD 'replace_with_strong_password';
CREATE DATABASE echoshopify_db OWNER malex_user;
GRANT ALL PRIVILEGES ON DATABASE echoshopify_db TO malex_user;
\q
```

If the database already exists, repair ownership like this:

```bash
sudo -u postgres psql -d echoshopify_db -c "ALTER DATABASE echoshopify_db OWNER TO malex_user;"
sudo -u postgres psql -d echoshopify_db -c "GRANT ALL PRIVILEGES ON DATABASE echoshopify_db TO malex_user;"
sudo -u postgres psql -d echoshopify_db -c "GRANT ALL ON SCHEMA public TO malex_user;"
sudo -u postgres psql -d echoshopify_db -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO malex_user;"
```

Important: the Prisma app user must have CREATE privileges on the target schema. Without that, Prisma will fail with errors like:

```text
The table public.users does not exist
```

or:

```text
permission denied for database echoshopify_db
```

## 3) Configure the backend environment

In the backend project root, update the `.env` file:

```env
PORT=5000
JWT_SECRET=replace_with_a_long_random_secret
DATABASE_URL="postgresql://malex_user:replace_with_strong_password@localhost:5432/echoshopify_db?schema=public"
```

The key points are:

- `localhost` is fine when PostgreSQL and the backend are on the same VPS
- the app user must be the DB owner or otherwise have `CREATE` rights in `public`
- `schema=public` matches the Prisma schema definition

## 4) Install backend dependencies

From the backend repo:

```bash
cd /path/to/ecoshopfiy-backend
npm install
```

## 5) Push the Prisma schema to the database

Run this to initialize the tables for the app:

```bash
npx prisma db push
```

If you prefer migrations:

```bash
npx prisma migrate dev --name init
```

A production VPS usually uses:

```bash
npx prisma migrate deploy
```

after the migrations are prepared and checked in.

## 6) Start the backend as a service

Use a service manager such as `systemd`. Create a service file:

```bash
sudo nano /etc/systemd/system/ecoshopify-backend.service
```

Example content:

```ini
[Unit]
Description=EcoShopify backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/ecoshopfiy-backend
Environment=NODE_ENV=production
EnvironmentFile=/path/to/ecoshopfiy-backend/.env
ExecStart=/usr/bin/node /path/to/ecoshopfiy-backend/server.js
Restart=always
RestartSec=5
User=asd
Group=asd

[Install]
WantedBy=multi-user.target
```

Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ecoshopify-backend
sudo systemctl start ecoshopify-backend
sudo systemctl status ecoshopify-backend
```

## 7) Verify the backend is connected to Prisma

Check the API root:

```bash
curl http://localhost:5000/
```

You should receive a JSON success response from the backend.

Then test registration:

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "secret123",
    "role": "CUSTOMER"
  }'
```

If it works, the Prisma schema was created successfully and the app can write to the database.

## 8) Security notes for production

- Put all secrets in `.env` and do not commit them to Git
- Use a strong `JWT_SECRET`
- Use a dedicated PostgreSQL user for the app instead of the default postgres account
- Restrict PostgreSQL to local network access if the app and DB live on the same VPS
- Prefer `openssl rand -hex 32` for secrets
- Consider an HTTPS reverse proxy (Nginx/Apache/Caddy) in front of the Node app
- Use `httpOnly` cookies for JWTs in production if you want stronger browser-side security

## 9) Production-safe PostgreSQL command summary

The shortest working fix for a broken local Prisma setup is:

```bash
sudo -u postgres psql -c "CREATE ROLE malex_user WITH LOGIN PASSWORD 'strong-password';"
sudo -u postgres psql -d postgres -c "CREATE DATABASE echoshopify_db OWNER malex_user;"
sudo -u postgres psql -d echoshopify_db -c "GRANT ALL PRIVILEGES ON DATABASE echoshopify_db TO malex_user;"
sudo -u postgres psql -d echoshopify_db -c "GRANT ALL ON SCHEMA public TO malex_user;"
cd /path/to/ecoshopfiy-backend
npx prisma db push
```

If Prisma still says the table is missing, confirm the database user owns the database and has `CREATE` rights on `public`.

## 10) Troubleshooting

### Permission denied for database

Run:

```bash
sudo -u postgres psql -d echoshopify_db -c "ALTER DATABASE echoshopify_db OWNER TO malex_user;"
```

### Table does not exist

Run:

```bash
cd /path/to/ecoshopfiy-backend
npx prisma db push
```

### Prisma client not generated

Run:

```bash
npx prisma generate
```

### Auth/register endpoint fails

Check:

- the database user has privileges
- the `.env` `DATABASE_URL` is correct
- the `public.users` table exists
- the Prisma client is generated

This document is meant to be used for the same-server deployment pattern: the backend and PostgreSQL run on one VPS, and the app connects over `localhost` using Prisma.
