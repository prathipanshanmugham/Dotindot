# dotindot

One web app for Dotindot Creative:

- `website/` is the public website, served at **dotindot.in/**. It's a static site generator; see `website/README.md`.
- `frontend/` is the employee, client-portal and investor app, served at **dotindot.in/app/** (React).
- `backend/` is the API at **dotindot.in/api/** (FastAPI). It also serves the two builds above, so everything runs as one process on one port.
- `mobile/` is the mobile app. It talks to the same API.
- `deploy/` holds `deploy.sh` (update), `rollback.sh` and `setup-server.sh` (one-time nginx + HTTPS). Going live and updating are covered in `deploy/README.md`.
