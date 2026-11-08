"""One web app: the public website at /, the employee / client / investor app at /app, the API at /api.

  /            → website/dist   (static site built by website/build.mjs)
  /app/...     → frontend/build (React app built with homepage "/app"; unknown paths get index.html)
  /api/...     → the FastAPI routers (registered before this catch-all, so they always win)

Old addresses keep working: app pages from before the move (/login, /portal/..., /finance/..., /share/<token>, ...)
forward into /app, and pages from the previous dotindot.in (/work, /thank-you, /locations) forward to their new homes.

Search engines: the website is indexable only on its public domain (the "domain" in website/site.config.json,
or PUBLIC_HOST). Served anywhere else — internal.dotindot.in while revisions are under way, localhost — every
page says noindex and robots.txt disallows everything, so the staging copy never competes with the real site.
Set WEBSITE_DIR / APP_DIR to serve builds from somewhere else.
"""
import json
import os
import re
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, RedirectResponse

REPO = Path(__file__).resolve().parent.parent
SITE_DIR = Path(os.environ.get("WEBSITE_DIR") or REPO / "website" / "dist").resolve()
APP_DIR = Path(os.environ.get("APP_DIR") or REPO / "frontend" / "build").resolve()
APP_BASE = "/app"


def _public_host() -> str:
    if os.environ.get("PUBLIC_HOST"):
        return os.environ["PUBLIC_HOST"].strip().lower()
    try:
        domain = json.loads((REPO / "website" / "site.config.json").read_text())["domain"]
        return re.sub(r"^https?://", "", domain).split("/")[0].lower()
    except Exception:
        return "dotindot.in"


PUBLIC_HOST = _public_host()
NOINDEX = {"X-Robots-Tag": "noindex, nofollow"}

YEAR = "public, max-age=31536000, immutable"   # hashed scripts, fonts, images
PAGE = "public, max-age=600, must-revalidate"   # website pages
FRESH = "no-cache"                               # the app shell: always check for a new build
LONG_LIVED = re.compile(r"\.(?:js|json|woff2|svg|png|jpe?g|webp|avif|ico|css|map)$", re.I)
BASE_HEADERS = {"X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin"}

# Pages of the previous dotindot.in → their new homes (permanent; only on the public domain)
OLD_SITE = [
    (re.compile(r"^/locations(?:/.*)?$"), "/about/"),
    (re.compile(r"^/work/?$"), "/process/"),
    (re.compile(r"^/thank-you/?$"), "/thanks/"),
]
# Top-level pages of the app before it moved under /app (frontend/src/App.js). None of them is a website page,
# so old bookmarks and shared links (/login, /finance/billing, /share/<token>, ...) land in the app. Temporary
# redirects, so the website can still take one of these names later.
APP_PAGES = ("access admin ads agents clients daily dashboard employees finance growth hr hud influencers investor "
             "investors lead-flow locations login logs my-expenses my-hr org partnerships passwords portal projects "
             "reports sales settings share social support").split()
APP_PAGE = re.compile(r"^/(" + "|".join(re.escape(p) for p in APP_PAGES) + r")(/.*)?$")

router = APIRouter()


def _inside(root: Path, rel: str):
    """root/rel if it stays inside root, else None (blocks ../ tricks)."""
    try:
        p = (root / rel).resolve()
    except (OSError, ValueError):
        return None
    return p if p == root or root in p.parents else None


def _host(request: Request) -> str:
    return (request.headers.get("host") or "").split(":")[0].lower()


def _indexable(request: Request) -> bool:
    h = _host(request)
    return h == PUBLIC_HOST or h == "www." + PUBLIC_HOST


def _file(path: Path, cache: str, extra: dict = None, status: int = 200):
    headers = {**BASE_HEADERS, "Cache-Control": cache, **(extra or {})}
    return FileResponse(path, status_code=status, headers=headers)


def _not_found(extra: dict = None):
    page = SITE_DIR / "404.html"
    if page.is_file():
        return _file(page, PAGE, extra, status=404)
    return PlainTextResponse("Not found", status_code=404, headers={**BASE_HEADERS, **(extra or {})})


def _with_query(url: str, request: Request) -> str:
    q = request.url.query
    return f"{url}?{q}" if q else url


def _serve_app(request: Request, rel: str):
    noindex = NOINDEX
    if rel:
        f = _inside(APP_DIR, rel)
        if f and f.is_file():
            return _file(f, YEAR if rel.startswith("static/") else (FRESH if f.name == "index.html" else PAGE), noindex)
        if rel.startswith("static/"):
            return PlainTextResponse("Not found", status_code=404, headers={**BASE_HEADERS, **noindex})
    shell = APP_DIR / "index.html"
    if not shell.is_file():
        return PlainTextResponse("The app hasn't been built yet. Run deploy/deploy.sh on the server.", status_code=503, headers=BASE_HEADERS)
    return _file(shell, FRESH, noindex)


def _serve_site(request: Request, path: str):
    extra = None if _indexable(request) else NOINDEX
    rel = path.lstrip("/")
    if rel == "robots.txt" and extra:
        return PlainTextResponse("# Staging copy of the website - the live site is https://" + PUBLIC_HOST + "\nUser-agent: *\nDisallow: /\n",
                                 headers={**BASE_HEADERS, "Cache-Control": PAGE, **extra})
    if any(part.startswith(".") for part in rel.split("/") if part) and not rel.startswith(".well-known/"):
        return _not_found(extra)
    target = _inside(SITE_DIR, rel)
    if target is None:
        return _not_found(extra)
    if target.is_dir():
        if not path.endswith("/"):
            return RedirectResponse(_with_query(path + "/", request), status_code=301)
        target = target / "index.html"
    if target.is_file():
        return _file(target, YEAR if LONG_LIVED.search(target.name) else PAGE, extra)
    return _not_found(extra)


@router.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
async def web(full_path: str, request: Request):
    path = "/" + full_path
    if path == "/api" or path.startswith("/api/"):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    if path == APP_BASE or path.startswith(APP_BASE + "/"):
        return _serve_app(request, path[len(APP_BASE) + 1:])
    if _indexable(request):
        for pattern, to in OLD_SITE:
            m = pattern.match(path)
            if m:
                return RedirectResponse(_with_query(m.expand(to), request), status_code=301)
    if APP_PAGE.match(path) or path in ("/assets", "/assets/"):
        return RedirectResponse(_with_query(APP_BASE + path, request), status_code=302)
    return _serve_site(request, path)
