#!/usr/bin/env bash
# One-time server setup: dotindot.in, www.dotindot.in and internal.dotindot.in all served by the one app, with HTTPS.
#   sudo bash /var/www/dotindot/deploy/setup-server.sh
#
# Before running:
#   1. DNS: dotindot.in and www.dotindot.in point at this server (the same IP as internal.dotindot.in).
#   2. bash /var/www/dotindot/deploy/deploy.sh has run once (the app answers locally).
#
# What it does:
#   • dotindot.in        → the app (website /, employee & client app /app, API /api)
#   • www.dotindot.in    → redirects to dotindot.in
#   • internal.dotindot.in/api → still the API (AI agents, the mobile app and integrations keep working)
#     internal.dotindot.in/... → redirects to dotindot.in/app/... (old bookmarks and shared links keep working)
#   • HTTPS certificates with certbot
# Safe to re-run. Every nginx file it replaces is backed up first, and it puts everything back if nginx rejects the change.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Please run with sudo:  sudo bash $0"; exit 1; }

DOMAIN=dotindot.in; WWW=www.dotindot.in; INTERNAL=internal.dotindot.in
NGINX_DIR="${NGINX_DIR:-/etc/nginx}"; LE_DIR="${LE_DIR:-/etc/letsencrypt}"; CERTBOT="${CERTBOT:-certbot}"
SITE="$NGINX_DIR/sites-available/dotindot.conf"; LINK="$NGINX_DIR/sites-enabled/dotindot.conf"
YES="${YES:-}"; [ "${1:-}" = "-y" ] && YES=1
say() { printf '\n\033[1;38;5;208m●\033[0m %s\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
fetch() { curl -fsS --noproxy '*' -m "${2:-5}" "$1" 2>/dev/null || true; }  # never fails, so | grep -q is safe under pipefail
die() { printf '\033[31m✗ %s\033[0m\n' "$*"; exit 1; }

# ---------------------------------------------------------------- 1. the app answers locally
say "Finding the app"
PORT="${PORT:-}"
if [ -z "$PORT" ]; then
  for p in 8001 $(ss -ltnH 2>/dev/null | awk '{print $4}' | sed 's/.*://' | sort -un | grep -vx 8001); do
    fetch "http://127.0.0.1:$p/api/" 2 | grep -q "Dotindot Ops API" && { PORT="$p"; break; }
  done
fi
[ -n "$PORT" ] || die "The dotindot backend isn't answering on this server. Start it (pm2) and run deploy/deploy.sh first."
fetch "http://127.0.0.1:$PORT/" 5 | grep -q "dotindot" || die "The website isn't built yet. Run deploy/deploy.sh first."
fetch "http://127.0.0.1:$PORT/app/" 5 | grep -q 'id="root"' || die "The app isn't built yet. Run deploy/deploy.sh first."
echo "  backend on 127.0.0.1:$PORT — website, app and API all answer"

# ---------------------------------------------------------------- 2. DNS points here
say "Checking DNS"
ips_of() { { getent ahostsv4 "$1" 2>/dev/null || true; } | awk '{print $1}' | sort -u; }
HERE_IPS="$( { hostname -I 2>/dev/null | tr ' ' '\n' || true; ips_of "$INTERNAL"; } | grep -E '^[0-9.]+$' | sort -u || true)"
for h in "$DOMAIN" "$WWW"; do
  got="$(ips_of "$h" | paste -sd' ' - || true)"
  if [ -z "$got" ] || ! grep -qxF -f <(echo "$HERE_IPS") <<< "$(ips_of "$h")"; then
    die "$h points to '${got:-nothing}', not this server ($(ips_of "$INTERNAL" | paste -sd' ' -)).
  In hPanel → Domains → $DOMAIN → DNS, set the A records for @ and www to that IP, remove old @/www records
  (keep MX/TXT for email), wait until 'getent hosts $h' shows it, then run this again."
  fi
  echo "  $h → $got ✓"
done

# ---------------------------------------------------------------- 3. existing nginx sites for these names
say "Looking at the current nginx setup"
NAMES_RE="(www\.|internal\.)?dotindot\.in"
OLD=()
for f in "$NGINX_DIR"/sites-enabled/* "$NGINX_DIR"/conf.d/*.conf; do
  [ -e "$f" ] || continue
  [ "$f" = "$LINK" ] && continue
  grep -qE "server_name[^;]*[[:space:]]${NAMES_RE}[[:space:];]" "$f" || continue   # (reads a file, no pipe)
  others="$(grep -hoE 'server_name[^;]*;' "$f" | sed -E 's/server_name|;//g' | tr -s ' \t' '\n' | grep -v '^$' | grep -vxE "$NAMES_RE" | sort -u | paste -sd' ' - || true)"
  if [ -n "$others" ]; then
    die "$f also serves other sites ($others), so it can't be switched off safely.
  Remove the server blocks for $DOMAIN / $WWW / $INTERNAL from that file yourself (keep a copy), then run this again."
  fi
  OLD+=("$f")
done
if [ "${#OLD[@]}" -gt 0 ]; then
  echo "  These nginx sites serve dotindot today and will be replaced (backed up first):"
  printf '    %s\n' "${OLD[@]}"
else
  echo "  No existing nginx site for dotindot."
fi

# certificate already covering internal.dotindot.in (kept as is)
cert_for() {
  local d sans
  for d in $(ls -dt "$LE_DIR"/live/*/ 2>/dev/null); do
    d="${d%/}"; [ -f "$d/fullchain.pem" ] || continue
    openssl x509 -in "$d/fullchain.pem" -noout -checkend 86400 >/dev/null 2>&1 || continue
    sans="$(openssl x509 -in "$d/fullchain.pem" -noout -text 2>/dev/null | grep -oE "DNS:[^,[:space:]]+" || true)"
    grep -qx "DNS:$1" <<< "$sans" && { echo "$d"; return; }
  done
}
INTERNAL_CERT="$(cert_for "$INTERNAL" || true)"
[ -n "$INTERNAL_CERT" ] && echo "  keeping the HTTPS certificate for $INTERNAL ($INTERNAL_CERT)"

