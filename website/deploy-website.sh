#!/usr/bin/env bash
# Build dotindot.in and publish it to /var/www/dotindot.in (served by nginx).
#   bash /var/www/dotindot/website/deploy-website.sh
# The CRM capture link stays out of git, in /var/www/dotindot/website.env:
#   INTAKE_URL=https://internal.dotindot.in/api/intake/leads/<your key>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ENV_FILE:-/var/www/dotindot/website.env}"
OUT="${OUT:-/var/www/dotindot.in}"
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"

if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a
else echo "note: $ENV_FILE not found, so forms fall back to WhatsApp until INTAKE_URL is set there"; fi

cd "$HERE"
# minify the site script (one-time ~10 MB download, kept in website/.tools)
if ! command -v esbuild >/dev/null 2>&1; then
  [ -x .tools/node_modules/.bin/esbuild ] || npm install --silent --no-audit --no-fund --prefix .tools esbuild@0.24.0 >/dev/null 2>&1 || true
  export PATH="$HERE/.tools/node_modules/.bin:$PATH"
fi

node build.mjs

# swap the new build in at once, keeping the previous one as a backup
$SUDO mkdir -p "$(dirname "$OUT")"
$SUDO rm -rf "$OUT.new" && $SUDO cp -a dist "$OUT.new"
[ -d "$OUT" ] && { $SUDO rm -rf "$OUT.prev"; $SUDO mv "$OUT" "$OUT.prev"; }
$SUDO mv "$OUT.new" "$OUT"
echo "dotindot.in published to $OUT"
if [ -d "$OUT.prev" ]; then echo "previous version kept in $OUT.prev (roll back: sudo rm -rf $OUT && sudo mv $OUT.prev $OUT)"; fi
