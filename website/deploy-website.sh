#!/usr/bin/env bash
# Build dotindot.in and publish it to /var/www/dotindot.in (served by nginx).
# The CRM capture link lives outside git, in /var/www/dotindot/website.env:
#   INTAKE_URL=https://internal.dotindot.in/api/intake/leads/<your key>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ENV_FILE:-/var/www/dotindot/website.env}"
OUT="${OUT:-/var/www/dotindot.in}"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; else echo "note: $ENV_FILE not found — forms will fall back to WhatsApp until INTAKE_URL is set"; fi
cd "$HERE"
node build.mjs
sudo mkdir -p "$OUT"
sudo rsync -a --delete dist/ "$OUT/"
echo "dotindot.in published to $OUT"
