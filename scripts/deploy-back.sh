#!/usr/bin/env bash
# Deploys the EcoShopify backend in place (git pull -> npm ci -> prisma -> restart -> verify).
# Run ON THE VPS from the backend directory:   bash scripts/deploy-back.sh   (add --yes to skip the prompt)
# Override defaults with env vars, e.g.  APP_DIR=/home/x/backend PM2_NAME=api bash scripts/deploy-back.sh
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BRANCH="${BRANCH:-main}"
PM2_NAME="${PM2_NAME:-ecoshopify-backend}"
SYSTEMD_UNIT="${SYSTEMD_UNIT:-ecoshopify-backend}"
PORT="${PORT:-5000}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
KEEP_BACKUPS=10
STAMP="$(date +%Y%m%d-%H%M%S)"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

cd "$APP_DIR"

# ---------- 1. Pre-checks ----------
step "1/9 Pre-checks"
for cmd in git node npm curl; do command -v "$cmd" >/dev/null || die "$cmd not found"; done
[ -f package.json ] && [ -f server.js ] || die "$APP_DIR is not the backend directory"
[ -f .env ] || die ".env is missing in $APP_DIR"

env_value() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
for key in DATABASE_URL JWT_SECRET; do
  [ -n "$(env_value "$key")" ] || die "$key is not set in .env"
done
[ "$(env_value JWT_SECRET)" != "dev-secret-change-me" ] || die "JWT_SECRET is still the dev default"
[ "$(env_value NODE_ENV)" = "production" ] || echo "WARNING: NODE_ENV=production is not set in .env (CORS stays open)"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status --short
  die "Uncommitted changes on the server. Commit or stash them first."
fi

# Detect how the app runs: pm2 or systemd
RUNNER=""
if command -v pm2 >/dev/null && pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  RUNNER="pm2"
elif command -v systemctl >/dev/null && systemctl cat "$SYSTEMD_UNIT" >/dev/null 2>&1; then
  RUNNER="systemd"
else
  die "No pm2 process '$PM2_NAME' or systemd unit '$SYSTEMD_UNIT' found. Set PM2_NAME or SYSTEMD_UNIT."
fi
echo "Process manager: $RUNNER"

restart_app() {
  if [ "$RUNNER" = "pm2" ]; then pm2 restart "$PM2_NAME" --update-env && pm2 save
  else systemctl restart "$SYSTEMD_UNIT"; fi
}

# ---------- 2. Compare with GitHub ----------
step "2/9 Checking $BRANCH on GitHub"
PREV_SHA="$(git rev-parse HEAD)"
git fetch origin "$BRANCH"
NEW_SHA="$(git rev-parse "origin/$BRANCH")"
echo "Current: ${PREV_SHA:0:7}   Latest: ${NEW_SHA:0:7}"
if [ "$PREV_SHA" = "$NEW_SHA" ]; then
  echo "Already on the latest commit."
else
  git --no-pager log --oneline "$PREV_SHA..$NEW_SHA"
fi
if [ "${1:-}" != "--yes" ]; then
  read -r -p "Deploy now? [y/N] " ans
  [ "$ans" = "y" ] || [ "$ans" = "Y" ] || die "Cancelled"
fi

# ---------- 3. Database backup ----------
step "3/9 Backing up the database"
mkdir -p "$BACKUP_DIR"
if command -v pg_dump >/dev/null; then
  DB_URL="$(env_value DATABASE_URL | sed 's/?.*$//')"
  BACKUP_FILE="$BACKUP_DIR/db-$STAMP.sql.gz"
  pg_dump "$DB_URL" | gzip > "$BACKUP_FILE" || die "pg_dump failed; aborting before any change"
  echo "Backup: $BACKUP_FILE"
  ls -1t "$BACKUP_DIR"/db-*.sql.gz | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f --
else
  die "pg_dump not found; install postgresql-client or remove this check consciously"
fi

# ---------- 4. Pull ----------
step "4/9 Pulling code"
git merge --ff-only "origin/$BRANCH" || die "Cannot fast-forward; resolve on the server manually"

rollback() {
  echo "Rolling back code to ${PREV_SHA:0:7}"
  git reset --hard "$PREV_SHA"
  npm ci --omit=dev || true
  npx prisma generate || true
  restart_app || true
  echo "Database changes (if any) were NOT reverted. Backup: ${BACKUP_FILE:-none}"
}

# ---------- 5. Dependencies ----------
step "5/9 Installing dependencies"
npm ci || { rollback; die "npm ci failed"; }

# ---------- 6. Prisma ----------
step "6/9 Prisma generate + migrate deploy"
npx prisma generate || { rollback; die "prisma generate failed"; }
if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  npx prisma migrate deploy || { rollback; die "prisma migrate deploy failed"; }
else
  die "prisma/migrations is empty. Create it locally with: npx prisma migrate dev --name init, commit and push."
fi

# ---------- 7. Admin seed (only if requested) ----------
step "7/9 Admin seed"
if [ -n "$(env_value ADMIN_EMAIL)" ] && [ -n "$(env_value ADMIN_PASSWORD)" ]; then
  npm run seed || echo "WARNING: seed failed"
  echo "Reminder: remove ADMIN_PASSWORD from .env now that the admin exists."
else
  echo "ADMIN_EMAIL/ADMIN_PASSWORD not in .env; skipping."
fi

# ---------- 8. Restart ----------
step "8/9 Restarting"
restart_app

# ---------- 9. Verify ----------
step "9/9 Verifying"
ok=0
for _ in $(seq 1 15); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/"; then ok=1; break; fi
  sleep 2
done

if [ "$ok" = 1 ]; then
  # An empty body must give 400 (route exists); 404 means old code is still running.
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/api/auth/vendor/register" \
    -H 'Content-Type: application/json' -d '{}')"
  echo "POST /api/auth/vendor/register -> $code (expected 400)"
  [ "$code" = "400" ] || ok=0
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/products")"
  echo "GET  /api/products -> $code (expected 200)"
  [ "$code" = "200" ] || ok=0
fi

if [ "$ok" != 1 ]; then
  [ "$RUNNER" = "pm2" ] && pm2 logs "$PM2_NAME" --lines 40 --nostream || journalctl -u "$SYSTEMD_UNIT" -n 40 --no-pager || true
  rollback
  die "Verification failed; code rolled back to ${PREV_SHA:0:7}"
fi

echo
echo "Backend deployed: ${PREV_SHA:0:7} -> $(git rev-parse --short HEAD)"
