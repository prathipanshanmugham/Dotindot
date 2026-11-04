// v3.0 Settings → AI: switch AI access on/off, choose what each module shares, connect AI providers, issue agent
// tokens (REST + MCP) and see every AI request. Backend: routes_ai.py.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useLoad, Spinner, PageHead, PillTabs, Pill, Field, Empty, fmtDate, fmtDateTime, ago } from "@/components/kit";
import { useRecordDelete, RowDeleteControls } from "@/components/RecordDelete";
import { PasswordInput } from "@/components/PasswordInput";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Bot, Copy, KeyRound, Lock, Plug, Plus, ShieldCheck, Sparkles, Ban, CheckCircle2, XCircle, ScrollText, Database } from "lucide-react";

const LEVEL_LABEL = { none: "Off", read: "Read", write: "Read + write" };
const LEVEL_TONE = { none: "gray", read: "blue", write: "orange" };

const copy = async (text, what = "Copied") => {
  try { await navigator.clipboard.writeText(text); toast.success(what); } catch { toast.error("Couldn't copy — select the text and copy it yourself"); }
};

const CopyRow = ({ label, value, testid }) => (
  <div className="space-y-1">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
    <div className="flex items-center gap-2">
      <code className="flex-1 min-w-0 truncate rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-800" data-testid={testid}>{value}</code>
      <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => copy(value, `${label} copied`)} aria-label={`Copy ${label}`}><Copy className="h-3.5 w-3.5" /></Button>
    </div>
  </div>
);

const LevelSelect = ({ value, onChange, writable, disabled, testid, allowNone = true }) => (
  <Select value={value} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger className="h-8 w-[136px] text-xs" data-testid={testid}><SelectValue /></SelectTrigger>
    <SelectContent>
      {allowNone && <SelectItem value="none">Off</SelectItem>}
      <SelectItem value="read">Read</SelectItem>
      {writable && <SelectItem value="write">Read + write</SelectItem>}
    </SelectContent>
  </Select>
);

