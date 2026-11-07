// The app lives at dotindot.in/app (one web app with the website at /). In local development it can also run at /.
export const BASE = /^\/app(\/|$)/.test(window.location.pathname) ? "/app" : "";
// Full address of an app page, e.g. appUrl("/portal/login") → https://dotindot.in/app/portal/login
export const appUrl = (path = "") => `${window.location.origin}${BASE}${path}`;
// API on the same origin unless a separate backend address is configured (local development)
export const API_ROOT = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;
