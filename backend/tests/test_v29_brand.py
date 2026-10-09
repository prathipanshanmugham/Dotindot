"""v2.9 — new dotindot logo in every PDF (header wordmark + footer mark) and Excel export (wordmark image)."""
import io
import os
import zipfile
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://agency-hub-490.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _h():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@dotindot.in", "password": "Dotindot@2026"}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_brand_assets_ship_with_backend():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for f in ("wordmark-color.png", "wordmark-white.png", "mark-color.png", "mark-white.png", "wordmark-xlsx.png"):
        assert os.path.getsize(os.path.join(here, "assets", "brand", f)) > 1000, f


def test_pdf_exports_embed_logo_images():
    h = _h()
    for path in ("/exports/clients?format=pdf", "/reports/template/monthly-financial/export?format=pdf"):
        r = requests.get(API + path, headers=h)
        assert r.status_code == 200 and r.content[:4] == b"%PDF", path
        assert r.content.count(b"/Subtype /Image") >= 2, f"logo images missing in {path}"
    clients = requests.get(f"{API}/clients", headers=h).json()
    if clients:
        r = requests.get(f"{API}/clients/{clients[0]['id']}/dashboard/report", headers=h)
        assert r.status_code == 200 and r.content.count(b"/Subtype /Image") >= 2


def test_xlsx_exports_embed_wordmark():
    r = requests.get(f"{API}/exports/clients?format=xlsx", headers=_h())
    assert r.status_code == 200
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert any(n.startswith("xl/media/") for n in z.namelist()), "no logo image in the workbook"
    assert any(n.startswith("xl/drawings/") for n in z.namelist())
