"""AI settings — the AI providers dotindot's own features use (the website chat assistant, Dot).

Settings → AI → AI providers (permission `ai_settings`): Anthropic (Claude), OpenAI, Google Gemini, OpenRouter or any
OpenAI-compatible endpoint. Keys are encrypted at rest and only their last 4 characters are ever shown. "Test" checks
the key with the provider.

AI apps that work *in* dotindot (Claude, ChatGPT, scripts) connect through ai_connector.py instead.
"""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request
from database import db
from auth import get_current_user, log_activity, encrypt_secret, decrypt_secret
from permissions import has_permission

router = APIRouter()

PROVIDERS = {
    "anthropic": {"label": "Anthropic (Claude)", "default_model": "claude-sonnet-5-5", "base_url": "https://api.anthropic.com"},
    "openai": {"label": "OpenAI", "default_model": "", "base_url": "https://api.openai.com/v1"},
    "google": {"label": "Google Gemini", "default_model": "", "base_url": "https://generativelanguage.googleapis.com"},
    "openrouter": {"label": "OpenRouter", "default_model": "", "base_url": "https://openrouter.ai/api/v1"},
    "custom": {"label": "Custom (OpenAI-compatible)", "default_model": "", "base_url": ""},
}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _public_providers(provs: dict) -> dict:
    out = {}
    for k, meta in PROVIDERS.items():
        p = provs.get(k) or {}
        out[k] = {"label": meta["label"], "connected": bool(p.get("key_enc")), "key_hint": p.get("key_hint", ""), "model": p.get("model") or meta["default_model"],
                  "base_url": p.get("base_url") or meta["base_url"], "last_test": p.get("last_test")}
    return out


def _need(user):
    if user.get("is_agent") or not has_permission(user, "ai_settings"):
        raise HTTPException(status_code=403, detail="AI settings need the AI settings permission")


# ------------------------------------------------------------------ settings UI
@router.get("/ai-settings")
async def get_settings(request: Request, user: dict = Depends(get_current_user)):
    _need(user)
    d = await db.settings.find_one({"id": "ai"}, {"_id": 0}) or {}
    return {"providers": _public_providers(d.get("providers") or {}), "default_provider": d.get("default_provider") or "",
            "can_manage": True, "updated_at": d.get("updated_at"), "updated_by": d.get("updated_by")}


class SettingsIn(BaseModel):
    default_provider: Optional[str] = None


@router.put("/ai-settings")
async def save_settings(body: SettingsIn, request: Request, user: dict = Depends(get_current_user)):
    _need(user)
    if body.default_provider is None:
        raise HTTPException(status_code=400, detail="Nothing to change")
    if body.default_provider and body.default_provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail="Unknown provider")
    await db.settings.update_one({"id": "ai"}, {"$set": {"id": "ai", "default_provider": body.default_provider, "updated_at": _now(), "updated_by": user["name"]}}, upsert=True)
    await log_activity(user, "ai_settings_updated", "settings", "ai", f"default provider: {PROVIDERS.get(body.default_provider, {}).get('label', 'none')}")
    return await get_settings(request, user)


class ProviderIn(BaseModel):
    api_key: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None
    remove: bool = False


@router.put("/ai-settings/providers/{provider}")
async def save_provider(provider: str, body: ProviderIn, request: Request, user: dict = Depends(get_current_user)):
    _need(user)
    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider")
    d = await db.settings.find_one({"id": "ai"}, {"_id": 0}) or {}
    provs = d.get("providers") or {}
    if body.remove:
        provs.pop(provider, None)
        what = "removed"
    else:
        p = provs.get(provider) or {}
        if body.api_key:
            k = body.api_key.strip()
            if len(k) < 12:
                raise HTTPException(status_code=400, detail="That key looks too short")
            p["key_enc"], p["key_hint"] = encrypt_secret(k), "…" + k[-4:]
            p["last_test"] = None
        if body.model is not None:
            p["model"] = body.model.strip()[:100]
        if body.base_url is not None:
            if body.base_url and not body.base_url.startswith("https://"):
                raise HTTPException(status_code=400, detail="Base URL must start with https://")
            p["base_url"] = body.base_url.strip()[:300]
        if not p.get("key_enc"):
            raise HTTPException(status_code=400, detail="Paste the API key")
        provs[provider] = p
        what = "saved"
    await db.settings.update_one({"id": "ai"}, {"$set": {"id": "ai", "providers": provs, "updated_at": _now(), "updated_by": user["name"]}}, upsert=True)
    await log_activity(user, f"ai_provider_{what}", "settings", "ai", PROVIDERS[provider]["label"])
    return await get_settings(request, user)


