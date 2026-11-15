// Settings → AI. Connections: let Claude, ChatGPT and your own tools work in dotindot as one login, with the access you
// choose (backend: ai_connector.py). Activity: every call they make. AI providers: the keys dotindot's own AI features
// use (backend: routes_ai.py).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useLoad, Spinner, PageHead, PillTabs, Pill, Field, Empty, fmtDate, fmtDateTime, ago, localISO } from "@/components/kit";
import { AccessPicker, ExtraSwitches, NeverNote } from "@/components/AiAccess";
import { PasswordInput } from "@/components/PasswordInput";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft, Copy, KeyRound, Plug, Plus, Sparkles, CheckCircle2, XCircle, ScrollText, Pencil, RefreshCw, Unplug, TriangleAlert } from "lucide-react";
import { CardTable } from "@/components/ui/table";

const copy = async (text, what = "Copied") => {
  try { await navigator.clipboard.writeText(text); toast.success(what); } catch { toast.error("Couldn't copy — select the text and copy it yourself"); }
};

const CopyRow = ({ label, value, testid }) => (
  <div className="space-y-1">
    {label && <div className="text-xs font-medium text-gray-500">{label}</div>}
    <div className="flex items-center gap-2">
      <code className="flex-1 min-w-0 truncate rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-800" data-testid={testid}>{value}</code>
      <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => copy(value, `${label || "Link"} copied`)} data-testid={testid ? `${testid}-copy` : undefined}><Copy className="h-3.5 w-3.5 mr-1.5" />Copy</Button>
    </div>
  </div>
);

const STATE_TONE = { active: "green", paused: "gray", expired: "amber", "login closed": "red" };
const plusDays = (n) => localISO(new Date(Date.now() + n * 86400000));
const appLabel = (r) => (r.kind === "key" ? `Access key ••••${r.key_hint || ""}` : r.app_name || "AI app");

