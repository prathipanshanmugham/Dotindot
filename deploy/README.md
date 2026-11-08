# dotindot — one app

The website, the employee & client app and the API are one app, served by the backend (`backend/server.py`) on one port behind nginx. It goes live in two stages.

**Stage 1 — now: everything on internal.dotindot.in.** dotindot.in is not touched.

| Address | What it is |
|---|---|
| `internal.dotindot.in/` | the website (`website/`) — kept out of search engines while it's being revised |
| `internal.dotindot.in/app/login` | employee login (`frontend/`) |
| `internal.dotindot.in/app/portal/login` | client portal |
| `internal.dotindot.in/app/investor/login` | investor portal |
| `internal.dotindot.in/api/` | the API (AI agents, the mobile app and integrations keep working unchanged) |
| old app addresses (`/login`, `/finance/...`, `/share/<token>`, …) | forward to the same page under `/app` |

**Stage 2 — later: everything moves to dotindot.in.** The same table with `dotindot.in` in front. The website becomes visible to search engines automatically, `www` forwards to `dotindot.in`, and `internal.dotindot.in` keeps the API while forwarding every other address to `dotindot.in`.

Website forms post to `/api/intake/website` on whichever address the site is on, so leads land in **Sales → Pipeline** with no intake key and no CORS settings. Client capture links (`/api/intake/leads/<key>`) work as before.

## Stage 1: go live on internal.dotindot.in

In the app's folder on the VPS (for example `/var/www/dotindot`), run these two back to back. The app has moved to `/app`, so the old nginx setup for internal.dotindot.in won't show it properly until step 2 has run.

1. `git pull && bash deploy/deploy.sh`

   This builds the app and the website next to the live ones, then swaps them in. Then it restarts `dotindot-backend` with pm2 and checks `/`, `/app/` and `/api/`. The first run takes a few minutes.
2. `sudo bash deploy/setup-server.sh`

   This finds the app's port and lists the nginx site(s) it will replace for internal.dotindot.in. It asks before changing anything. Then it:
   - backs the old site(s) up;
   - writes one nginx site;
   - keeps internal's existing HTTPS certificate.

   If nginx rejects the change, it puts everything back. If an nginx file also serves another site (for example Sellandiamman or Sensoper), it stops without changing anything.
3. **Check.**
   - Open https://internal.dotindot.in.
   - Send a test lead from **Free audit** and look for it in Sales → Pipeline.
   - Sign in at https://internal.dotindot.in/app/login. Everyone signs in once more, because the app's address changed.

## Stage 2: move to dotindot.in (when revisions are done)

1. **DNS.** The nameservers are at GoDaddy, so the DNS records live there: GoDaddy → My Products → dotindot.in → DNS. Point the `@` and `www` A records at the VPS IP, the same IP as `internal`. Delete any other `@`/`www` A, AAAA or CNAME records left over from the old website. Keep the MX and TXT records so email keeps working.
2. When `getent hosts dotindot.in` on the VPS shows that IP, run `sudo bash deploy/setup-server.sh --go-live`. It checks DNS, rewrites the nginx site for all three addresses and gets certificates for dotindot.in and www.
3. Submit `https://dotindot.in/sitemap.xml` in Google Search Console and Bing Webmaster Tools.

## Every update

```
bash /var/www/dotindot/deploy/deploy.sh
```

To make your old `deploy.sh` command run this one: `cd /var/www/dotindot && mv deploy.sh deploy.sh.old && ln -s deploy/deploy.sh deploy.sh`.

Something wrong after an update? `bash deploy/rollback.sh` puts back the previous website and app builds.

Options: `PM2_NAME=<name>` if the backend's pm2 process isn't `dotindot-backend`; `PORT=<port>` to skip port detection; `SKIP_PULL=1` to deploy what's checked out.

## Local development

- Backend: as before. Once `website/dist` (`node website/build.mjs`) and `frontend/build` (`yarn build`) exist, it serves the website at `/` and the app at `/app`.
- Frontend: `yarn start` opens the app at `localhost:3000/app` and uses `REACT_APP_BACKEND_URL` for the API.
- `WEBSITE_DIR` / `APP_DIR` point the backend at builds somewhere else.