@router.post("/ai-settings/providers/{provider}/test")
async def test_provider(provider: str, user: dict = Depends(get_current_user)):
    _need(user)
    d = await db.settings.find_one({"id": "ai"}, {"_id": 0}) or {}
    p = (d.get("providers") or {}).get(provider)
    if not p or not p.get("key_enc"):
        raise HTTPException(status_code=400, detail="Save a key first")
    key = decrypt_secret(p["key_enc"])
    import httpx
    base = (p.get("base_url") or PROVIDERS[provider]["base_url"]).rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=10) as cx:
            if provider == "anthropic":
                r = await cx.get(f"{base}/v1/models", headers={"x-api-key": key, "anthropic-version": "2023-06-01"})
            elif provider == "google":
                r = await cx.get(f"{base}/v1beta/models", params={"key": key})
            elif provider == "openrouter":
                r = await cx.get(f"{base}/key", headers={"Authorization": f"Bearer {key}"})
            else:
                if not base:
                    raise HTTPException(status_code=400, detail="Set the base URL for the custom provider")
                r = await cx.get(f"{base}/models", headers={"Authorization": f"Bearer {key}"})
        ok = r.status_code == 200
        msg = "Connected" if ok else ("The provider rejected this key" if r.status_code in (401, 403) else f"Provider answered {r.status_code}")
    except HTTPException:
        raise
    except Exception as e:
        ok, msg = False, f"Couldn't reach the provider ({type(e).__name__}) — check the server's internet access"
    result = {"ok": ok, "message": msg, "at": _now()}
    await db.settings.update_one({"id": "ai"}, {"$set": {f"providers.{provider}.last_test": result}})
    return result


# ------------------------------------------------------------------ text generation (used by the website chat assistant)
class AIUnavailable(Exception):
    """No usable provider/key/model, or the provider failed — callers fall back to something that doesn't need AI."""


async def pick_provider(preferred: str = "") -> Optional[str]:
    d = await db.settings.find_one({"id": "ai"}, {"_id": 0}) or {}
    provs = d.get("providers") or {}
    for k in [preferred, d.get("default_provider") or "", "anthropic", "openai", "google", "openrouter", "custom"]:
        if k and k in PROVIDERS and (provs.get(k) or {}).get("key_enc"):
            return k
    return None


async def llm_complete(system: str, messages: List[dict], max_tokens: int = 400, provider: str = "", model: str = "",
                       json_mode: bool = False, timeout: float = 25) -> str:
    """One reply from the configured provider. messages: [{"role": "user"|"assistant", "content": str}]."""
    import httpx
    prov = await pick_provider(provider)
    if not prov:
        raise AIUnavailable("No AI provider is connected (Settings → AI)")
    d = await db.settings.find_one({"id": "ai"}, {"_id": 0}) or {}
    p = (d.get("providers") or {}).get(prov) or {}
    key = decrypt_secret(p["key_enc"])
    mdl = (model or p.get("model") or PROVIDERS[prov]["default_model"] or "").strip()
    base = (p.get("base_url") or PROVIDERS[prov]["base_url"]).rstrip("/")
    if not mdl:
        raise AIUnavailable(f"Choose a model for {PROVIDERS[prov]['label']} in Settings → AI")
    msgs = [m for m in messages if m.get("content")]
    while msgs and msgs[0]["role"] != "user":
        msgs.pop(0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as cx:
            if prov == "anthropic":
                r = await cx.post(f"{base}/v1/messages", headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                                  json={"model": mdl, "max_tokens": max_tokens, "messages": msgs,
                                        "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]})
                r.raise_for_status()
                return "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text")
            if prov == "google":
                body = {"systemInstruction": {"parts": [{"text": system}]}, "generationConfig": {"maxOutputTokens": max_tokens},
                        "contents": [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]} for m in msgs]}
                if json_mode:
                    body["generationConfig"]["responseMimeType"] = "application/json"
                r = await cx.post(f"{base}/v1beta/models/{mdl}:generateContent", params={"key": key}, json=body)
                r.raise_for_status()
                parts = ((r.json().get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
                return "".join(x.get("text", "") for x in parts)
            if not base:
                raise AIUnavailable("Set the base URL for the custom provider in Settings → AI")
            body = {"model": mdl, "messages": [{"role": "system", "content": system}] + msgs}
            body["max_completion_tokens" if prov == "openai" else "max_tokens"] = max_tokens  # newer OpenAI models only take the former
            if json_mode and prov == "openai":
                body["response_format"] = {"type": "json_object"}
            r = await cx.post(f"{base}/chat/completions", headers={"Authorization": f"Bearer {key}"}, json=body)
            r.raise_for_status()
            return ((r.json().get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    except AIUnavailable:
        raise
    except Exception as e:  # network, quota, bad key or model: the caller falls back
        detail = ""
        if hasattr(e, "response") and getattr(e, "response", None) is not None:
            try:
                detail = f" ({e.response.status_code})"
            except Exception:
                pass
        raise AIUnavailable(f"{PROVIDERS[prov]['label']} didn't answer{detail}")
