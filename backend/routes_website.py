"""v3.3 Website editor.

The public website (website/, served at /) is a static build. Its clients, testimonials, team, case studies,
key numbers and contact details live here so the team can change them without code. Every change is saved,
exported to website/content.json, and the site is rebuilt next to the live one and swapped in (about a second).

Collections: site_clients, site_testimonials, site_team, site_cases (one row per item, with `visible` and `order`)
and site_settings (id "website": numbers, contact details, social links, the last publish).
Permissions: `website` opens the editor, `website.manage` changes content, `website.delete` deletes (24h recycle bin).
Images: PNG, JPEG or WebP up to 5 MB, re-encoded (metadata stripped, at most 1600 px) into website/media/ and served at /media/.
A testimonial appears on the site only when it is marked visible AND the client has agreed to be quoted.
"""
import asyncio
import io
import json
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from auth import get_current_user, log_activity
from database import db
from permissions import has_permission
from routes_records import hard_delete
from web_static import SITE_DIR

router = APIRouter()

REPO = Path(__file__).resolve().parent.parent
WEBSITE = Path(os.environ.get("WEBSITE_SRC") or REPO / "website").resolve()
CONTENT_FILE = Path(os.environ.get("WEBSITE_CONTENT_FILE") or WEBSITE / "content.json")
MEDIA_DIR = Path(os.environ.get("WEBSITE_MEDIA_DIR") or WEBSITE / "media").resolve()
MAX_IMAGE = 5 * 1024 * 1024
MEDIA_RE = re.compile(r"^media/[0-9a-f-]{36}\.webp$")

KINDS = {
    "clients": {"coll": "site_clients", "label": "client"},
    "testimonials": {"coll": "site_testimonials", "label": "testimonial"},
    "team": {"coll": "site_team", "label": "team member"},
    "cases": {"coll": "site_cases", "label": "case study"},
}
# per kind: field -> (max length, required)
FIELDS = {
    "clients": {"name": (80, True), "industry": (60, False), "url": (300, False), "logo": (80, False)},
    "testimonials": {"quote": (600, True), "name": (80, True), "role": (80, False), "company": (80, False), "photo": (80, False)},
    "team": {"name": (80, True), "role": (80, True), "bio": (400, False), "photo": (80, False), "linkedin": (300, False)},
    "cases": {"client": (80, True), "title": (140, True), "result": (60, False), "summary": (500, False)},
}
URL_FIELDS = {"url", "linkedin"}
IMAGE_FIELDS = {"logo", "photo"}
SOCIALS = ("linkedin", "instagram", "youtube", "x", "facebook")


def _now():
    return datetime.now(timezone.utc).isoformat()


def _kind(kind: str) -> dict:
    if kind not in KINDS:
        raise HTTPException(status_code=404, detail="Unknown section")
    return KINDS[kind]


def _need(user: dict, key: str, what: str):
    if not has_permission(user, key):
        raise HTTPException(status_code=403, detail=f"You don't have permission to {what} the website")


def _clean(kind: str, data: dict, partial: bool) -> dict:
    out = {}
    for f, (mx, required) in FIELDS[kind].items():
        if f not in data or data[f] is None:
            if required and not partial:
                raise HTTPException(status_code=400, detail=f"{f.capitalize()} is required")
            continue
        v = re.sub(r"\s+", " ", str(data[f])).strip() if f not in ("quote", "bio", "summary") else str(data[f]).strip()
        if required and not v:
            raise HTTPException(status_code=400, detail=f"{f.capitalize()} is required")
        if len(v) > mx:
            raise HTTPException(status_code=400, detail=f"{f.capitalize()} is too long (max {mx} characters)")
        if v and f in URL_FIELDS:
            if not re.match(r"^https?://[^\s<>\"']+$", v):
                v = "https://" + v if re.match(r"^[\w.-]+\.[a-z]{2,}(/[^\s<>\"']*)?$", v, re.I) else None
                if not v:
                    raise HTTPException(status_code=400, detail=f"{f.capitalize()} must be a web address, like https://example.com")
        if v and f in IMAGE_FIELDS:
            if not MEDIA_RE.match(v) or not (MEDIA_DIR / v.split("/", 1)[1]).is_file():
                raise HTTPException(status_code=400, detail="Upload the image again")
        out[f] = v
    for b in ("visible", "consent"):
        if b in data and data[b] is not None:
            if b == "consent" and kind != "testimonials":
                continue
            out[b] = bool(data[b])
    return out


