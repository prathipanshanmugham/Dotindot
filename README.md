# dotindot

One web app for Dotindot Creative. It runs on internal.dotindot.in for now and moves to dotindot.in when it's final (see `deploy/README.md`):

- `website/` is the public website, served at **/**. It's a static site generator; see `website/README.md`.
- `frontend/` is the employee, client-portal and investor app, served at **/app/** (React).
- `backend/` is the API at **/api/** (FastAPI). It also serves the two builds above, so everything runs as one process on one port.
- `mobile/` is the mobile app. It talks to the same API.
- `deploy/` holds `deploy.sh` (update), `rollback.sh` and `setup-server.sh` (nginx + HTTPS: stage 1 on internal.dotindot.in, `--go-live` for dotindot.in). Going live and updating are covered in `deploy/README.md`.
