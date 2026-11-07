#!/usr/bin/env bash
# Update dotindot.in: the website (/), the employee & client app (/app) and the API (/api) — one app.
#   bash /var/www/dotindot/deploy/deploy.sh
# Pulls the latest code, builds the app and the website next to the live ones, swaps them in, restarts the
# backend and checks that everything answers. Settings (all optional):
#   PM2_NAME=dotindot-backend   the pm2 process that runs backend/server.py
#   PORT=8001                   the port it listens on (found automatically)
#   SKIP_PULL=1                 deploy what is already checked out
set -euo pipefail
REPO="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
PM2_NAME="${PM2_NAME:-dotindot-backend}"
say() { printf '\n\033[1;38;5;208m●\033[0m %s\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
fetch() { curl -fsS --noproxy '*' -m "${2:-5}" "$1" 2>/dev/null || true; }  # never fails, so | grep -q is safe under pipefail
cd "$REPO"

# ---------------------------------------------------------------- code
before="$(git rev-parse HEAD)"
if [ -z "${SKIP_PULL:-}" ]; then
  say "Pulling the latest code"
  git pull --ff-only
fi
changed() { [ "$before" != "$(git rev-parse HEAD)" ] && git diff --name-only "$before" HEAD -- "$@" | grep -q .; }

# ---------------------------------------------------------------- backend dependencies (only when they change)
if changed backend/requirements.txt; then
  PIP=""
  for v in backend/venv backend/.venv venv .venv; do [ -x "$v/bin/pip" ] && { PIP="$v/bin/pip"; break; }; done
  if [ -n "$PIP" ]; then
    say "Installing backend packages ($PIP)"
    "$PIP" install -q -r backend/requirements.txt || warn "pip install failed — check backend/requirements.txt"
  else
    warn "backend/requirements.txt changed: install it into the backend's Python environment"
  fi
fi

# ---------------------------------------------------------------- employee & client app → frontend/build (served at /app)
say "Building the app (/app) — takes a few minutes"
cd "$REPO/frontend"
if command -v yarn >/dev/null 2>&1; then PM=yarn; else PM=npm; fi
if [ ! -d node_modules ] || changed frontend/package.json frontend/yarn.lock frontend/package-lock.json; then
  if [ "$PM" = yarn ]; then yarn install --silent --network-timeout 600000; else npm install --no-audit --no-fund --silent; fi
fi
rm -rf build.new
# same-origin API (dotindot.in/api) whatever frontend/.env says; the build lands next to the live one
REACT_APP_BACKEND_URL="" BUILD_PATH=build.new GENERATE_SOURCEMAP=false CI=false $PM run build >/tmp/dotindot-app-build.log 2>&1 \
  || { tail -30 /tmp/dotindot-app-build.log; echo "App build failed — the live site is unchanged."; exit 1; }
[ -f build.new/index.html ] || { echo "App build produced no index.html — the live site is unchanged."; exit 1; }

# ---------------------------------------------------------------- website → website/dist (served at /)
say "Building the website (/)"
cd "$REPO/website"
if ! command -v esbuild >/dev/null 2>&1; then   # minifies the site script; one-time ~10 MB download
  [ -x .tools/node_modules/.bin/esbuild ] || npm install --silent --no-audit --no-fund --prefix .tools esbuild@0.24.0 >/dev/null 2>&1 || true
  export PATH="$REPO/website/.tools/node_modules/.bin:$PATH"
fi
rm -rf dist.new
OUT_DIR=dist.new node build.mjs

# ---------------------------------------------------------------- swap in (previous builds kept as *.prev)
say "Switching to the new builds"
swap() { rm -rf "$1.prev"; [ -d "$1" ] && mv "$1" "$1.prev"; mv "$1.new" "$1"; }
swap "$REPO/frontend/build"
swap "$REPO/website/dist"

# ---------------------------------------------------------------- restart + check
say "Restarting $PM2_NAME"
if command -v pm2 >/dev/null 2>&1 && pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env >/dev/null
else
  warn "pm2 process '$PM2_NAME' not found — restart the backend yourself (PM2_NAME=<name> to use another)"
fi

find_port() {   # the local port that answers as the dotindot API
  if [ -n "${PORT:-}" ]; then echo "$PORT"; return; fi
  for p in 8001 $(ss -ltnH 2>/dev/null | awk '{print $4}' | sed 's/.*://' | sort -un | grep -vx 8001); do
    fetch "http://127.0.0.1:$p/api/" 2 | grep -q "Dotindot Ops API" && { echo "$p"; return; }
  done
}
P=""
for _ in $(seq 1 30); do P="$(find_port || true)"; [ -n "$P" ] && break; sleep 1; done
if [ -z "$P" ]; then warn "The backend didn't answer on any local port. Check: pm2 logs $PM2_NAME"; exit 1; fi

ok=1
check() {  # path, text expected in the page
  if fetch "http://127.0.0.1:$P$1" 10 | grep -q "$2"; then echo "  ✓ $1"; else echo "  ✗ $1"; ok=0; fi
}
check /api/ "Dotindot Ops API"
check / "dotindot"
check /app/ 'id="root"'
check /app/login 'id="root"'
check /sitemap.xml "<urlset"
if [ "$ok" = 1 ]; then
  say "Live: website /, app /app, API /api (backend on port $P)"
else
  warn "Something didn't answer. Roll back with: bash $REPO/deploy/rollback.sh"
  exit 1
fi
