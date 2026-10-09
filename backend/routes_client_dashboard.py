"""v2.7 Customer dashboard + client portal + branded PDF report.

One builder (`build_client_dashboard`) feeds three surfaces:
  • internal:  GET /api/clients/{id}/dashboard, GET /api/clients/{id}/dashboard/report (PDF)   — `clients` perm, branch scoped
  • portal:    POST /api/portal/login, GET /api/portal/me|dashboard|report, POST /api/portal/change-password
  • admin:     /api/clients/{id}/portal-users  (create / reset password / disable / remove client logins) — `client_portal`

Portal users live in their own collection (`portal_users`) and get a token of type "portal", which every
internal endpoint rejects (they require type "access") — a client can only ever reach /api/portal/* for their
own client record. Nothing internal (costs, profit, credentials, notes, other clients) is in the payload.
"""
import os
import uuid
from io import BytesIO
from datetime import datetime, timezone, timedelta, date
from typing import Optional
import jwt
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from database import db
from auth import get_current_user, log_activity, hash_password, verify_password
from permissions import has_permission, scoped_client_ids

router = APIRouter()

PERIODS = {
    "this_month": "This month", "last_month": "Last month", "last_3_months": "Last 3 months",
    "last_6_months": "Last 6 months", "ytd": "Year to date", "custom": "Custom range",
}


# ------------------------------------------------------------------ period helpers
def resolve_period(period: str = "this_month", start: Optional[str] = None, end: Optional[str] = None, today: Optional[date] = None):
    today = today or date.today()
    first = today.replace(day=1)
    if period == "last_month":
        e = first - timedelta(days=1)
        s = e.replace(day=1)
    elif period == "last_3_months":
        s = (first - timedelta(days=62)).replace(day=1)
        e = today
    elif period == "last_6_months":
        m = first
        for _ in range(5):
            m = (m - timedelta(days=1)).replace(day=1)
        s, e = m, today
    elif period == "ytd":
        s, e = today.replace(month=1, day=1), today
    elif period == "custom":
        try:
            s, e = date.fromisoformat(start), date.fromisoformat(end)
        except Exception:
            raise HTTPException(status_code=400, detail="Custom range needs start and end dates (YYYY-MM-DD)")
        if e < s:
            raise HTTPException(status_code=400, detail="End date must be after the start date")
    else:
        period = "this_month"
        s, e = first, today
    return {"key": period, "label": PERIODS.get(period, period), "start": s.isoformat(), "end": e.isoformat()}


def _in(d, p):
    return bool(d) and p["start"] <= d[:10] <= p["end"]


