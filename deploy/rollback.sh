#!/usr/bin/env bash
# Put back the website and app builds from before the last deploy, then restart the backend.
#   bash /var/www/dotindot/deploy/rollback.sh
set -euo pipefail
REPO="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
PM2_NAME="${PM2_NAME:-dotindot-backend}"
for d in "$REPO/frontend/build" "$REPO/website/dist"; do
  if [ -d "$d.prev" ]; then rm -rf "$d.bad"; [ -d "$d" ] && mv "$d" "$d.bad"; mv "$d.prev" "$d"; echo "restored $d"; else echo "no previous build for $d"; fi
done
command -v pm2 >/dev/null 2>&1 && pm2 restart "$PM2_NAME" >/dev/null && echo "restarted $PM2_NAME"
echo "Code is unchanged; to go back in code too: git -C $REPO log --oneline -5, then git -C $REPO checkout <commit>"