if [ -z "$YES" ]; then
  read -rp $'\nGo ahead? [y/N] ' a; [[ "$a" =~ ^[Yy] ]] || die "Nothing changed."
fi

# ---------------------------------------------------------------- 4. write the nginx site
say "Writing $SITE"
V6=""; [ -s /proc/net/if_inet6 ] && V6=1
L80="listen 80;"; [ -n "$V6" ] && L80="listen 80;
    listen [::]:80;"
L443="listen 443 ssl;"; [ -n "$V6" ] && L443="listen 443 ssl;
    listen [::]:443 ssl;"
SSLOPTS=""
[ -f "$LE_DIR/options-ssl-nginx.conf" ] && SSLOPTS="include $LE_DIR/options-ssl-nginx.conf;"
[ -f "$LE_DIR/ssl-dhparams.pem" ] && SSLOPTS="$SSLOPTS
    ssl_dhparam $LE_DIR/ssl-dhparams.pem;"

PROXY='        proxy_pass http://dotindot_app;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;'
COMMON='    client_max_body_size 25m;
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_min_length 512;
    gzip_types text/plain text/css text/xml application/javascript application/json application/xml image/svg+xml application/manifest+json;'

render() {  # fill placeholders (values may span lines)
  python3 -c '
import sys
t = sys.stdin.read()
for k, v in zip(sys.argv[1::2], sys.argv[2::2]):
    t = t.replace(k, v)
sys.stdout.write(t)' "__PORT__" "$PORT" "__L80__" "$L80" "__L443__" "$L443" "__SSLOPTS__" "$SSLOPTS" "__PROXY__" "$PROXY" "__COMMON__" "$COMMON" "__CERT__" "$INTERNAL_CERT"
}

NEW="$(mktemp)"
render > "$NEW" <<'EOF'
# Written by deploy/setup-server.sh — dotindot as one app: website /, employee & client app /app, API /api.
# The app runs under pm2 on 127.0.0.1:__PORT__. Re-run the script instead of editing this by hand.
upstream dotindot_app {
    server 127.0.0.1:__PORT__;
    keepalive 16;
}