# ------------------------------------------------------------------ builder
async def build_client_dashboard(client_id: str, p: dict) -> dict:
    c = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    today = date.today().isoformat()
    soon = (date.today() + timedelta(days=45)).isoformat()
    users = {u["id"]: u for u in await db.users.find({}, {"_id": 0, "id": 1, "name": 1, "role": 1, "designation": 1}).to_list(2000)}

    # projects
    projects = await db.projects.find({"client_id": client_id}, {"_id": 0}).to_list(500)
    prows, upcoming, done_ms, team = [], [], [], {}
    del_done = del_total = 0
    for pr in projects:
        dels = pr.get("deliverables") or []
        dd = sum(1 for d in dels if d.get("done"))
        del_done += dd if pr.get("status") != "completed" else 0
        del_total += len(dels) if pr.get("status") != "completed" else 0
        ms = sorted(pr.get("milestones") or [], key=lambda m: m.get("due_date") or "9999")
        nxt = next((m for m in ms if not m.get("done")), None)
        for m in ms:
            if not m.get("done") and m.get("due_date") and m["due_date"] <= soon:
                upcoming.append({"project": pr["name"], "title": m["title"], "due_date": m["due_date"], "overdue": m["due_date"] < today})
            if m.get("done") and _in(m.get("due_date"), p):
                done_ms.append({"project": pr["name"], "title": m["title"], "due_date": m.get("due_date")})
        for uid in pr.get("team_member_ids") or []:
            if uid in users:
                team[uid] = {"name": users[uid]["name"], "role": users[uid].get("designation") or users[uid].get("role", "").replace("_", " ").title()}
        prows.append({"id": pr["id"], "name": pr["name"], "status": pr.get("status"), "start_date": pr.get("start_date"),
                      "end_date": pr.get("end_date"), "progress": round(100 * dd / len(dels)) if dels else (100 if pr.get("status") == "completed" else 0),
                      "deliverables_done": dd, "deliverables_total": len(dels),
                      "next_milestone": {"title": nxt["title"], "due_date": nxt.get("due_date")} if nxt else None,
                      "description": pr.get("description") or ""})
    order = {"in_progress": 0, "review": 1, "kickoff": 2, "on_hold": 3, "completed": 4}
    prows.sort(key=lambda r: (order.get(r["status"], 9), r["name"]))
    upcoming.sort(key=lambda m: m["due_date"])

    # ads
    camps = await db.ad_campaigns.find({"client_id": client_id}, {"_id": 0}).to_list(300)
    crow, months = [], {}
    end_d = date.fromisoformat(p["end"])
    month_keys = []
    m = end_d.replace(day=1)
    for _ in range(6):
        month_keys.insert(0, m.strftime("%Y-%m"))
        m = (m - timedelta(days=1)).replace(day=1)
    for k in month_keys:
        months[k] = {"month": datetime.strptime(k, "%Y-%m").strftime("%b %y"), "spend": 0.0, "revenue": 0.0}
    for cp in camps:
        sp = rv = conv = clicks = imp = 0.0
        for s in cp.get("metrics_history") or []:
            k = (s.get("date") or "")[:7]
            if k in months:
                months[k]["spend"] += float(s.get("spend") or 0)
                months[k]["revenue"] += float(s.get("revenue") or 0)
            if _in(s.get("date"), p):
                sp += float(s.get("spend") or 0); rv += float(s.get("revenue") or 0)
                conv += float(s.get("conversions") or 0); clicks += float(s.get("clicks") or 0); imp += float(s.get("impressions") or 0)
        if sp or rv or cp.get("status") == "active":
            crow.append({"name": cp["name"], "platform": cp.get("platform"), "status": cp.get("status"), "spend": round(sp), "revenue": round(rv),
                         "roas": round(rv / sp, 2) if sp else None, "conversions": int(conv), "clicks": int(clicks), "impressions": int(imp)})
    crow.sort(key=lambda r: -r["spend"])
    ad_spend = sum(r["spend"] for r in crow)
    ad_rev = sum(r["revenue"] for r in crow)

    # social
    posts = await db.social_posts.find({"client_id": client_id}, {"_id": 0}).to_list(2000)
    period_posts = [x for x in posts if _in(x.get("scheduled_at"), p)]
    published = [x for x in period_posts if x.get("status") == "posted"]
    by_platform = {}
    for x in published:
        by_platform[x.get("platform", "other")] = by_platform.get(x.get("platform", "other"), 0) + 1
    two_weeks = (date.today() + timedelta(days=14)).isoformat()
    next_posts = sorted([x for x in posts if today <= (x.get("scheduled_at") or "")[:10] <= two_weeks and x.get("status") != "posted"],
                        key=lambda x: x.get("scheduled_at"))[:8]

    # payments (income booked against the client)
    income = await db.transactions.find({"client_id": client_id, "type": "income"}, {"_id": 0}).sort("date", -1).to_list(2000)
    paid = [t for t in income if _in(t.get("date"), p)]
    ytd_start = date.today().replace(month=1, day=1).isoformat()

    # contracts
    contracts = []
    for ct in c.get("contracts") or []:
        exp = ct.get("expiry_date")
        days_left = (date.fromisoformat(exp) - date.today()).days if exp else None
        contracts.append({"title": ct.get("title"), "value": ct.get("value"), "start_date": ct.get("start_date"), "expiry_date": exp,
                          "days_left": days_left, "status": "expired" if days_left is not None and days_left < 0 else "active"})

    return {
        "client": {"id": c["id"], "name": c["name"], "company": c.get("company"), "industry": c.get("industry"), "city": c.get("city"),
                   "region": c.get("region"), "status": c.get("status"), "service_type": c.get("service_type"), "retainer": c.get("retainer", False)},
        "period": p,
        "kpis": {
            "active_projects": sum(1 for r in prows if r["status"] in ("kickoff", "in_progress", "review")),
            "completed_projects": sum(1 for r in prows if r["status"] == "completed"),
            "deliverables_done": del_done, "deliverables_total": del_total,
            "milestones_done": len(done_ms), "milestones_upcoming": len(upcoming),
            "ad_spend": round(ad_spend), "ad_revenue": round(ad_rev), "roas": round(ad_rev / ad_spend, 2) if ad_spend else None,
            "conversions": sum(r["conversions"] for r in crow),
            "posts_published": len(published), "posts_planned": sum(1 for x in period_posts if x.get("status") != "posted"),
            "paid_in_period": round(sum(float(t.get("amount") or 0) for t in paid)),
            "paid_ytd": round(sum(float(t.get("amount") or 0) for t in income if (t.get("date") or "") >= ytd_start)),
        },
        "projects": prows,
        "milestones_upcoming": upcoming[:12],
        "milestones_done": done_ms,
        "ads": {"monthly": [{**v, "spend": round(v["spend"]), "revenue": round(v["revenue"])} for v in months.values()], "campaigns": crow},
        "social": {"by_platform": [{"name": k, "value": v} for k, v in sorted(by_platform.items(), key=lambda x: -x[1])],
                   "upcoming": [{"date": (x.get("scheduled_at") or "")[:10], "platform": x.get("platform"), "content_type": x.get("content_type"),
                                 "caption": x.get("caption")} for x in next_posts]},
        "payments": [{"date": t.get("date"), "description": t.get("description"), "invoice_ref": t.get("invoice_ref"), "amount": t.get("amount")} for t in paid],
        "contracts": contracts,
        "team": list(team.values()),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ------------------------------------------------------------------ PDF
def build_client_report_pdf(d: dict, prepared_by: str = "") -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, KeepTogether
    from reportlab.graphics.shapes import Drawing, String
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.graphics.shapes import Rect
    from export_engine import FONT, BOLD_FONT, ORANGE_HEX, RUPEE, inr, _page_decorator

    c, k, per = d["client"], d["kpis"], d["period"]
    bio = BytesIO()
    doc = SimpleDocTemplate(bio, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=22 * mm, bottomMargin=16 * mm,
                            title=f"{c['name']} — client report")
    W = A4[0] - 28 * mm
    ink, muted, line = colors.HexColor("#111827"), colors.HexColor("#6B7280"), colors.HexColor("#E5E7EB")
    orange, peach = colors.HexColor(ORANGE_HEX), colors.HexColor("#FFF7ED")
    H1 = ParagraphStyle("h1", fontName=BOLD_FONT, fontSize=18, textColor=ink, leading=22)
    SUB = ParagraphStyle("sub", fontName=FONT, fontSize=9, textColor=muted, leading=12)
    H2 = ParagraphStyle("h2", fontName=BOLD_FONT, fontSize=11.5, textColor=orange, spaceBefore=12, spaceAfter=5)
    CELL = ParagraphStyle("cell", fontName=FONT, fontSize=8.2, textColor=ink, leading=10.5)
    CELLM = ParagraphStyle("cellm", parent=CELL, textColor=muted)
    EMPTY = ParagraphStyle("empty", fontName=FONT, fontSize=8.5, textColor=muted)
    esc = lambda s: (str(s) if s is not None else "—").replace("&", "&amp;").replace("<", "&lt;")

    def dd(iso):
        try:
            x = date.fromisoformat(str(iso)[:10])
            return f"{x.day} {x.strftime('%b %Y')}"
        except Exception:
            return "—"

    story = [Paragraph(esc(c["name"]), H1),
             Paragraph(f"Client report · {esc(per['label'])} ({dd(per['start'])} – {dd(per['end'])})" + (f" · {esc(c.get('company'))}" if c.get("company") else ""), SUB),
             Spacer(1, 8)]

    tiles = [("Active projects", str(k["active_projects"])),
             ("Deliverables done", f"{k['deliverables_done']}/{k['deliverables_total']}"),
             ("Milestones hit", str(k["milestones_done"])),
             ("Ad spend", inr(k["ad_spend"])), ("Ad revenue", inr(k["ad_revenue"])),
             ("ROAS", f"{k['roas']}x" if k["roas"] else "—"),
             ("Posts published", str(k["posts_published"])), ("Paid this period", inr(k["paid_in_period"]))]
    rows = []
    for i in range(0, len(tiles), 4):
        chunk = tiles[i:i + 4]
        rows.append([Paragraph(esc(t[0]).upper(), ParagraphStyle("tl", fontName=BOLD_FONT, fontSize=6.5, textColor=muted)) for t in chunk])
        rows.append([Paragraph(f"<b>{esc(t[1])}</b>", ParagraphStyle("tv", fontName=BOLD_FONT, fontSize=12.5, textColor=ink)) for t in chunk])
    t = Table(rows, colWidths=[W / 4] * 4)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), peach), ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#FDBA74")),
                           ("LINEBELOW", (0, 1), (-1, 1), 0.4, colors.HexColor("#FED7AA")),
                           ("LEFTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story.append(t)

    def table(headers, data, widths, right=()):
        hdr = [Paragraph(f"<b>{h}</b>", ParagraphStyle("hd", fontName=BOLD_FONT, fontSize=7.5, textColor=colors.white)) for h in headers]
        tb = Table([hdr] + data, colWidths=[W * w for w in widths], repeatRows=1)
        st = [("BACKGROUND", (0, 0), (-1, 0), orange), ("GRID", (0, 0), (-1, -1), 0.25, line), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
              ("FONTNAME", (0, 1), (-1, -1), FONT), ("FONTSIZE", (0, 1), (-1, -1), 8.2), ("TEXTCOLOR", (0, 1), (-1, -1), ink),
              ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FFFBF7")]),
              ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5)]
        for i in right:
            st.append(("ALIGN", (i, 0), (i, -1), "RIGHT"))
        tb.setStyle(TableStyle(st))
        return tb

    def bar(pct):
        pct = max(0, min(100, int(pct or 0)))
        dr = Drawing(70, 8)
        dr.add(Rect(0, 1, 52, 5, fillColor=colors.HexColor("#F3F4F6"), strokeColor=None))
        dr.add(Rect(0, 1, 52 * pct / 100, 5, fillColor=orange, strokeColor=None))
        dr.add(String(56, 1, f"{pct}%", fontName=FONT, fontSize=6.5, fillColor=muted))
        return dr

    # projects
    story.append(Paragraph("Projects", H2))
    if d["projects"]:
        story.append(table(["Project", "Status", "Progress", "Next milestone", "Ends"],
                           [[Paragraph(f"<b>{esc(r['name'])}</b>", CELL), Paragraph(esc((r['status'] or '').replace('_', ' ').title()), CELL), bar(r["progress"]),
                             Paragraph(esc(f"{r['next_milestone']['title']} · {dd(r['next_milestone']['due_date'])}" if r["next_milestone"] else "—"), CELLM),
                             Paragraph(dd(r.get("end_date")), CELLM)] for r in d["projects"]],
                           [0.30, 0.12, 0.17, 0.27, 0.14]))
    else:
        story.append(Paragraph("No projects yet.", EMPTY))

    if d["milestones_upcoming"]:
        story.append(Paragraph("Coming up next", H2))
        story.append(table(["Due", "Milestone", "Project"],
                           [[Paragraph(dd(m["due_date"]) + (" (overdue)" if m["overdue"] else ""), CELL), Paragraph(esc(m["title"]), CELL), Paragraph(esc(m["project"]), CELLM)]
                            for m in d["milestones_upcoming"]], [0.2, 0.45, 0.35]))

    # ads
    story.append(Paragraph("Advertising", H2))
    monthly = d["ads"]["monthly"]
    if any(m["spend"] or m["revenue"] for m in monthly):
        dr = Drawing(W, 120)
        ch = VerticalBarChart()
        ch.x, ch.y, ch.width, ch.height = 30, 18, W - 50, 90
        ch.data = [[m["spend"] for m in monthly], [m["revenue"] for m in monthly]]
        ch.categoryAxis.categoryNames = [m["month"] for m in monthly]
        ch.categoryAxis.labels.fontName, ch.categoryAxis.labels.fontSize = FONT, 7
        ch.valueAxis.labels.fontName, ch.valueAxis.labels.fontSize = FONT, 6.5
        ch.valueAxis.labelTextFormat = lambda v: f"{RUPEE}{v / 1000:.0f}k" if v < 100000 else f"{RUPEE}{v / 100000:.1f}L"
        ch.valueAxis.valueMin = 0
        ch.bars[0].fillColor, ch.bars[1].fillColor = colors.HexColor("#D1D5DB"), orange
        ch.bars.strokeColor = None
        ch.barSpacing, ch.groupSpacing = 1.5, 8
        dr.add(ch)
        dr.add(Rect(W - 150, 112, 6, 6, fillColor=colors.HexColor("#D1D5DB"), strokeColor=None))
        dr.add(String(W - 141, 112, "Spend", fontName=FONT, fontSize=7, fillColor=muted))
        dr.add(Rect(W - 100, 112, 6, 6, fillColor=orange, strokeColor=None))
        dr.add(String(W - 91, 112, "Revenue", fontName=FONT, fontSize=7, fillColor=muted))
        story.append(dr)
    if d["ads"]["campaigns"]:
        story.append(table(["Campaign", "Platform", "Spend", "Revenue", "ROAS", "Conversions"],
                           [[Paragraph(esc(r["name"]), CELL), Paragraph(esc((r["platform"] or "").replace("_", " ").title()), CELLM), inr(r["spend"]), inr(r["revenue"]),
                             f"{r['roas']}x" if r["roas"] else "—", f"{r['conversions']:,}"] for r in d["ads"]["campaigns"]],
                           [0.34, 0.14, 0.14, 0.14, 0.1, 0.14], right=(2, 3, 4, 5)))
    elif not any(m["spend"] for m in monthly):
        story.append(Paragraph("No ad campaigns in this period.", EMPTY))

    # social
    story.append(Paragraph("Social media", H2))
    soc = d["social"]
    story.append(Paragraph(f"{k['posts_published']} post{'' if k['posts_published'] == 1 else 's'} published" + (" — " + ", ".join(f"{b['value']} on {b['name'].title()}" for b in soc["by_platform"]) if soc["by_platform"] else "")
                           + (f" · {k['posts_planned']} more planned in this period" if k["posts_planned"] else ""), CELL))
    if soc["upcoming"]:
        story.append(Spacer(1, 4))
        story.append(table(["Date", "Platform", "Type", "Post"],
                           [[dd(x["date"]), Paragraph(esc((x["platform"] or "").title()), CELLM), Paragraph(esc((x.get("content_type") or "").title()), CELLM), Paragraph(esc(x["caption"]), CELL)]
                            for x in soc["upcoming"]], [0.14, 0.14, 0.12, 0.6]))

    # payments + contracts
    story.append(Paragraph("Payments received", H2))
    if d["payments"]:
        story.append(table(["Date", "Description", "Invoice", "Amount"],
                           [[dd(x["date"]), Paragraph(esc(x["description"]), CELL), Paragraph(esc(x.get("invoice_ref") or "—"), CELLM), inr(x["amount"])] for x in d["payments"]],
                           [0.14, 0.52, 0.16, 0.18], right=(3,)))
    else:
        story.append(Paragraph("No payments recorded in this period.", EMPTY))
    story.append(Paragraph(f"Total received this year: <b>{inr(k['paid_ytd'])}</b>", CELLM))
    if d["contracts"]:
        story.append(Paragraph("Agreements", H2))
        story.append(table(["Agreement", "Start", "Renews / ends", "Value"],
                           [[Paragraph(esc(x["title"]), CELL), dd(x.get("start_date")),
                             dd(x.get("expiry_date")) + (f" ({x['days_left']} days)" if x.get("days_left") is not None and x["days_left"] >= 0 else ""),
                             inr(x["value"]) if x.get("value") else "—"] for x in d["contracts"]], [0.42, 0.16, 0.24, 0.18], right=(3,)))
    if d["team"]:
        story.append(Paragraph("Your dotindot team", H2))
        story.append(Paragraph(" · ".join(f"<b>{esc(m['name'])}</b> ({esc(m['role'])})" for m in d["team"]), CELL))
    story.append(Spacer(1, 10))
    story.append(Paragraph("Questions about this report? Reply to your dotindot account manager — we're happy to walk you through it.", CELLM))

    deco = _page_decorator(f"{c['name']} — client report", prepared_by)
    doc.build(story, onFirstPage=deco, onLaterPages=deco)
    return bio.getvalue()


