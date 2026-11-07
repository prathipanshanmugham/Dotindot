"""One web app: the public website at /, the employee / client / investor app at /app, the API at /api.

  /            → website/dist   (static site built by website/build.mjs)
  /app/...     → frontend/build (React app built with homepage "/app"; unknown paths get index.html)
  /api/...     → the FastAPI routers (registered before this catch-all, so they always win)

Old addresses keep working: /login, /portal, /investor, /share/<token> and /dashboard forward into /app,
and pages from the previous dotindot.in (/locations, /work, /thank-you) forward to their new homes.
Set WEBSITE_DIR / APP_DIR to serve builds from somewhere else.
"""
import os
import re
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, RedirectResponse

REPO = Path(__file__).resolve().parent.parent
SITE_DIR = Path(os.environ.get("WEBSITE_DIR") or REPO / "website" / "dist").resolve()
APP_DIR = Path(os.environ.get("APP_DIR") or REPO / "frontend" / "build").resolve()
APP_BASE = "/app"

YEAR = "public, max-age=31536000, immutable"   # hashed scripts, fonts, images
PAGE = "public, max-age=600, must-revalidate"   # website pages
FRESH = "no-cache"                               # the app shell: always check for a new build
LONG_LIVED = re.compile(r"\.(?:js|json|woff2|svg|png|jpe?g|webp|avif|ico|css|map)$", re.I)
BASE_HEADERS = {"X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin"}

# (pattern, target) — target may use \1; the query string is kept
REDIRECTS = [
    (re.compile(r"^/locations(?:/.*)?$"), "/about/"),
    (re.compile(r"^/work/?$"), "/process/"),
    (re.compile(r"^/thank-you/?$"), "/thanks/"),
    (re.compile(r"^/(login|dashboard)/?$"), APP_BASE + r"/\1"),
    (re.compile(r"^/(portal|investor)(/.*)?$"), APP_BASE + r"/\1\2"),
    (re.compile(r"^/share/([^/]+)/?$"), APP_BASE + r"/share/\1"),
]

router = APIRouter()


def _inside(root: Path, rel: str):
    """root/rel if it stays inside root, else None (blocks ../ tricks)."""
    try:
        p = (root / rel).resolve()
    except (OSError, ValueError):
        return None
    return p if p == root or root in p.parents else None


def _file(path: Path, cache: str, extra: dict = None, status: int = 200):
    headers = {**BASE_HEADERS, "Cache-Control": cache, **(extra or {})}
    return FileResponse(path, status_code=status, headers=headers)


def _not_found():
    page = SITE_DIR / "404.html"
    if page.is_file():
        return _file(page, PAGE, status=404)
    return PlainTextResponse("Not found", status_code=404, headers=BASE_HEADERS)


def _with_query(url: str, request: Request) -> str:
    q = request.url.query
    return f"{url}?{q}" if q else url


def _serve_app(request: Request, rel: str):
    noindex = {"X-Robots-Tag": "noindex, nofollow"}
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
    rel = path.lstrip("/")
    if any(part.startswith(".") for part in rel.split("/") if part) and not rel.startswith(".well-known/"):
        return _not_found()
    target = _inside(SITE_DIR, rel)
    if target is None:
        return _not_found()
    if target.is_dir():
        if not path.endswith("/"):
            return RedirectResponse(_with_query(path + "/", request), status_code=301)
        target = target / "index.html"
    if target.is_file():
        return _file(target, YEAR if LONG_LIVED.search(target.name) else PAGE)
    return _not_found()


@router.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
async def web(full_path: str, request: Request):
    path = "/" + full_path
    if path == "/api" or path.startswith("/api/"):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    if path == APP_BASE or path.startswith(APP_BASE + "/"):
        return _serve_app(request, path[len(APP_BASE) + 1:])
    for pattern, to in REDIRECTS:
        m = pattern.match(path)
        if m:
            return RedirectResponse(_with_query(m.expand(to), request), status_code=301)
    return _serve_site(request, path)