class Item(BaseModel):
    name: Optional[str] = None
    industry: Optional[str] = None
    url: Optional[str] = None
    logo: Optional[str] = None
    quote: Optional[str] = None
    role: Optional[str] = None
    company: Optional[str] = None
    photo: Optional[str] = None
    bio: Optional[str] = None
    linkedin: Optional[str] = None
    client: Optional[str] = None
    title: Optional[str] = None
    result: Optional[str] = None
    summary: Optional[str] = None
    visible: Optional[bool] = None
    consent: Optional[bool] = None


class Order(BaseModel):
    ids: List[str]


class Number(BaseModel):
    value: str
    label: str


class SettingsIn(BaseModel):
    numbers: Optional[List[Number]] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    phone_display: Optional[str] = None
    whatsapp: Optional[str] = None
    social: Optional[Dict[str, str]] = None


# ---------------------------------------------------------------- first use: start from what's live
def _config() -> dict:
    try:
        return json.loads((WEBSITE / "site.config.json").read_text())
    except Exception:
        return {}


async def _settings() -> dict:
    doc = await db.site_settings.find_one({"id": "website"}, {"_id": 0})
    if doc:
        return doc
    c = _config()
    now = _now()
    doc = {"id": "website", "numbers": [], "email": c.get("email", ""), "phone": c.get("phone", ""), "phone_display": c.get("phoneDisplay", ""),
           "whatsapp": c.get("whatsapp", ""), "social": {k: (c.get("social") or {}).get(k, "") for k in SOCIALS}, "publish": None, "created_at": now}
    seed = {"clients": [{"name": x.get("name"), "industry": x.get("industry", ""), "url": x.get("url", "")} for x in c.get("clients") or [] if x.get("name")],
            "testimonials": [{"quote": x.get("quote"), "name": x.get("name"), "role": x.get("role", ""), "company": x.get("company", ""), "consent": True}
                             for x in c.get("testimonials") or [] if x.get("quote") and x.get("name")],
            "team": [{"name": x.get("name"), "role": x.get("role", ""), "bio": x.get("bio", ""), "linkedin": x.get("linkedin", "")} for x in c.get("team") or [] if x.get("name")],
            "cases": [{"client": x.get("client"), "title": x.get("title"), "result": x.get("result", ""), "summary": x.get("summary", "")}
                      for x in c.get("caseStudies") or [] if x.get("title")]}
    for kind, rows in seed.items():
        for i, r in enumerate(rows):
            await db[KINDS[kind]["coll"]].insert_one({"id": str(uuid.uuid4()), **r, "visible": True, "order": i, "created_at": now, "updated_at": now, "created_by": "website config"})
    await db.site_settings.update_one({"id": "website"}, {"$setOnInsert": doc}, upsert=True)
    return await db.site_settings.find_one({"id": "website"}, {"_id": 0})


async def _rows(kind: str) -> list:
    return await db[KINDS[kind]["coll"]].find({}, {"_id": 0}).sort([("order", 1), ("created_at", 1)]).to_list(500)


# ---------------------------------------------------------------- publish: export → build next to live → swap
_lock = asyncio.Lock()


async def export_content() -> dict:
    s = await _settings()
    pick = lambda r, keys: {k: r.get(k, "") for k in keys}  # noqa: E731
    data = {
        "clients": [pick(r, ("name", "industry", "url", "logo")) for r in await _rows("clients") if r.get("visible", True)],
        "testimonials": [pick(r, ("quote", "name", "role", "company", "photo")) for r in await _rows("testimonials") if r.get("visible", True) and r.get("consent")],
        "team": [pick(r, ("name", "role", "bio", "photo", "linkedin")) for r in await _rows("team") if r.get("visible", True)],
        "caseStudies": [pick(r, ("client", "title", "result", "summary")) for r in await _rows("cases") if r.get("visible", True)],
        "proof": [{"value": n["value"], "label": n["label"]} for n in s.get("numbers") or [] if n.get("value") and n.get("label")],
        "email": s.get("email", ""), "phone": s.get("phone", ""), "phoneDisplay": s.get("phone_display", ""), "whatsapp": s.get("whatsapp", ""),
        "social": {k: (s.get("social") or {}).get(k, "") for k in SOCIALS},
        "exported_at": _now(),
    }
    CONTENT_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = CONTENT_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    os.replace(tmp, CONTENT_FILE)
    return data