def _pdf_response(data: bytes, client_name: str, period: dict):
    safe = "".join(ch if ch.isalnum() else "-" for ch in client_name).strip("-").lower() or "client"
    fname = f"dotindot-report-{safe}-{period['start']}-to-{period['end']}.pdf"
    return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{fname}"'})


async def _check_client_access(user: dict, client_id: str):
    if not has_permission(user, "clients"):
        raise HTTPException(status_code=403, detail="You don't have permission for this module")
    allowed = await scoped_client_ids(user)
    if allowed is not None and client_id not in allowed:
        raise HTTPException(status_code=403, detail="This client belongs to a branch outside your access")


# ------------------------------------------------------------------ internal endpoints
@router.get("/clients/{client_id}/dashboard")
async def client_dashboard(client_id: str, period: str = "this_month", start: Optional[str] = None, end: Optional[str] = None,
                           user: dict = Depends(get_current_user)):
    await _check_client_access(user, client_id)
    d = await build_client_dashboard(client_id, resolve_period(period, start, end))
    d["portal_users"] = await db.portal_users.count_documents({"client_id": client_id, "is_active": True})
    d["periods"] = [{"value": k, "label": v} for k, v in PERIODS.items()]
    return d


@router.get("/clients/{client_id}/dashboard/report")
async def client_report(client_id: str, period: str = "this_month", start: Optional[str] = None, end: Optional[str] = None,
                        user: dict = Depends(get_current_user)):
    await _check_client_access(user, client_id)
    p = resolve_period(period, start, end)
    d = await build_client_dashboard(client_id, p)
    data = build_client_report_pdf(d, prepared_by=user.get("name", ""))
    await log_activity(user, "client_report_exported", "client", client_id, f"{d['client']['name']} · {p['start']} → {p['end']}")
    return _pdf_response(data, d["client"]["name"], p)