// ------------------------------------------------------------------ connection dialogs
function ConnectionDialog({ c, row, open, onClose, onSaved }) {
  const isKey = !row || row.kind === "key";
  const blank = { name: "", run_as_user_id: c.me.id, access: "read", manage_access: false, read_secrets: false, expires_on: plusDays(c.key_default_days), note: "", status: "active" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(row ? { name: row.name, run_as_user_id: row.run_as_user_id, access: row.access, manage_access: row.manage_access, read_secrets: row.read_secrets,
                 expires_on: row.expires_on || "", note: row.note || "", status: row.status } : blank);
  }, [open, row]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      const body = { name: f.name, access: f.access, manage_access: f.manage_access, read_secrets: f.read_secrets, note: f.note,
                     ...(isKey ? { expires_on: f.expires_on || null } : {}), ...(c.is_super_admin ? { run_as_user_id: f.run_as_user_id } : {}) };
      if (row) {
        const { data } = await api.put(`/ai-connections/${row.id}`, { ...body, status: f.status });
        toast.success(`${data.name} saved`); onSaved(null);
      } else {
        const { data } = await api.post("/ai-connections", body);
        onSaved(data);
      }
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto" data-testid="ai-connection-dialog">
        <DialogHeader>
          <DialogTitle>{row ? `Edit ${row.name}` : "New access key"}</DialogTitle>
          {!row && <DialogDescription>For scripts, n8n, Claude Code and other tools that send a key. Claude.ai and ChatGPT connect with the link instead.</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Name" hint="Name it after the tool, so you can tell connections apart in the activity log.">
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Weekly report bot" data-testid="ai-conn-name" />
          </Field>
          <Field label="Works as" hint={c.is_super_admin ? "The AI gets this login's role, permissions and branches." : "You can connect an AI as yourself. A super admin can connect one as another login."}>
            {c.is_super_admin ? (
              <Select value={f.run_as_user_id} onValueChange={(v) => set("run_as_user_id", v)}>
                <SelectTrigger data-testid="ai-conn-runas"><SelectValue /></SelectTrigger>
                <SelectContent>{c.logins.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {u.role.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            ) : <Input value={row?.run_as_name || c.me.name} disabled />}
          </Field>
          <Field label="What it can do"><AccessPicker value={f.access} onChange={(v) => set("access", v)} /></Field>
          <ExtraSwitches value={f} onChange={set} isSuper={c.is_super_admin} />
          {isKey && (
            <Field label="Stops working on" hint={`Up to a year from today. Make a new key when it ends.`}>
              <Input type="date" value={f.expires_on || ""} min={localISO()} max={plusDays(c.key_max_days)} onChange={(e) => set("expires_on", e.target.value)} data-testid="ai-conn-expiry" />
            </Field>
          )}
          {row && (
            <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3.5 py-2.5">
              <span><span className="block text-sm font-medium text-gray-800">Paused</span><span className="block text-xs text-gray-500">Refuses every call until you switch it back.</span></span>
              <Switch checked={f.status === "paused"} onCheckedChange={(v) => set("status", v ? "paused" : "active")} data-testid="ai-conn-paused" />
            </label>
          )}
          <Field label="Note (optional)"><Input value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="What it's for, who looks after it" /></Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#F26B21] hover:bg-[#E05A10] text-white" disabled={busy || f.name.trim().length < 2} onClick={save} data-testid="ai-conn-save">{row ? "Save" : "Make key"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KeyShown({ shown, onClose }) {
  if (!shown) return null;
  const { key, mcp_url, api_url, title } = shown;
  const cli = `claude mcp add --transport http dotindot ${mcp_url} --header "Authorization: Bearer ${key}"`;
  const json = JSON.stringify({ mcpServers: { dotindot: { type: "http", url: mcp_url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2);
  const curl = `curl -H "Authorization: Bearer ${key}" ${api_url}/auth/me`;
  const Block = ({ label, text }) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between"><div className="text-xs font-medium text-gray-500">{label}</div>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => copy(text, `${label} copied`)}><Copy className="h-3 w-3 mr-1" />Copy</Button></div>
      <pre className="rounded-lg bg-gray-50 border border-gray-200 text-gray-800 text-[11px] p-3 overflow-x-auto whitespace-pre-wrap break-all">{text}</pre>
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto" data-testid="ai-key-shown">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-[#F26B21]" />{title}</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs font-medium">Copy the key now. dotindot keeps only a scrambled copy, so it can't show it again. Lost it? Replace it.</p>
          <CopyRow label="Key" value={key} testid="ai-key-value" />
          <Block label="Claude Code" text={cli} />
          <Block label="Tools that take an MCP config" text={json} />
          <Block label="Plain API call" text={curl} />
        </div>
        <DialogFooter><Button onClick={onClose} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="ai-key-done">I've copied it</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDisconnect({ row, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  if (!row) return null;
  const go = async () => {
    setBusy(true);
    try { const { data } = await api.delete(`/ai-connections/${row.id}`); toast.success(data.message); onDone(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" data-testid="ai-disconnect-dialog">
        <DialogHeader><DialogTitle>Disconnect {row.name}?</DialogTitle>
          <DialogDescription>{row.kind === "key" ? "Its key stops working straight away." : `${row.app_name || "The app"} loses access straight away. To use it again, connect it again.`}</DialogDescription></DialogHeader>
        <DialogFooter className="gap-2"><Button variant="outline" onClick={onClose}>Keep it</Button>
          <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={busy} onClick={go} data-testid="ai-disconnect-confirm">Disconnect</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ connections tab
function Connections({ c, reload, setC }) {
  const [dlg, setDlg] = useState(null);         // {row} | {} for a new key
  const [shown, setShown] = useState(null);
  const [gone, setGone] = useState(null);
  const [rules, setRules] = useState(c.instructions || "");
  useEffect(() => setRules(c.instructions || ""), [c.instructions]);
  const saveSettings = async (body, msg) => {
    try { const { data } = await api.put("/ai-connections/settings", body); setC(data); toast.success(msg); } catch (e) { toast.error(apiError(e)); }
  };
  const replace = async (r) => {
    try { const { data } = await api.post(`/ai-connections/${r.id}/rotate`); setShown({ ...data, title: `New key for ${r.name}` }); reload(); } catch (e) { toast.error(apiError(e)); }
  };
  const rows = c.connections;
  return (
    <div className="space-y-4">
      <Card className={`shadow-sm ${c.enabled ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200/80"}`}>
        <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#FE7A18] to-[#FFAD42] text-white flex items-center justify-center shrink-0"><Sparkles className="h-5 w-5" /></div>
            <div className="min-w-0">
              <div className="font-semibold text-gray-900">{c.enabled ? "AI connections are on" : "AI connections are off"}</div>
              <div className="text-xs text-gray-500">{c.enabled ? "Connected AIs work within the access you gave each one." : "Nothing can connect. Switching on opens nothing by itself — you approve each connection."}</div>
            </div>
          </div>
          <Switch checked={c.enabled} onCheckedChange={(v) => saveSettings({ enabled: v }, v ? "AI connections switched on" : "AI connections switched off — every AI is refused")} data-testid="ai-enabled" aria-label="AI connections" />
        </CardContent>
      </Card>

      <Card className="border-gray-200/80 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Plug className="h-4 w-4 text-[#F26B21]" /> Connect Claude or ChatGPT</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-4">
            <li className="flex gap-3">
              <span className="h-6 w-6 shrink-0 rounded-full bg-orange-50 text-[#F26B21] text-xs font-bold flex items-center justify-center">1</span>
              <div className="flex-1 min-w-0 space-y-2"><div className="text-sm font-medium text-gray-900">Copy this link</div><CopyRow value={c.mcp_url} testid="ai-mcp-url" /></div>
            </li>
            <li className="flex gap-3">
              <span className="h-6 w-6 shrink-0 rounded-full bg-orange-50 text-[#F26B21] text-xs font-bold flex items-center justify-center">2</span>
              <div className="text-sm text-gray-600 min-w-0"><div className="font-medium text-gray-900">Add it in the AI app</div>
                Claude: Settings → Connectors → Add custom connector. ChatGPT: Settings → Connectors → Create. Paste the link and leave any client ID and secret empty.</div>
            </li>
            <li className="flex gap-3">
              <span className="h-6 w-6 shrink-0 rounded-full bg-orange-50 text-[#F26B21] text-xs font-bold flex items-center justify-center">3</span>
              <div className="text-sm text-gray-600 min-w-0"><div className="font-medium text-gray-900">Approve it here</div>
                The app opens a dotindot page. Choose who it works as and what it can do, then approve.</div>
            </li>
          </ol>
          {!c.https && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex gap-2"><TriangleAlert className="h-4 w-4 shrink-0" />
              This address isn't https, so Claude and ChatGPT will refuse it. Open dotindot at its https address, or set PUBLIC_BASE_URL on the server.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-gray-200/80 shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold">Connections</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setDlg({})} data-testid="ai-new-key"><Plus className="h-3.5 w-3.5 mr-1.5" />Access key</Button>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {rows.length === 0 ? <Empty icon={Plug} title="Nothing is connected yet" sub="Connect Claude or ChatGPT with the link above, or make an access key for a script." /> : (
            <div className="divide-y divide-gray-100" data-testid="ai-connections">
              {rows.map((r) => (
                <div key={r.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4" data-testid={`ai-conn-${r.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">{r.name}</span>
                      <Pill tone={STATE_TONE[r.state] || "gray"}>{r.state}</Pill>
                      {appLabel(r) !== r.name && <span className="text-[11px] text-gray-400">{appLabel(r)}</span>}
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">Works as {r.run_as_name || "—"} · {r.access_label}{r.manage_access ? " · can change logins" : ""}{r.read_secrets ? " · can read saved passwords" : ""}{r.expires_on ? ` · until ${fmtDate(r.expires_on)}` : ""}</div>
                    <div className="text-[11px] text-gray-400">{r.last_used_at ? `Last used ${ago(r.last_used_at)}` : "Not used yet"} · {r.calls_24h} call{r.calls_24h === 1 ? "" : "s"} today · added by {r.created_by_name}</div>
                  </div>
                  {r.can_edit && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button size="sm" variant="outline" className="h-8" onClick={() => setDlg({ row: r })} data-testid={`ai-conn-edit-${r.id}`}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
                      {r.kind === "key" && <Button size="sm" variant="outline" className="h-8" onClick={() => replace(r)} data-testid={`ai-conn-rotate-${r.id}`}><RefreshCw className="h-3.5 w-3.5 mr-1" />New key</Button>}
                      <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-200 hover:bg-red-50" onClick={() => setGone(r)} data-testid={`ai-conn-remove-${r.id}`}><Unplug className="h-3.5 w-3.5 mr-1" />Disconnect</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <NeverNote className="pt-1" />
        </CardContent>
      </Card>

      <Card className="border-gray-200/80 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">House rules</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500">Every connected AI reads these when it connects.</p>
          <Textarea rows={3} value={rules} onChange={(e) => setRules(e.target.value)} maxLength={4000}
            placeholder="e.g. Never email or message clients — draft replies as internal notes. Ask before changing an invoice." data-testid="ai-rules" />
          {rules !== (c.instructions || "") && <Button size="sm" className="bg-[#F26B21] hover:bg-[#E05A10] text-white" onClick={() => saveSettings({ instructions: rules }, "House rules saved")} data-testid="ai-rules-save">Save house rules</Button>}
        </CardContent>
      </Card>

      <ConnectionDialog c={c} row={dlg?.row} open={!!dlg} onClose={() => setDlg(null)}
        onSaved={(made) => { setDlg(null); reload(); if (made) setShown({ ...made, title: `Key for ${made.connection.name}` }); }} />
      <KeyShown shown={shown} onClose={() => setShown(null)} />
      <ConfirmDisconnect row={gone} onClose={() => setGone(null)} onDone={() => { setGone(null); reload(); }} />
    </div>
  );
}

// ------------------------------------------------------------------ activity tab
function Activity({ c }) {
  const [conn, setConn] = useState("all");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [rows, setRows] = useState(null);
  const [next, setNext] = useState(null);
  const load = async (before) => {
    try {
      const { data } = await api.get("/ai-connections/activity", { params: { limit: 100, ...(conn !== "all" ? { connection_id: conn } : {}), ...(errorsOnly ? { errors_only: true } : {}), ...(before ? { before } : {}) } });
      setRows((x) => (before ? [...(x || []), ...data.rows] : data.rows)); setNext(data.next_before);
    } catch (e) { toast.error(apiError(e)); setRows([]); }
  };
  useEffect(() => { setRows(null); load(); }, [conn, errorsOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card className="border-gray-200/80 shadow-sm">
      <CardHeader className="pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base font-semibold flex items-center gap-2"><ScrollText className="h-4 w-4 text-[#F26B21]" /> Every call, last 90 days</CardTitle>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-600"><Switch checked={errorsOnly} onCheckedChange={setErrorsOnly} data-testid="ai-activity-errors" />Refused or failed</label>
          <Select value={conn} onValueChange={setConn}>
            <SelectTrigger className="w-[180px] h-8 text-xs" data-testid="ai-activity-conn"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All connections</SelectItem>{c.connections.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {!rows ? <Spinner className="h-32" /> : rows.length === 0 ? <Empty icon={ScrollText} title="No calls yet" sub="Calls made by connected AIs show up here." /> : (
          <>
            <CardTable><table className="w-full text-sm" data-testid="ai-activity">
              <thead><tr className="text-xs text-gray-500 border-b border-gray-100"><th className="text-left font-medium py-2 pr-3">When</th><th className="text-left font-medium py-2 pr-3">Connection</th><th className="text-left font-medium py-2 pr-3">Call</th><th className="text-left font-medium py-2 pr-3">Result</th><th className="text-right font-medium py-2">Time</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 last:border-0 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-500" data-label="When">{fmtDateTime(r.at)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap" data-label="Connection">{r.connection_name}</td>
                  <td className="py-2 pr-3 min-w-0" data-label="Call"><span className="font-mono text-xs text-gray-700 break-all">{r.method === "TOOL" ? `${r.path.replace(/_/g, " ")}` : `${r.method} ${r.path}`}</span>{r.via === "mcp" && r.method !== "TOOL" && <span className="ml-1.5 text-[10px] text-gray-400">via MCP</span>}</td>
                  <td className="py-2 pr-3" data-label="Result">{r.status < 400 ? <span className="inline-flex items-center gap-1 text-emerald-700 text-xs"><CheckCircle2 className="h-3.5 w-3.5" />{r.status}</span> : <span className="inline-flex items-center gap-1 text-red-600 text-xs"><XCircle className="h-3.5 w-3.5" />{r.status === 403 ? "Refused" : r.status === 401 ? "Not signed in" : r.status === 429 ? "Too many" : r.status}</span>}</td>
                  <td className="py-2 text-right font-mono text-xs text-gray-500" data-label="Time">{r.ms} ms</td>
                </tr>))}</tbody>
            </table></CardTable>
            {next && <div className="pt-3 text-center"><Button size="sm" variant="outline" onClick={() => load(next)}>Show older</Button></div>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ providers tab
function ProviderCard({ k, p, isDefault, onSaved }) {
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
          <PasswordInput value={f.api_key} onChange={(e) => setF((x) => ({ ...x, api_key: e.target.value }))} placeholder={p.connected ? "Leave blank to keep the saved key" : "Paste the key"} data-testid={`ai-provider-${k}-key`} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Model"><Input value={f.model} onChange={(e) => setF((x) => ({ ...x, model: e.target.value }))} placeholder="Model name" /></Field>
          <Field label="Base URL"><Input value={f.base_url} onChange={(e) => setF((x) => ({ ...x, base_url: e.target.value }))} placeholder="https://…" /></Field>
        </div>
        {test && <p className={`text-xs flex items-center gap-1.5 ${test.ok ? "text-emerald-700" : "text-red-600"}`}>{test.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}{test.message} · {ago(test.at)}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="bg-[#F26B21] hover:bg-[#E05A10] text-white" disabled={busy || (!p.connected && !f.api_key)} onClick={() => save(false)} data-testid={`ai-provider-${k}-save`}>Save</Button>
          {p.connected && <Button size="sm" variant="outline" disabled={busy} onClick={runTest} data-testid={`ai-provider-${k}-test`}>Test key</Button>}
          {p.connected && <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" disabled={busy} onClick={() => save(true)}>Remove</Button>}
        </div>
      </CardContent>
    </Card>
  );
}

function Providers() {
  const [s, , setS] = useLoad("/ai-settings");
  if (!s) return <Spinner className="h-40" />;
  const keys = Object.keys(s.providers);
  const connected = keys.filter((k) => s.providers[k].connected);
  const setDefault = async (v) => {
    try { const { data } = await api.put("/ai-settings", { default_provider: v === "__none" ? "" : v }); setS(data); toast.success("Default provider saved"); } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <div className="space-y-4">
      <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-sm text-gray-600">The keys dotindot's own AI features use, like the website chat assistant. Keys are kept encrypted and only their last 4 characters are shown.</div>
        <Select value={s.default_provider || "__none"} onValueChange={setDefault}>
          <SelectTrigger className="sm:w-[220px]" data-testid="ai-default-provider"><SelectValue placeholder="Default provider" /></SelectTrigger>
          <SelectContent><SelectItem value="__none">No default</SelectItem>{connected.map((k) => <SelectItem key={k} value={k}>{s.providers[k].label}</SelectItem>)}</SelectContent>
        </Select>
      </CardContent></Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {keys.map((k) => <ProviderCard key={k} k={k} p={s.providers[k]} isDefault={s.default_provider === k} onSaved={setS} />)}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ page
export default function AiSettingsPage() {
  const [c, reload, setC] = useLoad("/ai-connections");
  const [tab, setTab] = useState("connections");
  if (!c) return <Spinner />;
  const live = c.connections.filter((x) => x.state === "active").length;
  return (
    <div className="space-y-5 max-w-5xl" data-testid="ai-settings-page">
      <Link to="/settings" className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#F26B21]"><ArrowLeft className="h-3.5 w-3.5" /> Settings</Link>
      <PageHead kicker="Settings" title="AI" sub="Let Claude, ChatGPT and your own tools work in dotindot — each as one login, with the access you choose." />
      <PillTabs value={tab} onChange={setTab} testid="ai-tabs" tabs={[["connections", "Connections", live], ["activity", "Activity"], ["providers", "AI providers"]]} />
      {tab === "connections" && <Connections c={c} reload={reload} setC={setC} />}
      {tab === "activity" && <Activity c={c} />}
      {tab === "providers" && <Providers />}
    </div>
  );
}

