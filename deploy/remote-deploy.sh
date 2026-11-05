#!/usr/bin/env bash
# Runs on the EC2 server, called by .github/workflows/ci-cd.yml after it has unpacked a release
# (with its .env.production) into /tmp/gamereels-release-<release>.
#
#   bash /tmp/gamereels-release-<release>/deploy/remote-deploy.sh <release>
#
# Layout under APP_DIR (default ~/gamereels-api):
#   releases/<release>/     one folder per deploy (the newest KEEP_RELEASES are kept)
#   shared/.env.production  the env file, replaced on every deploy
#   current -> releases/<release>
#
# Steps: install deps, run migrations (and the seed if SEED_ON_DEPLOY=true), point `current`
# at the new release, reload PM2, and wait for /health/ready. If the new release is unhealthy,
# `current` is switched back to the previous release.
set -Eeuo pipefail

RELEASE="${1:?usage: remote-deploy.sh <release>}"
APP_DIR="${APP_DIR:-$HOME/gamereels-api}"
PM2_APP_NAME="${PM2_APP_NAME:-gamereels-api}"
SEED_ON_DEPLOY="${SEED_ON_DEPLOY:-false}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
export APP_DIR PM2_APP_NAME

STAGE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASES="$APP_DIR/releases"
SHARED="$APP_DIR/shared"
TARGET="$RELEASES/$RELEASE"

log() { printf '\n==> %s\n' "$*"; }

# Non-interactive SSH shells skip ~/.bashrc, so node/npm/pm2 installed via nvm are not on PATH.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
for bin in node npm pm2 curl; do
  command -v "$bin" >/dev/null || { echo "error: $bin is not installed on this server" >&2; exit 1; }
done
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "error: Node $(node -v) found; the API needs Node 22+ (CI builds with 24)" >&2
  exit 1
fi

log "Installing release $RELEASE into $TARGET"
mkdir -p "$RELEASES" "$SHARED"
install -m 600 "$STAGE/.env.production" "$SHARED/.env.production"
rm -f "$STAGE/.env.production"
rm -rf "$TARGET"
mv "$STAGE" "$TARGET"
# `npm start`/PM2 read .env.production; prisma.config.ts and seed.ts load .env via dotenv.
ln -sfn "$SHARED/.env.production" "$TARGET/.env.production"
ln -sfn "$SHARED/.env.production" "$TARGET/.env"

cd "$TARGET"
# Full install: the Prisma CLI (and tsx for the seed) are dev dependencies. The client is
# already generated and compiled into dist/, so the postinstall hook is skipped.
npm ci --include=dev --ignore-scripts --no-audit --no-fund

log "Running database migrations"
npx --no-install prisma migrate deploy

if [ "$SEED_ON_DEPLOY" = "true" ]; then
  log "Seeding games"
  npx --no-install prisma db seed
fi

npm prune --omit=dev --ignore-scripts --no-audit --no-fund

PREVIOUS="$(readlink -f "$APP_DIR/current" 2>/dev/null || true)"

switch_to() {
  ln -sfn "$1" "$APP_DIR/current.next"
  mv -Tf "$APP_DIR/current.next" "$APP_DIR/current"
  pm2 startOrReload "$1/deploy/ecosystem.config.cjs" --update-env
}

log "Switching to $RELEASE"
switch_to "$TARGET"

PORT="$(sed -n "s/^PORT=['\"]\{0,1\}\([0-9]*\).*/\1/p" "$SHARED/.env.production" | tail -n 1)"
PORT="${PORT:-3000}"
healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT))
  until curl -fsS "http://127.0.0.1:$PORT/health/ready" >/dev/null 2>&1; do
    [ "$SECONDS" -lt "$deadline" ] || return 1
    sleep 2
  done
}

log "Waiting for http://127.0.0.1:$PORT/health/ready"
if ! healthy; then
  echo "error: release $RELEASE did not become healthy within ${HEALTH_TIMEOUT}s" >&2
  pm2 logs "$PM2_APP_NAME" --lines 50 --nostream || true
  if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ] && [ "$PREVIOUS" != "$TARGET" ]; then
    log "Rolling back to $(basename "$PREVIOUS")"
    switch_to "$PREVIOUS"
    healthy || echo "warning: the previous release is not healthy either" >&2
  fi
  exit 1
fi

pm2 save >/dev/null

log "Removing old releases (keeping $KEEP_RELEASES)"
CURRENT="$(readlink -f "$APP_DIR/current")"
ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +"$((KEEP_RELEASES + 1))" | while read -r dir; do
  dir="${dir%/}"
  [ "$(readlink -f "$dir")" = "$CURRENT" ] || rm -rf "$dir"
done

log "Release $RELEASE is live"