# ------------------------------------------------------------------ portal user management
class PortalUserIn(BaseModel):
    name: str
    email: str
    password: str


class PortalUserUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None


def _need_portal_admin(user):
    if not has_permission(user, "client_portal"):
        raise HTTPException(status_code=403, detail="You don't have permission to manage client logins")


def _safe_portal(u):
    return {k: v for k, v in u.items() if k not in ("password_hash", "_id")}


@router.get("/clients/{client_id}/portal-users")
async def list_portal_users(client_id: str, user: dict = Depends(get_current_user)):
    await _check_client_access(user, client_id)
    rows = await db.portal_users.find({"client_id": client_id}, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(100)
    return {"users": rows, "can_manage": has_permission(user, "client_portal")}


@router.post("/clients/{client_id}/portal-users")
async def create_portal_user(client_id: str, body: PortalUserIn, user: dict = Depends(get_current_user)):
    await _check_client_access(user, client_id)
    _need_portal_admin(user)
    c = await db.clients.find_one({"id": client_id}, {"_id": 0, "name": 1})
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    email = body.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if await db.portal_users.find_one({"email": email}) or await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="That email already has a login")
    doc = {"id": str(uuid.uuid4()), "client_id": client_id, "name": body.name.strip() or email, "email": email,
           "password_hash": hash_password(body.password), "is_active": True, "last_login": None,
           "created_by": user["id"], "created_at": datetime.now(timezone.utc).isoformat()}
    await db.portal_users.insert_one(dict(doc))
    await log_activity(user, "portal_user_created", "client", client_id, f"{c['name']} · {email}")
    return _safe_portal(doc)


