# dotindot.in — one app

The website, the employee & client app and the API are one app, served by the backend (`backend/server.py`) on one port behind nginx.

| Address | What it is |
|---|---|
| `dotindot.in/` | the public website (`website/`) |
| `dotindot.in/app/login` | employee login (`frontend/`) |
| `dotindot.in/app/portal/login` | client portal |
| `dotindot.in/app/investor/login` | investor portal |
| `dotindot.in/api/` | the API |
| `internal.dotindot.in/api/` | the same API, so AI agents, the mobile app and integrations keep working unchanged |
| `internal.dotindot.in/…` | forwards to `dotindot.in/app/…`, so old bookmarks and shared links still open |

Website forms post to `/api/intake/website` on the same address: leads land in **Sales → Pipeline** with no intake key and no CORS settings. Client capture links (`/api/intake/leads/<key>`) work as before.

## Going live (once)

1. **DNS.** In hPanel → Domains → dotindot.in → DNS, point the `@` and `www` A records at the VPS IP (the same IP as `internal`). Delete other `@`/`www` A, AAAA or CNAME records left over from the old website. Keep MX and TXT records so email keeps working.
2. **Code.** In the app's folder on the VPS (for example `/var/www/dotindot`): `git pull`.
3. **Build and restart:** `bash deploy/deploy.sh`. It builds the app and the website next to the live ones, swaps them in, restarts `dotindot-backend` with pm2 and checks `/`, `/app/` and `/api/`. The first run takes a few minutes.
4. **nginx and HTTPS.** When `getent hosts dotindot.in` shows the VPS IP, run `sudo bash deploy/setup-server.sh`. It:
   - finds the app's port;
   - checks DNS;
   - lists the nginx sites it will replace and asks before changing anything;
   - backs those sites up;
   - writes one nginx site for dotindot.in, www and internal;
   - keeps internal's existing certificate;
   - gets certificates for dotindot.in and www with certbot.

   If nginx rejects the change, it puts everything back. It stops without changing anything if an nginx file also serves another site (for example Sellandiamman or Sensoper).
5. **Check.**
   - Open https://dotindot.in.
   - Send a test lead from **Free audit** and look for it in Sales → Pipeline.
   - Sign in at https://dotindot.in/app/login.

   Everyone signs in once more at the new address. Sign-ins are kept per address.

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