# www.dotindot.in → dotindot.in
server {
    __L80__
    server_name www.dotindot.in;
    location / { return 301 $scheme://dotindot.in$request_uri; }
}

# dotindot.in — everything
server {
    __L80__
    server_name dotindot.in;
__COMMON__
    add_header Strict-Transport-Security "max-age=31536000" always;

    location / {
__PROXY__
    }
}
EOF
if [ -n "$INTERNAL_CERT" ]; then
render >> "$NEW" <<'EOF'

# internal.dotindot.in — the API stays here; pages moved to dotindot.in/app
server {
    __L80__
    server_name internal.dotindot.in;
    location / { return 301 https://$host$request_uri; }
}
server {
    __L443__
    server_name internal.dotindot.in;
    ssl_certificate __CERT__/fullchain.pem;
    ssl_certificate_key __CERT__/privkey.pem;
    __SSLOPTS__
__COMMON__

    location /api {
__PROXY__
    }
    location / { return 301 https://dotindot.in/app$request_uri; }
}
EOF
else
render >> "$NEW" <<'EOF'

# internal.dotindot.in — the API stays here; pages moved to dotindot.in/app
server {
    __L80__
    server_name internal.dotindot.in;
__COMMON__

    location /api {
__PROXY__
    }
    location / { return 301 https://dotindot.in/app$request_uri; }
}
EOF
fi

# ---------------------------------------------------------------- 5. switch, test, reload (or put everything back)
BK="$NGINX_DIR/backup-dotindot-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$BK"
RESTORE=()
[ -f "$SITE" ] && { cp -a "$SITE" "$BK/dotindot.conf.before"; RESTORE+=("cp -a '$BK/dotindot.conf.before' '$SITE'"); } || RESTORE+=("rm -f '$SITE'")
[ -e "$LINK" ] || RESTORE+=("rm -f '$LINK'")
for f in "${OLD[@]}"; do
  b="$BK/$(basename "$f")"
  if [ -L "$f" ]; then
    t="$(readlink -f "$f")"; cp -a "$t" "$b"; rm -f "$f"; RESTORE+=("ln -sf '$t' '$f'")
  else
    mv "$f" "$b"; RESTORE+=("mv '$b' '$f'")
  fi
done
install -m 644 "$NEW" "$SITE"; rm -f "$NEW"
ln -sf "$SITE" "$LINK"

reload_nginx() {
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet nginx 2>/dev/null; then systemctl reload nginx; else nginx -s reload; fi
}
if ! nginx -t 2>/tmp/dotindot-nginx-test.log; then
  cat /tmp/dotindot-nginx-test.log
  for cmd in "${RESTORE[@]}"; do eval "$cmd"; done
  nginx -t >/dev/null 2>&1 && reload_nginx || true
  die "nginx didn't accept the new site, so everything was put back as it was. Backups: $BK"
fi
reload_nginx; sleep 2
echo "  nginx reloaded (backups of the old files: $BK)"

# ---------------------------------------------------------------- 6. HTTPS
say "Getting HTTPS certificates"
D=(-d "$DOMAIN" -d "$WWW"); [ -z "$INTERNAL_CERT" ] && D+=(-d "$INTERNAL")
if "$CERTBOT" --nginx --cert-name "$DOMAIN" "${D[@]}" --redirect --keep-until-expiring --non-interactive --agree-tos --register-unsafely-without-email; then
  echo "  HTTPS on"
else
  warn "certbot couldn't get a certificate (see above). The site works over http for now — fix the cause and run this again."
fi

# ---------------------------------------------------------------- 7. check from the outside in
sleep 2
say "Checking"
probe() {  # url → status [→ redirect]
  local host="${1#*://}"; host="${host%%/*}"; local port=443; [[ "$1" == http://* ]] && port=80
  curl -sk --noproxy '*' -o /dev/null -m 10 --resolve "$host:$port:127.0.0.1" -w "%{http_code} %{redirect_url}" "$1" 2>/dev/null || echo "no answer"
}
for u in "https://$DOMAIN/" "https://$DOMAIN/app/login" "https://$DOMAIN/api/" "https://$WWW/" "https://$INTERNAL/" "https://$INTERNAL/api/"; do
  printf '  %-36s %s\n' "$u" "$(probe "$u")"
done
say "Done. dotindot.in is one app now: website /, employee & client app /app, API /api."
echo "  Employees: https://$DOMAIN/app/login   Clients: https://$DOMAIN/app/portal/login"
echo "  Updates from now on: bash $(cd "$(dirname "$(readlink -f "$0")")" && pwd)/deploy.sh"