@router.put("/clients/{client_id}/portal-users/{pid}")
async def update_portal_user(client_id: str, pid: str, body: PortalUserUpdate, user: dict = Depends(get_current_user)):
    await _check_client_access(user, client_id)
    _need_portal_admin(user)
    pu = await db.portal_users.find_one({"id": pid, "client_id": client_id})
    if not pu:
        raise HTTPException(status_code=404, detail="Login not found")
    u = {}
    if body.name is not None:
        u["name"] = body.name.strip()
    if body.is_active is not None:
        u["is_active"] = body.is_active
    if body.password:
        if len(body.password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        u["password_hash"] = hash_password(body.password)
    if u:
        await db.portal_users.update_one({"id": pid}, {"$set": u})
    what = "password reset" if body.password else ("disabled" if body.is_active is False else "enabled" if body.is_active else "updated")
    await log_activity(user, "portal_user_updated", "client", client_id, f"{pu['email']} · {what}")
    return _safe_portal(await db.portal_users.find_one({"id": pid}, {"_id": 0}))


@router.delete("/clients/{client_id}/portal-users/{pid}")
async def delete_portal_user(client_id: str, pid: str, user: dict = Depends(get_current_user)):
    await _check_client_access(user, client_id)
    _need_portal_admin(user)
    pu = await db.portal_users.find_one({"id": pid, "client_id": client_id})
    if not pu:
        raise HTTPException(status_code=404, detail="Login not found")
    await db.portal_users.delete_one({"id": pid})
    await log_activity(user, "portal_user_removed", "client", client_id, pu["email"])
    return {"ok": True}


# ------------------------------------------------------------------ client portal
class PortalLogin(BaseModel):
    email: str
    password: str


class PortalPassword(BaseModel):
    current_password: str
    new_password: str


def _portal_token(pu: dict) -> str:
    payload = {"sub": pu["id"], "client_id": pu["client_id"], "type": "portal",
               "exp": datetime.now(timezone.utc) + timedelta(hours=12)}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm="HS256")