// ------------------------------------------------------------------ data access
function DataAccess({ s, save }) {
  const sens = s.sensitive || {};
  return (
    <div className="space-y-4">
      <Card className="border-gray-200/80 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Lock className="h-4 w-4 text-[#F26B21]" /> Sensitive data</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500">These stay hidden from every AI agent until you switch them on here, then choose a level for each module below.</p>
          {Object.entries(s.sensitive_labels).map(([k, label]) => (
            <label key={k} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2.5">
              <span className="text-sm text-gray-800">{label}</span>
              <Switch checked={!!sens[k]} disabled={!s.can_manage || !s.sensitive_yours?.[k]} onCheckedChange={(v) => save({ sensitive: { [k]: v } }, v ? `${label} can now be shared` : `${label} hidden from AI`)} data-testid={`ai-sensitive-${k}`} />
            </label>
          ))}
          <p className="text-[11px] text-gray-400 flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Passwords, password hashes, API keys and client logins are never shared with AI, whatever you set here.</p>
        </CardContent>
      </Card>
      <Card className="border-gray-200/80 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Database className="h-4 w-4 text-[#F26B21]" /> What AI can see, module by module</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-gray-500 mb-3">This is the ceiling for every agent. Each agent token can be narrower, never wider. "Read + write" lets an agent add or update records (for example move a lead's stage or reply to a ticket); it can't delete anything.</p>
          <div className="divide-y divide-gray-100" data-testid="ai-access-table">
            {s.modules.map((m) => {
              const locked = (m.sensitive && !sens[m.sensitive]) || !m.yours;
              return (
                <div key={m.key} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm text-gray-800 truncate">{m.label}</div>
                    <div className="text-[11px] text-gray-400">{!m.yours ? "You don't have access to this data yourself" : locked ? "Switch on the sensitive-data setting above first" : m.writable ? "Can be read or written" : "Read only"}</div>
                  </div>
                  <LevelSelect value={s.access[m.key] || "none"} writable={m.writable} disabled={locked || !s.can_manage} testid={`ai-access-${m.key}`}
                    onChange={(v) => save({ access: { [m.key]: v } }, `${m.label}: ${LEVEL_LABEL[v]}`)} />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ providers
function ProviderCard({ k, p, isDefault, canManage, onSaved }) {
  const [f, setF] = useState({ api_key: "", model: p.model || "", base_url: p.base_url || "" });
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState(p.last_test || null);
  useEffect(() => { setF({ api_key: "", model: p.model || "", base_url: p.base_url || "" }); setTest(p.last_test || null); }, [p]);
  const save = async (remove = false) => {
    setBusy(true);
    try {
      const body = remove ? { remove: true } : { model: f.model, base_url: f.base_url, ...(f.api_key ? { api_key: f.api_key } : {}) };
      const { data } = await api.put(`/ai-settings/providers/${k}`, body);
      toast.success(remove ? `${p.label} removed` : `${p.label} saved`); onSaved(data);
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const runTest = async () => {
    setBusy(true);
    try { const { data } = await api.post(`/ai-settings/providers/${k}/test`); setTest(data); data.ok ? toast.success(data.message) : toast.error(data.message); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Card className="border-gray-200/80 shadow-sm" data-testid={`ai-provider-${k}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-gray-900 text-sm truncate">{p.label}</div>
          <div className="flex items-center gap-1.5">
            {isDefault && <Pill tone="orange">Default</Pill>}
            {p.connected ? <Pill tone="green">Key {p.key_hint}</Pill> : <Pill>Not connected</Pill>}
          </div>
        </div>
        <Field label={p.connected ? "Replace API key" : "API key"}>
          <PasswordInput value={f.api_key} onChange={(e) => setF((x) => ({ ...x, api_key: e.target.value }))} placeholder={p.connected ? "Leave blank to keep the saved key" : "Paste the key"} disabled={!canManage} data-testid={`ai-provider-${k}-key`} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Model"><Input value={f.model} onChange={(e) => setF((x) => ({ ...x, model: e.target.value }))} placeholder="Model name" disabled={!canManage} /></Field>
          <Field label="Base URL"><Input value={f.base_url} onChange={(e) => setF((x) => ({ ...x, base_url: e.target.value }))} placeholder="https://…" disabled={!canManage} /></Field>
        </div>
        {test && <p className={`text-xs flex items-center gap-1.5 ${test.ok ? "text-emerald-700" : "text-red-600"}`}>{test.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}{test.message} · {ago(test.at)}</p>}
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="bg-[#F26B21] hover:bg-[#E05A10] text-white" disabled={busy || (!p.connected && !f.api_key)} onClick={() => save(false)} data-testid={`ai-provider-${k}-save`}>Save</Button>
            {p.connected && <Button size="sm" variant="outline" disabled={busy} onClick={runTest} data-testid={`ai-provider-${k}-test`}>Test key</Button>}
            {p.connected && <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" disabled={busy} onClick={() => save(true)}>Remove</Button>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Providers({ s, save, setS }) {
  const keys = Object.keys(s.providers);
  const connected = keys.filter((k) => s.providers[k].connected);
  return (
    <div className="space-y-4">
      <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-sm text-gray-600">Keys are encrypted on the server and only their last 4 characters are ever shown. The default provider is the one dotindot's own AI features use.</div>
        <Select value={s.default_provider || "__none"} onValueChange={(v) => save({ default_provider: v === "__none" ? "" : v }, "Default provider saved")} disabled={!s.can_manage}>
          <SelectTrigger className="sm:w-[220px]" data-testid="ai-default-provider"><SelectValue placeholder="Default provider" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">No default</SelectItem>
            {connected.map((k) => <SelectItem key={k} value={k}>{s.providers[k].label}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardContent></Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {keys.map((k) => <ProviderCard key={k} k={k} p={s.providers[k]} isDefault={s.default_provider === k} canManage={s.can_manage} onSaved={setS} />)}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tokens
function NewTokenDialog({ s, open, onClose, onCreated }) {
  const [agents, setAgents] = useState([]);
  const [f, setF] = useState({ name: "", agent_id: "", expires_days: "90", access: {} });
  const [busy, setBusy] = useState(false);
  const allowed = useMemo(() => s.modules.filter((m) => m.yours && (s.access[m.key] || "none") !== "none"), [s]);
  useEffect(() => {
    if (!open) return;
    setF({ name: "", agent_id: "", expires_days: "90", access: Object.fromEntries(allowed.map((m) => [m.key, "read"])) });
    api.get("/agents").then((r) => setAgents(r.data || [])).catch(() => setAgents([]));
  }, [open, allowed]);
  const preset = (kind) => setF((x) => ({ ...x, access: Object.fromEntries(allowed.map((m) => [m.key, kind === "max" ? s.access[m.key] : "read"])) }));
  const setLevel = (k, v) => setF((x) => { const a = { ...x.access }; if (v === "none") delete a[k]; else a[k] = v; return { ...x, access: a }; });
  const create = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/ai-settings/tokens", { name: f.name, agent_id: f.agent_id || null, access: f.access, expires_days: f.expires_days === "never" ? null : Number(f.expires_days) });
      onCreated(data);
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="ai-new-token-dialog">
        <DialogHeader><DialogTitle>New agent token</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Name" hint="Name it after the agent or tool that will use it, e.g. “Claude — weekly report”.">
            <Input value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} placeholder="Agent or tool name" data-testid="ai-token-name" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Link to an AI agent (optional)">
              <Select value={f.agent_id || "__none"} onValueChange={(v) => setF((x) => ({ ...x, agent_id: v === "__none" ? "" : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="__none">Not linked</SelectItem>{agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Expires">
              <Select value={f.expires_days} onValueChange={(v) => setF((x) => ({ ...x, expires_days: v }))}>
                <SelectTrigger data-testid="ai-token-expiry"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="30">In 30 days</SelectItem><SelectItem value="90">In 90 days</SelectItem><SelectItem value="365">In 1 year</SelectItem><SelectItem value="never">Never</SelectItem></SelectContent>
              </Select>
            </Field>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="text-sm font-medium text-gray-700">Access</div>
            <div className="flex gap-1.5">
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => preset("read")}>Read everything allowed</Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => preset("max")}>Match workspace</Button>
            </div>
          </div>
          {allowed.length === 0 ? <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">No module is open to AI yet. Set some modules to Read in the Data access tab first.</p> : (
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-72 overflow-y-auto" data-testid="ai-token-access">
              {allowed.map((m) => (
                <div key={m.key} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="text-sm text-gray-700 truncate">{m.label}</span>
                  <LevelSelect value={f.access[m.key] || "none"} writable={m.writable && s.access[m.key] === "write"} onChange={(v) => setLevel(m.key, v)} testid={`ai-token-access-${m.key}`} />
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#F26B21] hover:bg-[#E05A10] text-white" disabled={busy || !f.name.trim() || !Object.keys(f.access).length} onClick={create} data-testid="ai-token-create">Create token</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TokenCreated({ token, endpoints, onClose }) {
  if (!token) return null;
  const mcpConfig = JSON.stringify({ mcpServers: { "dotindot-ops": { type: "http", url: endpoints.mcp, headers: { Authorization: `Bearer ${token.token}` } } } }, null, 2);
  const curl = `curl -H "Authorization: Bearer ${token.token}" ${endpoints.rest}/summary`;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="ai-token-created">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-[#F26B21]" /> Token for {token.name}</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs font-medium">Copy it now. It's stored scrambled, so it can't be shown again. If it's lost, revoke it and make a new one.</p>
          <CopyRow label="Token" value={token.token} testid="ai-token-value" />
          <CopyRow label="MCP server URL" value={endpoints.mcp} />
          <div className="space-y-1">
            <div className="flex items-center justify-between"><div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">MCP client config</div>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => copy(mcpConfig, "Config copied")}><Copy className="h-3 w-3 mr-1" /> Copy</Button></div>
            <pre className="rounded-lg bg-gray-900 text-gray-100 text-[11px] p-3 overflow-x-auto">{mcpConfig}</pre>
            <p className="text-[11px] text-gray-400">For tools that take an MCP server URL plus a header (agent builders, IDEs, automation tools). The token goes in the Authorization header.</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between"><div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Or call the REST API</div>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => copy(curl, "Command copied")}><Copy className="h-3 w-3 mr-1" /> Copy</Button></div>
            <pre className="rounded-lg bg-gray-900 text-gray-100 text-[11px] p-3 overflow-x-auto whitespace-pre-wrap break-all">{curl}</pre>
          </div>
        </div>
        <DialogFooter><Button onClick={onClose} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="ai-token-done">Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Connect({ s, reload }) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState(null);
  const del = useRecordDelete({ coll: "ai_tokens", permKey: "ai_settings", rows: s.tokens, onDeleted: reload, labelOf: (t) => t.name });
  const revoke = async (t) => {
    try { await api.post(`/ai-settings/tokens/${t.id}/revoke`); toast.success(`${t.name} revoked — it stops working now`); reload(); } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <div className="space-y-4">
      <Card className="border-gray-200/80 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Plug className="h-4 w-4 text-[#F26B21]" /> Where agents connect</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500">Give each agent its own token. Agents that speak MCP (Model Context Protocol) use the MCP URL and get tools to list modules, query and search records, read a business summary and, where allowed, create or update records. Anything else can use the REST API.</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <CopyRow label="MCP server URL" value={s.endpoints.mcp} testid="ai-mcp-url" />
            <CopyRow label="REST API base" value={s.endpoints.rest} testid="ai-rest-url" />
          </div>
          {!s.enabled && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">AI access is switched off, so every token is refused until you switch it on at the top of this page.</p>}
        </CardContent>
      </Card>
      <Card className="border-gray-200/80 shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><KeyRound className="h-4 w-4 text-[#F26B21]" /> Agent tokens</CardTitle>
          {s.can_manage && <Button size="sm" className="bg-[#F26B21] hover:bg-[#E05A10] text-white" onClick={() => setOpen(true)} data-testid="ai-new-token"><Plus className="h-3.5 w-3.5 mr-1.5" /> New token</Button>}
        </CardHeader>
        <CardContent className="pt-0">
          {s.tokens.length === 0 ? <Empty icon={Bot} title="No agent tokens yet" sub="Create one for each AI agent or tool that should reach dotindot's data." /> : (
            <div className="divide-y divide-gray-100" data-testid="ai-tokens">
              {s.tokens.map((t) => {
                const mods = Object.entries(t.access || {});
                return (
                  <div key={t.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4" data-testid={`ai-token-${t.id}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold text-sm text-gray-900">{t.name}</span>
                        <Pill tone={t.state === "active" ? "green" : t.state === "expired" ? "amber" : "red"}>{t.state}</Pill>
                        <code className="text-[11px] text-gray-400">{t.prefix}…</code></div>
                      <div className="text-xs text-gray-500 mt-0.5">{t.agent_name ? `${t.agent_name} · ` : ""}{mods.length} module{mods.length === 1 ? "" : "s"}{mods.some(([, v]) => v === "write") ? " · can write" : " · read only"} · {t.expires_at ? `expires ${fmtDate(t.expires_at)}` : "never expires"}</div>
                      <div className="text-[11px] text-gray-400">{t.calls || 0} calls{t.last_used_at ? ` · last used ${ago(t.last_used_at)}` : " · never used"} · made by {t.created_by_name}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {t.state === "active" && s.can_manage && <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => revoke(t)} data-testid={`ai-token-revoke-${t.id}`}><Ban className="h-3.5 w-3.5 mr-1" /> Revoke</Button>}
                      <RowDeleteControls kit={del} row={t} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <NewTokenDialog s={s} open={open} onClose={() => setOpen(false)} onCreated={(t) => { setOpen(false); setCreated(t); reload(); }} />
      <TokenCreated token={created} endpoints={s.endpoints} onClose={() => setCreated(null)} />
      {del.dialog}
    </div>
  );
}

// ------------------------------------------------------------------ log
function AccessLog({ s }) {
  const [token, setToken] = useState("all");
  const [rows] = useLoad("/ai-settings/log", token === "all" ? { limit: 200 } : { token_id: token, limit: 200 });
  return (
    <Card className="border-gray-200/80 shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base font-semibold flex items-center gap-2"><ScrollText className="h-4 w-4 text-[#F26B21]" /> Every AI request</CardTitle>
        <Select value={token} onValueChange={setToken}>
          <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All tokens</SelectItem>{s.tokens.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="pt-0 overflow-x-auto">
        {!rows ? <Spinner className="h-32" /> : rows.length === 0 ? <Empty icon={ScrollText} title="No AI requests yet" sub="Calls made with an agent token show up here." /> : (
          <table className="w-full text-sm" data-testid="ai-log">
            <thead><tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100"><th className="text-left py-2 pr-3">When</th><th className="text-left py-2 pr-3">Token</th><th className="text-left py-2 pr-3">Via</th><th className="text-left py-2 pr-3">What</th><th className="text-left py-2 pr-3">Module</th><th className="text-right py-2">Records</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 last:border-0 align-top">
                <td className="py-2 pr-3 whitespace-nowrap text-gray-500">{fmtDateTime(r.at)}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{r.token_name}</td>
                <td className="py-2 pr-3"><Pill tone={r.via === "mcp" ? "violet" : "blue"}>{r.via === "mcp" ? "MCP" : "API"}</Pill></td>
                <td className="py-2 pr-3">{r.tool.replace(/_/g, " ")}{!r.ok && <span className="block text-xs text-red-600">{r.detail}</span>}{r.ok && r.detail && <span className="block text-xs text-gray-400">“{r.detail}”</span>}</td>
                <td className="py-2 pr-3 text-gray-600">{r.module || "—"}</td>
                <td className="py-2 text-right font-mono">{r.ok ? r.count : <XCircle className="h-4 w-4 text-red-500 inline" />}</td>
              </tr>))}</tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ page
export default function AiSettingsPage() {
  const [s, reload, setS] = useLoad("/ai-settings");
  const [tab, setTab] = useState("connect");
  const [meta, setMeta] = useState({ max_rows: 200, instructions: "" });
  useEffect(() => { if (s) setMeta({ max_rows: s.max_rows, instructions: s.instructions || "" }); }, [s?.max_rows, s?.instructions]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (body, msg = "Saved") => {
    try { const { data } = await api.put("/ai-settings", body); setS(data); toast.success(msg); } catch (e) { toast.error(apiError(e)); }
  };
  if (!s) return <Spinner />;
  const open = Object.values(s.access).filter((v) => v !== "none").length;
  const active = s.tokens.filter((t) => t.state === "active").length;

  return (
    <div className="space-y-5 max-w-6xl" data-testid="ai-settings-page">
      <Link to="/settings" className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#F26B21]"><ArrowLeft className="h-3.5 w-3.5" /> Settings</Link>
      <PageHead kicker="Settings" title="AI settings" sub="Connect AI agents to the whole platform, safely: you decide what they can see and change, and every request is logged." />

      <Card className={`shadow-sm ${s.enabled ? "border-emerald-200 bg-emerald-50/30" : "border-gray-200/80"}`}>
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-[#FE7A18] to-[#FFAD42] text-white flex items-center justify-center shrink-0"><Sparkles className="h-5 w-5" /></div>
              <div>
                <div className="font-semibold text-gray-900">{s.enabled ? "AI agents can access the platform" : "AI access is off"}</div>
                <div className="text-xs text-gray-500">{open} of {s.modules.length} modules open · {active} active token{active === 1 ? "" : "s"}{s.updated_by ? ` · last changed by ${s.updated_by} ${ago(s.updated_at)}` : ""}</div>
              </div>
            </div>
            <Switch checked={s.enabled} disabled={!s.can_manage} onCheckedChange={(v) => save({ enabled: v }, v ? "AI access switched on" : "AI access switched off — all tokens refused")} data-testid="ai-enabled" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="Max records per request" hint="10 – 1,000" className="md:col-span-1">
              <Input type="number" min={10} max={1000} value={meta.max_rows} onChange={(e) => setMeta((m) => ({ ...m, max_rows: e.target.value }))} disabled={!s.can_manage} data-testid="ai-max-rows" />
            </Field>
            <Field label="Instructions for every agent" hint="Shared with agents when they connect, e.g. house rules, what to focus on, tone for replies." className="md:col-span-3">
              <Textarea rows={2} value={meta.instructions} onChange={(e) => setMeta((m) => ({ ...m, instructions: e.target.value }))} disabled={!s.can_manage} placeholder="e.g. Amounts are in Indian rupees. Never contact clients directly — draft replies as internal notes." data-testid="ai-instructions" />
            </Field>
          </div>
          {s.can_manage && (meta.max_rows !== s.max_rows || meta.instructions !== (s.instructions || "")) && (
            <Button size="sm" className="bg-[#F26B21] hover:bg-[#E05A10] text-white" onClick={() => save({ max_rows: Number(meta.max_rows), instructions: meta.instructions })} data-testid="ai-meta-save">Save</Button>
          )}
        </CardContent>
      </Card>

      <PillTabs value={tab} onChange={setTab} testid="ai-tabs" tabs={[["connect", "Connect agents", active], ["access", "Data access", open], ["providers", "AI providers"], ["log", "Access log"]]} />
      {tab === "connect" && <Connect s={s} reload={reload} />}
      {tab === "access" && <DataAccess s={s} save={save} />}
      {tab === "providers" && <Providers s={s} save={save} setS={setS} />}
      {tab === "log" && <AccessLog s={s} />}
    </div>
  );
}
