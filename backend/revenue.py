"""Recurring revenue maths shared by projects, clients and the MRR / ARR page (no routes here).

A project is billed one of two ways:
* one_time  — `budget` is what the project is worth.
* recurring — `recurring_amount` (before GST) every `billing_cycle`, from `start_date` until `end_date` (or until stopped).

MRR = the recurring amount spread over a month (a ₹30,000 quarterly retainer adds ₹10,000 MRR). ARR = MRR × 12.
A month's MRR is a snapshot of what's live on its last day (today for the current month). A project on hold is
"paused": still under contract, left out of today's MRR and shown on its own.
"""
import re
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

BILLING_TYPES = ("one_time", "recurring")
CYCLES = {"monthly": 1, "quarterly": 3, "half_yearly": 6, "yearly": 12}
CYCLE_LABEL = {"monthly": "month", "quarterly": "quarter", "half_yearly": "half-year", "yearly": "year"}
SERVICES = {"web": "Website", "software": "ERP & software", "social": "Social media", "ads": "Ads", "seo": "SEO",
            "branding": "Branding", "video": "Video", "influencer": "Influencers", "ai": "AI automation", "other": "Other"}
ACTIVE_STATUSES = ("kickoff", "in_progress", "review")
# billing service tags (routes_billing.SERVICE_TAGS) for each project service
SERVICE_TAG = {"web": "web", "software": "web", "social": "social", "ads": "ads", "seo": "seo", "branding": "branding", "video": "video",
               "influencer": "influencer", "ai": "ai", "other": "all"}

_KEYWORDS = [("software", r"\b(erp|crm|software|app|portal|dashboard|platform|odoo|system)\b"), ("social", r"\b(social|instagram|content|reels?)\b"),
             ("ads", r"\b(ads?|meta ads|google ads|ppc|campaigns?|performance)\b"), ("seo", r"\b(seo|search)\b"),
             ("web", r"\b(web ?site|ecommerce|e-commerce|landing|web)\b"), ("branding", r"\b(brand(ing)?|logo|identity)\b"),
             ("video", r"\b(video|shoot|film)\b"), ("influencer", r"\binfluencers?\b"), ("ai", r"\b(ai|chatbot|automation|agent)\b")]


def infer_service(name: str, description: str = "") -> str:
    text = f"{name or ''} {description or ''}".lower()
    for key, rx in _KEYWORDS:
        if re.search(rx, text):
            return key
    return "other"


def ist_today() -> date:
    return (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()


def to_date(v) -> Optional[date]:
    if not v:
        return None
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def month_end(y: int, m: int) -> date:
    return (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1))


def add_months(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    y += d.year
    m += 1
    return date(y, m, min(d.day, month_end(y, m).day))


def months_back(n: int, today: date) -> List[Tuple[int, int]]:
    """The last n months, oldest first, ending with today's month."""
    out, y, m = [], today.year, today.month
    for _ in range(n):
        out.append((y, m))
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    return out[::-1]


def ym(y: int, m: int) -> str:
    return f"{y:04d}-{m:02d}"


def is_recurring(p: dict) -> bool:
    return p.get("kind") != "internal" and p.get("billing_type") == "recurring" and float(p.get("recurring_amount") or 0) > 0


def monthly(p: dict) -> float:
    if not is_recurring(p):
        return 0.0
    return round(float(p["recurring_amount"]) / CYCLES.get(p.get("billing_cycle") or "monthly", 1), 2)


def live_on(p: dict, day: date) -> bool:
    """Under contract on this day (paused projects included)."""
    if not is_recurring(p):
        return False
    s, e = to_date(p.get("start_date")), to_date(p.get("end_date"))
    return bool(s) and s <= day and (e is None or e >= day)


def snapshot_day(y: int, m: int, today: date) -> date:
    return today if (y, m) == (today.year, today.month) else month_end(y, m)


def mrr_in_month(p: dict, y: int, m: int, today: date) -> float:
    day = snapshot_day(y, m, today)
    if not live_on(p, day):
        return 0.0
    if (y, m) == (today.year, today.month) and p.get("status") in ("on_hold", "completed"):
        return 0.0      # paused, or finished today
    return monthly(p)


def bill_dates(p: dict, start: date, end: date) -> List[date]:
    """Bill dates (start_date + every cycle) between start and end, inclusive, while the contract runs."""
    if not is_recurring(p):
        return []
    s, e = to_date(p.get("start_date")), to_date(p.get("end_date"))
    if not s:
        return []
    step = CYCLES.get(p.get("billing_cycle") or "monthly", 1)
    k = 0
    if start > s:   # jump close to `start` instead of walking from the beginning
        k = max(0, ((start.year - s.year) * 12 + start.month - s.month) // step - 1)
    out = []
    while True:
        d = add_months(s, k * step)
        if d > end or (e and d > e):
            break
        if d >= start:
            out.append(d)
        k += 1
        if k > 2400:
            break
    return out


def next_bill(p: dict, today: date) -> Optional[date]:
    found = bill_dates(p, today, add_months(today, 13))
    return found[0] if found else None


def period_label(p: dict, d: date) -> str:
    step = CYCLES.get(p.get("billing_cycle") or "monthly", 1)
    if step == 1:
        return d.strftime("%B %Y")
    last = add_months(d, step) - timedelta(days=1)
    return f"{d.strftime('%d %b %Y')} – {last.strftime('%d %b %Y')}"


def billing_summary(p: dict, today: Optional[date] = None) -> Dict:
    """What lists show for a project's billing."""
    today = today or ist_today()
    if is_recurring(p):
        nb = next_bill(p, today) if p.get("status") not in ("completed",) else None
        cycle = p.get("billing_cycle") or "monthly"
        return {"billing_type": "recurring", "mrr": monthly(p), "recurring_amount": float(p.get("recurring_amount") or 0), "billing_cycle": cycle,
                "billing_label": f"₹{float(p['recurring_amount']):,.0f} / {CYCLE_LABEL[cycle]}", "live": live_on(p, today) and p.get("status") not in ("on_hold", "completed"),
                "next_bill_date": nb.isoformat() if nb else None}
    return {"billing_type": "one_time", "mrr": 0.0, "billing_label": f"₹{float(p.get('budget') or 0):,.0f} one-time", "live": False, "next_bill_date": None}


def client_mrr(projects: List[dict], today: Optional[date] = None) -> float:
    today = today or ist_today()
    return round(sum(mrr_in_month(p, today.year, today.month, today) for p in projects), 2)


def movement(prev: Dict[str, float], cur: Dict[str, float]) -> Dict[str, float]:
    """Month-on-month change in MRR per client: new, growth (expansion), shrink (contraction), lost (churn)."""
    out = {"new": 0.0, "expansion": 0.0, "contraction": 0.0, "churn": 0.0}
    for cid in set(prev) | set(cur):
        a, b = prev.get(cid, 0.0), cur.get(cid, 0.0)
        if a <= 0 < b:
            out["new"] += b
        elif b <= 0 < a:
            out["churn"] += a
        elif b > a:
            out["expansion"] += b - a
        elif a > b:
            out["contraction"] += a - b
    out = {k: round(v, 2) for k, v in out.items()}
    out["net"] = round(out["new"] + out["expansion"] - out["contraction"] - out["churn"], 2)
    return out