async def publish(user: Optional[dict] = None) -> dict:
    async with _lock:
        state = {"at": _now(), "by": (user or {}).get("name") or "system"}
        try:
            await export_content()
            node = os.environ.get("NODE_BIN") or shutil.which("node") or next((n for n in ("/usr/bin/node", "/usr/local/bin/node") if os.path.exists(n)), None)
            if not node or not (WEBSITE / "build.mjs").is_file():
                raise RuntimeError("Node.js isn't available on this server, so the website couldn't be rebuilt")
            new, prev = SITE_DIR.with_name(SITE_DIR.name + ".new"), SITE_DIR.with_name(SITE_DIR.name + ".prev")
            shutil.rmtree(new, ignore_errors=True)
            env = {**os.environ, "OUT_DIR": str(new), "CONTENT_FILE": str(CONTENT_FILE),
                   "PATH": f"{WEBSITE / '.tools' / 'node_modules' / '.bin'}{os.pathsep}{os.environ.get('PATH', '')}"}
            env.pop("PREVIEW", None)
            proc = await asyncio.create_subprocess_exec(node, "build.mjs", cwd=str(WEBSITE), env=env,
                                                        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            try:
                out, err = await asyncio.wait_for(proc.communicate(), timeout=180)
            except asyncio.TimeoutError:
                proc.kill()
                raise RuntimeError("The website build took too long")
            if proc.returncode != 0 or not (new / "index.html").is_file():
                tail = (err or out or b"").decode(errors="replace").strip().splitlines()[-3:]
                raise RuntimeError("The website build failed: " + " | ".join(tail))
            shutil.rmtree(prev, ignore_errors=True)
            if SITE_DIR.exists():
                os.replace(SITE_DIR, prev)
            os.replace(new, SITE_DIR)
            state.update(status="live", error=None)
        except Exception as e:  # content is saved either way; the editor shows what went wrong
            state.update(status="error", error=str(e)[:400])
        await db.site_settings.update_one({"id": "website"}, {"$set": {"publish": state}})
        return state


# ---------------------------------------------------------------- read
@router.get("/website")
async def get_website(user: dict = Depends(get_current_user)):
    _need(user, "website", "view")
    s = await _settings()
    return {"clients": await _rows("clients"), "testimonials": await _rows("testimonials"), "team": await _rows("team"),
            "cases": await _rows("cases"), "settings": {k: v for k, v in s.items() if k != "publish"}, "publish": s.get("publish"),
            "can_manage": has_permission(user, "website.manage"), "can_delete": has_permission(user, "website.delete")}


# ---------------------------------------------------------------- media
@router.post("/website/media")
async def upload_media(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    _need(user, "website.manage", "change")
    raw = await file.read(MAX_IMAGE + 1)
    if len(raw) > MAX_IMAGE:
        raise HTTPException(status_code=400, detail="That image is over 5 MB. Please use a smaller one.")
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(raw))
        if im.format not in ("PNG", "JPEG", "WEBP"):
            raise ValueError
        im.load()
    except Exception:
        raise HTTPException(status_code=400, detail="Use a PNG, JPG or WebP image")
    im = im.convert("RGBA") if (im.mode in ("RGBA", "LA", "P") and ("transparency" in im.info or im.mode != "P")) else im.convert("RGB")
    im.thumbnail((1600, 1600))
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4()}.webp"
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=88, method=5)
    (MEDIA_DIR / name).write_bytes(buf.getvalue())
    await log_activity(user, "website_media_uploaded", "website", name, file.filename or name)
    return {"path": f"media/{name}", "url": f"/media/{name}", "width": im.width, "height": im.height}


# ---------------------------------------------------------------- items
@router.post("/website/{kind}")
async def create_item(kind: str, body: Item, user: dict = Depends(get_current_user)):
    spec = _kind(kind)
    _need(user, "website.manage", "change")
    await _settings()
    data = _clean(kind, body.model_dump(), partial=False)
    last = await db[spec["coll"]].find({}, {"_id": 0, "order": 1}).sort("order", -1).to_list(1)
    now = _now()
    doc = {"id": str(uuid.uuid4()), "visible": True, **({"consent": False} if kind == "testimonials" else {}), **data,
           "order": (last[0].get("order", 0) + 1) if last else 0, "created_at": now, "updated_at": now, "created_by": user.get("id")}
    await db[spec["coll"]].insert_one(dict(doc))
    await log_activity(user, "website_item_created", spec["coll"], doc["id"], doc.get("name") or doc.get("title"))
    return {"item": {k: v for k, v in doc.items() if k != "_id"}, "publish": await publish(user)}