async def get_portal_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        raise HTTPException(status_code=401, detail="Not signed in")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Your session expired — sign in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session")
    if payload.get("type") != "portal":
        raise HTTPException(status_code=401, detail="Use the client portal login")
    pu = await db.portal_users.find_one({"id": payload.get("sub")}, {"_id": 0})
    if not pu or not pu.get("is_active", True):
        raise HTTPException(status_code=401, detail="This login has been disabled")
    if not await db.clients.find_one({"id": pu["client_id"]}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=401, detail="This account is no longer available")
    return pu


@router.post("/portal/login")
async def portal_login(body: PortalLogin):
    pu = await db.portal_users.find_one({"email": body.email.strip().lower()})
    if not pu or not verify_password(body.password, pu["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not pu.get("is_active", True):
        raise HTTPException(status_code=403, detail="This login has been disabled. Contact your account manager.")
    c = await db.clients.find_one({"id": pu["client_id"]}, {"_id": 0, "id": 1, "name": 1})
    if not c:
        raise HTTPException(status_code=403, detail="This account is no longer available")
    now = datetime.now(timezone.utc).isoformat()
    await db.portal_users.update_one({"id": pu["id"]}, {"$set": {"last_login": now}})
    await log_activity({"id": pu["id"], "name": pu["name"], "email": pu["email"], "role": "client"}, "portal_login", "client", c["id"], c["name"])
    return {"access_token": _portal_token(pu), "token_type": "bearer",
            "user": {"id": pu["id"], "name": pu["name"], "email": pu["email"], "client_id": c["id"], "client_name": c["name"]}}


@router.get("/portal/me")
async def portal_me(pu: dict = Depends(get_portal_user)):
    c = await db.clients.find_one({"id": pu["client_id"]}, {"_id": 0, "name": 1})
    return {"id": pu["id"], "name": pu["name"], "email": pu["email"], "client_id": pu["client_id"], "client_name": c["name"],
            "periods": [{"value": k, "label": v} for k, v in PERIODS.items()]}


@router.get("/portal/dashboard")
async def portal_dashboard(period: str = "this_month", start: Optional[str] = None, end: Optional[str] = None,
                           pu: dict = Depends(get_portal_user)):
    return await build_client_dashboard(pu["client_id"], resolve_period(period, start, end))


@router.get("/portal/report")
async def portal_report(period: str = "this_month", start: Optional[str] = None, end: Optional[str] = None,
                        pu: dict = Depends(get_portal_user)):
    p = resolve_period(period, start, end)
    d = await build_client_dashboard(pu["client_id"], p)
    await log_activity({"id": pu["id"], "name": pu["name"], "email": pu["email"], "role": "client"}, "portal_report_downloaded",
                       "client", pu["client_id"], f"{p['start']} → {p['end']}")
    return _pdf_response(build_client_report_pdf(d, prepared_by="dotindot Creative"), d["client"]["name"], p)


@router.post("/portal/change-password")
async def portal_change_password(body: PortalPassword, pu: dict = Depends(get_portal_user)):
    full = await db.portal_users.find_one({"id": pu["id"]})
    if not verify_password(body.current_password, full["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    await db.portal_users.update_one({"id": pu["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    return {"ok": True}