@router.put("/website/{kind}/{item_id}")
async def update_item(kind: str, item_id: str, body: Item, user: dict = Depends(get_current_user)):
    spec = _kind(kind)
    _need(user, "website.manage", "change")
    existing = await db[spec["coll"]].find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail=f"That {spec['label']} no longer exists")
    data = _clean(kind, body.model_dump(exclude_unset=True), partial=True)
    data["updated_at"] = _now()
    await db[spec["coll"]].update_one({"id": item_id}, {"$set": data})
    await log_activity(user, "website_item_updated", spec["coll"], item_id, existing.get("name") or existing.get("title"))
    return {"item": await db[spec["coll"]].find_one({"id": item_id}, {"_id": 0}), "publish": await publish(user)}


@router.post("/website/{kind}/order")
async def reorder(kind: str, body: Order, user: dict = Depends(get_current_user)):
    spec = _kind(kind)
    _need(user, "website.manage", "change")
    for i, rid in enumerate(body.ids[:500]):
        await db[spec["coll"]].update_one({"id": rid}, {"$set": {"order": i}})
    return {"ok": True, "publish": await publish(user)}


@router.delete("/website/{kind}/{item_id}")
async def delete_item(kind: str, item_id: str, user: dict = Depends(get_current_user)):
    spec = _kind(kind)
    _need(user, "website.delete", "delete from")
    existing = await db[spec["coll"]].find_one({"id": item_id})
    if not existing:
        raise HTTPException(status_code=404, detail=f"That {spec['label']} no longer exists")
    res = await hard_delete(spec["coll"], existing, user)
    return {**res, "publish": await publish(user)}


# ---------------------------------------------------------------- settings + publish
@router.put("/website-settings")
async def update_settings(body: SettingsIn, user: dict = Depends(get_current_user)):
    _need(user, "website.manage", "change")
    await _settings()
    d = body.model_dump(exclude_unset=True)
    upd = {}
    if "numbers" in d and d["numbers"] is not None:
        nums = [{"value": str(n["value"]).strip()[:20], "label": str(n["label"]).strip()[:60]} for n in d["numbers"] if str(n["value"]).strip() and str(n["label"]).strip()]
        if len(nums) > 4:
            raise HTTPException(status_code=400, detail="Up to four numbers")
        upd["numbers"] = nums
    if d.get("email") is not None:
        e = d["email"].strip()
        if e and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", e):
            raise HTTPException(status_code=400, detail="Check the email address")
        upd["email"] = e
    for f in ("phone", "phone_display"):
        if d.get(f) is not None:
            upd[f] = re.sub(r"[^\d+()\s-]", "", d[f]).strip()[:30]
    if d.get("whatsapp") is not None:
        w = re.sub(r"\D", "", d["whatsapp"])
        if w and not 8 <= len(w) <= 15:
            raise HTTPException(status_code=400, detail="WhatsApp number: digits with country code, like 919876543210")
        upd["whatsapp"] = w
    if d.get("social") is not None:
        soc = {}
        for k in SOCIALS:
            v = str(d["social"].get(k) or "").strip()
            if v and not re.match(r"^https://[^\s<>\"']+$", v):
                raise HTTPException(status_code=400, detail=f"{k.capitalize()} link must start with https://")
            soc[k] = v
        upd["social"] = soc
    upd["updated_at"] = _now()
    await db.site_settings.update_one({"id": "website"}, {"$set": upd})
    await log_activity(user, "website_settings_updated", "website", "website", "Numbers & contact details")
    s = await _settings()
    return {"settings": {k: v for k, v in s.items() if k != "publish"}, "publish": await publish(user)}


@router.post("/website-publish")
async def publish_now(user: dict = Depends(get_current_user)):
    _need(user, "website.manage", "publish")
    await _settings()
    state = await publish(user)
    await log_activity(user, "website_published", "website", "website", state.get("status"))
    return state
