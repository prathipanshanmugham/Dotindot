import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import api, { apiError, formatINR } from "@/lib/api";
import FinanceLayout from "@/components/FinanceLayout";
import ExportMenu from "@/components/ExportMenu";
import MultiSelect from "@/components/MultiSelect";
import { labelize, ROLE_LABELS } from "@/components/Badges";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar, RecordDeleteDialog } from "@/components/RecordDelete";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet, TrendingUp, Gauge, Flame, AlertTriangle, Plus, Upload, Pencil, ExternalLink, KeyRound, Trash2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from "recharts";

const PROVIDER_COLORS = {
  openai: "bg-emerald-600", anthropic: "bg-[#D97757]", google: "bg-blue-600", elevenlabs: "bg-gray-900", replicate: "bg-gray-700",
  perplexity: "bg-teal-600", stability: "bg-violet-600", aws: "bg-amber-500", azure: "bg-sky-600", twilio: "bg-red-500", openrouter: "bg-indigo-600", other: "bg-gray-500",
};
const KIND_STYLE = {
  topup: "bg-emerald-50 text-emerald-700 border-emerald-200", usage: "bg-orange-50 text-orange-700 border-orange-200",
  refund: "bg-blue-50 text-blue-700 border-blue-200", adjustment: "bg-gray-100 text-gray-600 border-gray-200",
};
const KIND_LABEL = { topup: "Top-up", usage: "Usage", refund: "Refund", adjustment: "Adjustment" };
const money = (v, cur) => {
  const n = Number(v || 0);
  if (cur === "INR") return formatINR(Math.round(n));
  const frac = Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2;
  return `${n < 0 ? "−" : ""}${cur === "USD" ? "$" : cur + " "}${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: frac, maximumFractionDigits: 2 })}`;
};
const inrR = (v) => formatINR(Math.round(Number(v) || 0));
const localToday = () => { const n = new Date(); return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

const ProviderMark = ({ provider, label }) => (
  <div className={`h-10 w-10 rounded-xl ${PROVIDER_COLORS[provider] || "bg-gray-500"} text-white text-xs font-bold flex items-center justify-center shrink-0`} title={label}>
    {(label || provider || "?").replace(/[^A-Za-z ]/g, "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
  </div>
);

const Stat = ({ icon: Icon, label, value, sub, warn, testid, className = "" }) => (
  <Card className={`border-gray-200/80 shadow-sm ${className}`} data-testid={testid}>
    <CardContent className="p-4 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${warn ? "bg-red-50" : "bg-[#FFF7ED]"}`}>
        <Icon style={{ height: 18, width: 18 }} className={warn ? "text-red-600" : "text-[#F26B21]"} />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold text-gray-900 font-mono truncate">{value}</div>
        <div className="text-xs text-gray-500">{label}{sub && <span className="text-gray-400"> · {sub}</span>}</div>
      </div>
    </CardContent>
  </Card>
);

// ---------------- dialogs ----------------
const EMPTY_ACC = { name: "", provider: "openai", billing: "prepaid", currency: "USD", fx_rate: "", monthly_budget: "", low_balance_threshold: "",
  owner_id: "", agent_ids: [], status: "active", dashboard_url: "", key_hint: "", notes: "" };

function AccountDialog({ open, onOpenChange, account, meta, onSaved }) {
  const [f, setF] = useState(EMPTY_ACC);
  const [team, setTeam] = useState([]);
  const [agents, setAgents] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(account ? { ...EMPTY_ACC, ...account, fx_rate: String(account.fx_rate ?? ""), monthly_budget: String(account.monthly_budget ?? ""),
      low_balance_threshold: String(account.low_balance_threshold ?? ""), owner_id: account.owner_id || "", agent_ids: account.agent_ids || [] } : EMPTY_ACC);
    api.get("/users/team").then((r) => setTeam(r.data)).catch(() => {});
    api.get("/agents").then((r) => setAgents(r.data.map((a) => ({ value: a.id, label: a.name })))).catch(() => setAgents([]));
  }, [open, account]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const fxDefault = meta?.default_fx?.[f.currency] ?? 1;
  const save = async () => {
    if (!f.name.trim()) return toast.error("Give the account a name");
    setBusy(true);
    const body = { ...f, name: f.name.trim(), fx_rate: Number(f.fx_rate) || fxDefault, monthly_budget: Number(f.monthly_budget) || 0,
      low_balance_threshold: Number(f.low_balance_threshold) || 0, owner_id: f.owner_id || null };
    ["id", "balance", "balance_inr", "used_mtd", "used_mtd_inr", "series", "txns", "agents", "owner_name"].forEach((k) => delete body[k]);
    Object.keys(body).filter((k) => !(k in EMPTY_ACC)).forEach((k) => delete body[k]);
    try {
      if (account) await api.put(`/finance/api-credits/accounts/${account.id}`, body);
      else await api.post("/finance/api-credits/accounts", body);
      toast.success(account ? "Account updated" : "API account added");
      onOpenChange(false); onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto" data-testid="api-account-dialog">
        <DialogHeader><DialogTitle>{account ? `Edit ${account.name}` : "Add an API account"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 space-y-1"><Label>Name *</Label><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. OpenAI — production" data-testid="api-acc-name" /></div>
          <div className="space-y-1"><Label>Provider</Label>
            <Select value={f.provider} onValueChange={(v) => set("provider", v)}>
              <SelectTrigger data-testid="api-acc-provider"><SelectValue /></SelectTrigger>
              <SelectContent>{(meta?.providers || []).map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Billing</Label>
            <Select value={f.billing} onValueChange={(v) => set("billing", v)}>
              <SelectTrigger data-testid="api-acc-billing"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="prepaid">Prepaid credits</SelectItem><SelectItem value="postpaid">Postpaid (monthly bill)</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Currency</Label>
            <Select value={f.currency} onValueChange={(v) => setF((x) => ({ ...x, currency: v, fx_rate: "" }))}>
              <SelectTrigger data-testid="api-acc-currency"><SelectValue /></SelectTrigger>
              <SelectContent>{(meta?.currencies || ["USD", "INR"]).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>₹ per 1 {f.currency}</Label><Input type="number" min="0" step="0.01" value={f.fx_rate} placeholder={String(fxDefault)} onChange={(e) => set("fx_rate", e.target.value)} disabled={f.currency === "INR"} /></div>
          <div className="space-y-1"><Label>Monthly budget ({f.currency})</Label><Input type="number" min="0" value={f.monthly_budget} onChange={(e) => set("monthly_budget", e.target.value)} data-testid="api-acc-budget" /></div>
          {f.billing === "prepaid" && <div className="space-y-1"><Label>Alert me below ({f.currency})</Label><Input type="number" min="0" value={f.low_balance_threshold} onChange={(e) => set("low_balance_threshold", e.target.value)} data-testid="api-acc-threshold" /></div>}
          <div className="space-y-1"><Label>Owner</Label>
            <Select value={f.owner_id || "none"} onValueChange={(v) => set("owner_id", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">No owner</SelectItem>{team.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["active", "paused", "closed"].map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 space-y-1"><Label>AI agents that use it</Label>
            <MultiSelect options={agents} value={f.agent_ids} onChange={(v) => set("agent_ids", v)} placeholder="Optional" testid="api-acc-agents" />
          </div>
          <div className="space-y-1"><Label>Billing dashboard link</Label><Input value={f.dashboard_url} onChange={(e) => set("dashboard_url", e.target.value)} placeholder="https://…" /></div>
          <div className="space-y-1"><Label>Key hint (last 4 only)</Label><Input value={f.key_hint} onChange={(e) => set("key_hint", e.target.value.slice(0, 12))} placeholder="…a1B2" /></div>
          <p className="sm:col-span-2 text-[11px] text-gray-400 -mt-1">Never paste the full API key here. Store keys in the Password Manager.</p>
          <div className="sm:col-span-2 space-y-1"><Label>Notes</Label><Textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={busy} onClick={save} data-testid="api-acc-save">{busy ? "Saving…" : account ? "Save" : "Add account"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TxnDialog({ open, onOpenChange, account, kind: initialKind, onSaved }) {
  const [f, setF] = useState({});
  const [opts, setOpts] = useState({ clients: [], projects: [], agents: [] });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !account) return;
    setF({ kind: initialKind || "usage", date: localToday(), amount: "", units: "", unit_label: "tokens", client_id: "", project_id: "", agent_id: "", note: "", post_to_ledger: true });
    Promise.all([api.get("/clients").catch(() => ({ data: [] })), api.get("/projects").catch(() => ({ data: [] })), api.get("/agents").catch(() => ({ data: [] }))])
      .then(([c, p, a]) => setOpts({ clients: c.data, projects: p.data, agents: a.data }));
  }, [open, account, initialKind]);
  if (!account) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const fx = account.fx_rate || 1;
  const save = async () => {
    const amt = Number(f.amount);
    if (!amt || (f.kind !== "adjustment" && amt <= 0)) return toast.error("Enter an amount");
    setBusy(true);
    try {
      await api.post("/finance/api-credits/txns", { account_id: account.id, kind: f.kind, date: f.date, amount: amt, units: f.units === "" ? null : Number(f.units),
        unit_label: f.unit_label, client_id: f.client_id || null, project_id: f.project_id || null, agent_id: f.agent_id || null, note: f.note,
        post_to_ledger: f.kind === "topup" && f.post_to_ledger });
      toast.success(f.kind === "topup" ? "Top-up recorded" : "Saved");
      onOpenChange(false); onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto" data-testid="api-txn-dialog">
        <DialogHeader><DialogTitle>{account.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-1.5">
            {["topup", "usage", "refund", "adjustment"].map((k) => (
              <button key={k} type="button" onClick={() => set("kind", k)} data-testid={`api-txn-kind-${k}`}
                className={`rounded-lg border px-2 py-2 text-xs font-semibold min-h-[40px] ${f.kind === k ? "border-[#F26B21] bg-[#FFF7ED] text-[#F26B21]" : "border-gray-200 text-gray-600"}`}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Date</Label><Input type="date" value={f.date || ""} max={localToday()} onChange={(e) => set("date", e.target.value)} /></div>
            <div className="space-y-1"><Label>Amount ({account.currency}) *</Label><Input type="number" step="0.01" value={f.amount || ""} onChange={(e) => set("amount", e.target.value)} data-testid="api-txn-amount" />
              {f.kind === "adjustment" && <p className="text-[10px] text-gray-400">Use a minus sign to reduce the balance.</p>}
            </div>
          </div>
          {f.amount && account.currency !== "INR" && <p className="text-xs text-gray-500 -mt-1">≈ {inrR(Math.round(Number(f.amount) * fx))} at ₹{fx}/{account.currency}</p>}
          {f.kind === "usage" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Units used</Label><Input type="number" min="0" value={f.units || ""} onChange={(e) => set("units", e.target.value)} placeholder="Optional" /></div>
                <div className="space-y-1"><Label>Unit</Label>
                  <Select value={f.unit_label || "tokens"} onValueChange={(v) => set("unit_label", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["tokens", "characters", "images", "minutes", "requests", "credits"].map((u) => <SelectItem key={u} value={u}>{labelize(u)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[["client_id", "Client", opts.clients], ["project_id", "Project", opts.projects], ["agent_id", "AI agent", opts.agents]].map(([k, label, list]) => (
                  <div key={k} className="space-y-1"><Label>{label}</Label>
                    <Select value={f[k] || "none"} onValueChange={(v) => set(k, v === "none" ? "" : v)}>
                      <SelectTrigger data-testid={`api-txn-${k}`}><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="none">None</SelectItem>{list.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </>
          )}
          {f.kind === "topup" && (
            <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
              <div><div className="text-sm font-medium text-gray-800">Also add to the ledger</div><div className="text-xs text-gray-500">Records an AI expense of {f.amount ? inrR(Math.round(Number(f.amount) * fx)) : "the ₹ amount"} so finance totals stay right.</div></div>
              <Switch checked={!!f.post_to_ledger} onCheckedChange={(v) => set("post_to_ledger", v)} data-testid="api-txn-ledger" />
            </label>
          )}
          <div className="space-y-1"><Label>Note</Label><Input value={f.note || ""} onChange={(e) => set("note", e.target.value)} placeholder={f.kind === "topup" ? "e.g. Card ending 4421" : "What was it for?"} /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={busy} onClick={save} data-testid="api-txn-save">{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Paste a usage export: one line per day — date, amount[, units][, note]
function ImportDialog({ open, onOpenChange, account, onSaved }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setText(""); }, [open]);
  const parsed = useMemo(() => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l, i) => {
    const parts = l.split(/[,\t;]/).map((x) => x.trim().replace(/^"|"$/g, ""));
    const [d, amt, units, ...rest] = parts;
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Number(amt)) && amt !== "";
    return { i, ok, date: d, amount: Number(amt), units: units && !Number.isNaN(Number(units)) ? Number(units) : null, note: rest.join(" "), raw: l };
  }).filter((r, idx) => !(idx === 0 && !r.ok && /date/i.test(r.raw))), [text]);
  if (!account) return null;
  const good = parsed.filter((r) => r.ok);
  const total = good.reduce((s, r) => s + r.amount, 0);
  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/finance/api-credits/txns/bulk", { account_id: account.id, kind: "usage", unit_label: "tokens",
        rows: good.map((r) => ({ date: r.date, amount: r.amount, units: r.units, note: r.note })) });
      toast.success(`Imported ${data.imported} usage lines`);
      onOpenChange(false); onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto" data-testid="api-import-dialog">
        <DialogHeader><DialogTitle>Import usage · {account.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-gray-600">Paste rows from the provider's usage export, one per line: <span className="font-mono text-xs bg-gray-100 rounded px-1">date, amount, units, note</span>. Dates as YYYY-MM-DD, amounts in {account.currency}.</p>
        <Textarea rows={7} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={"2026-10-01, 12.40, 220000\n2026-10-02, 9.85, 176000, client chatbot"} data-testid="api-import-text" />
        {parsed.length > 0 && (
          <div className="text-xs rounded-lg border border-gray-200 p-2.5 space-y-1" data-testid="api-import-preview">
            <div><span className="font-semibold text-gray-800">{good.length}</span> lines ready · {money(total, account.currency)}{account.currency !== "INR" && ` (≈ ${inrR(Math.round(total * (account.fx_rate || 1)))})`}</div>
            {parsed.filter((r) => !r.ok).slice(0, 3).map((r) => <div key={r.i} className="text-red-600 truncate">Skipped: {r.raw}</div>)}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={busy || !good.length} onClick={run} data-testid="api-import-run">Import {good.length || ""}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- account detail sheet ----------------
function AccountSheet({ id, ver, onClose, onChanged, canDelete, onEdit, onTxn }) {
  const [a, setA] = useState(null);
  const [delOpen, setDelOpen] = useState(false);
  const load = useCallback(() => { if (id) api.get(`/finance/api-credits/accounts/${id}`).then((r) => setA(r.data)).catch(() => {}); }, [id]);
  useEffect(() => { setA(null); load(); }, [load]);
  useEffect(() => { if (ver) load(); }, [ver, load]);
  const del = useRecordDelete({ coll: "api_credit_txns", permKey: "finance.delete", rows: a?.txns || [], onDeleted: () => { load(); onChanged(); },
    labelOf: (t) => `${KIND_LABEL[t.kind]} ${t.amount} ${t.currency} on ${t.date}` });
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto" data-testid="api-account-sheet">
        {!a ? <div className="h-40 flex items-center justify-center"><div className="h-6 w-6 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div> : (
          <div className="space-y-5">
            <SheetHeader className="text-left">
              <div className="flex items-center gap-3">
                <ProviderMark provider={a.provider} label={a.provider_label} />
                <div className="min-w-0"><SheetTitle className="truncate">{a.name}</SheetTitle><p className="text-xs text-gray-500">{a.provider_label} · {a.billing === "prepaid" ? "Prepaid" : "Postpaid"} · {a.currency}{a.key_hint ? ` · key ${a.key_hint}` : ""}</p></div>
              </div>
            </SheetHeader>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="bg-[#F26B21] hover:bg-[#d95b16] text-white" onClick={() => onTxn(a, "topup")}><Plus className="h-3.5 w-3.5 mr-1" /> Top up</Button>
              <Button size="sm" variant="outline" onClick={() => onTxn(a, "usage")}>Log usage</Button>
              <Button size="sm" variant="outline" onClick={() => onEdit(a)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
              {a.dashboard_url && <Button size="sm" variant="outline" asChild><a href={a.dashboard_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Provider billing</a></Button>}
              {canDelete && <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setDelOpen(true)} aria-label="Delete account" data-testid="api-acc-delete"><Trash2 className="h-3.5 w-3.5" /></Button>}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {a.billing === "prepaid" && <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Balance</div><div className="font-mono font-bold text-gray-900">{money(a.balance, a.currency)}</div></div>}
              <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Used this month</div><div className="font-mono font-bold text-gray-900">{money(a.used_mtd, a.currency)}</div></div>
              <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Burn per day</div><div className="font-mono font-bold text-gray-900">{money(a.burn_per_day, a.currency)}</div></div>
              {a.billing === "prepaid" ? <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Days of credit left</div><div className={`font-mono font-bold ${a.low_balance ? "text-red-600" : "text-gray-900"}`}>{a.runway_days == null ? "—" : a.runway_days}</div></div>
                : <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Projected this month</div><div className={`font-mono font-bold ${a.over_budget ? "text-red-600" : "text-gray-900"}`}>{money(a.projected_month, a.currency)}</div></div>}
            </div>
            <Card className="border-gray-200/80">
              <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">{a.billing === "prepaid" ? "Balance, last 30 days" : "Daily usage, last 30 days"}</CardTitle></CardHeader>
              <CardContent className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  {a.billing === "prepaid" ? (
                    <LineChart data={a.series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#F3F4F6" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6B7280" }} axisLine={false} tickLine={false} interval={6} />
                      <YAxis tick={{ fontSize: 9, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v) => [money(v, a.currency), "Balance"]} />
                      <Line type="monotone" dataKey="balance" stroke="#F26B21" strokeWidth={2.2} dot={false} />
                    </LineChart>
                  ) : (
                    <BarChart data={a.series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#F3F4F6" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6B7280" }} axisLine={false} tickLine={false} interval={6} />
                      <YAxis tick={{ fontSize: 9, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v) => [money(v, a.currency), "Usage"]} cursor={{ fill: "#FFF7ED" }} />
                      <Bar dataKey="usage" fill="#F26B21" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </CardContent>
            </Card>
            {a.notes && <p className="text-sm text-gray-600 whitespace-pre-line">{a.notes}</p>}
            <div>
              <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold text-gray-800">Entries</h3>{del.dialog}<BulkDeleteBar kit={del} /></div>
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {a.txns.length === 0 && <p className="p-4 text-sm text-gray-400">No entries yet.</p>}
                {a.txns.slice(0, 120).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm" data-testid={`api-sheet-txn-${t.id}`}>
                    <RowDeleteControls kit={del} row={t} />
                    <Badge variant="outline" className={`${KIND_STYLE[t.kind]} text-[10px] shrink-0`}>{KIND_LABEL[t.kind]}</Badge>
                    <div className="min-w-0 flex-1"><div className="text-xs text-gray-500">{t.date}{t.client_name ? ` · ${t.client_name}` : ""}{t.agent_name ? ` · ${t.agent_name}` : ""}</div>{t.note && <div className="text-xs text-gray-400 truncate">{t.note}</div>}</div>
                    <div className="text-right shrink-0"><div className="font-mono text-sm font-semibold">{t.kind === "usage" ? "−" : ""}{money(Math.abs(t.amount), t.currency)}</div>{t.ledger_tx_id && <div className="text-[10px] text-emerald-600">in ledger</div>}</div>
                  </div>
                ))}
              </div>
            </div>
            {delOpen && <RecordDeleteDialog coll="api_accounts" target={a} labelOf={(x) => x.name} onClose={() => setDelOpen(false)} onDeleted={() => { setDelOpen(false); onClose(); onChanged(); }} />}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------- page ----------------
export default function ApiCreditsPage() {
  const [meta, setMeta] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [ov, setOv] = useState(null);
  const [txns, setTxns] = useState([]);
  const [filter, setFilter] = useState({ account_id: "all", kind: "all" });
  const [breakdown, setBreakdown] = useState("by_client");
  const [accDialog, setAccDialog] = useState({ open: false, account: null });
  const [txnDialog, setTxnDialog] = useState({ open: false, account: null, kind: "usage" });
  const [importFor, setImportFor] = useState(null);
  const [sheetId, setSheetId] = useState(null);
  const [ver, setVer] = useState(0);
  const [shown, setShown] = useState(25);

  const load = useCallback(() => {
    api.get("/finance/api-credits/accounts").then((r) => setAccounts(r.data)).catch(() => setAccounts([]));
    api.get("/finance/api-credits/overview").then((r) => setOv(r.data)).catch(() => {});
  }, []);
  const loadTxns = useCallback(() => {
    const params = { limit: 200 };
    if (filter.account_id !== "all") params.account_id = filter.account_id;
    if (filter.kind !== "all") params.kind = filter.kind;
    api.get("/finance/api-credits/txns", { params }).then((r) => setTxns(r.data)).catch(() => setTxns([]));
  }, [filter]);
  useEffect(() => { load(); api.get("/finance/api-credits/meta").then((r) => setMeta(r.data)).catch(() => {}); }, [load]);
  useEffect(() => { loadTxns(); setShown(25); }, [loadTxns]);
  const refresh = () => { load(); loadTxns(); setVer((v) => v + 1); };

  const del = useRecordDelete({ coll: "api_credit_txns", permKey: "finance.delete", rows: txns.slice(0, shown), onDeleted: refresh,
    labelOf: (t) => `${KIND_LABEL[t.kind]} ${t.amount} ${t.currency} on ${t.date}` });

  if (!accounts)
    return <FinanceLayout title="API Credits"><div className="h-40 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div></FinanceLayout>;

  const openTxn = (account, kind) => setTxnDialog({ open: true, account, kind });
  const alerts = ov ? [...ov.low_balance.map((x) => ({ ...x, type: "low" })), ...ov.over_budget.filter((x) => !ov.low_balance.some((l) => l.id === x.id)).map((x) => ({ ...x, type: "budget" }))] : [];

  return (
    <FinanceLayout title="API Credits" subtitle="Balances, top-ups and usage for every paid API account — in their own currency and in ₹."
      actions={<div className="flex items-center gap-2 flex-wrap">
        <ExportMenu dataset="api-credits" params={{ ...(filter.account_id !== "all" ? { account_id: filter.account_id } : {}), ...(filter.kind !== "all" ? { kind: filter.kind } : {}) }} />
        <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" onClick={() => setAccDialog({ open: true, account: null })} data-testid="add-api-account-btn"><Plus className="h-4 w-4 mr-2" /> Add account</Button>
      </div>}>
      {ov && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <Stat icon={Wallet} label="Prepaid balance" value={inrR(ov.balance_inr)} testid="api-stat-balance" />
          <Stat icon={TrendingUp} label="Used this month" value={inrR(ov.used_mtd_inr)} sub={`last month ${inrR(ov.used_last_month_inr)}`} testid="api-stat-mtd" />
          <Stat icon={Gauge} label="Projected this month" value={inrR(ov.projected_month_inr)} sub={ov.budget_inr ? `budget ${inrR(ov.budget_inr)}` : null} warn={ov.budget_inr && ov.projected_month_inr > ov.budget_inr} testid="api-stat-projected" />
          <Stat icon={Flame} label="Burn per day" value={inrR(ov.burn_per_day_inr)} testid="api-stat-burn" />
          <Stat icon={AlertTriangle} label="Need attention" value={alerts.length} warn={alerts.length > 0} testid="api-stat-alerts" className="col-span-2 lg:col-span-1" />
        </div>
      )}

      {alerts.length > 0 && (
        <Card className="border-red-200 bg-red-50/40" data-testid="api-alerts">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-800 mb-2"><AlertTriangle className="h-4 w-4" /> Needs attention</div>
            <div className="flex flex-wrap gap-2">
              {alerts.map((x) => (
                <button key={x.id + x.type} type="button" onClick={() => setSheetId(x.id)} className="rounded-lg bg-white border border-red-200 px-3 py-1.5 text-sm text-left hover:border-red-400">
                  <span className="font-semibold text-gray-800">{x.name}</span>
                  <span className="text-xs text-red-700 ml-2">{x.type === "low" ? `${money(x.balance, x.currency)} left${x.runway_days != null && x.runway_days >= 0 ? ` · ~${x.runway_days} days` : ""}` : `on track to exceed budget (${x.budget_used_pct}% used)`}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {accounts.length === 0 ? (
        <Card className="border-dashed border-gray-300"><CardContent className="py-14 text-center space-y-2">
          <KeyRound className="h-8 w-8 text-gray-300 mx-auto" />
          <p className="text-sm text-gray-600">No API accounts yet.</p>
          <p className="text-xs text-gray-400">Add OpenAI, Anthropic, Gemini and the rest, then log top-ups and usage to track balances.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((a) => {
            const pct = a.budget_used_pct;
            const projPct = a.monthly_budget ? Math.min(100, Math.round((100 * a.projected_month) / a.monthly_budget)) : null;
            return (
              <Card key={a.id} className={`shadow-sm flex flex-col ${a.low_balance ? "border-red-300" : "border-gray-200/80"} ${a.status !== "active" ? "opacity-70" : ""}`} data-testid={`api-account-${a.id}`}>
                <CardContent className="p-4 sm:p-5 flex-1 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <ProviderMark provider={a.provider} label={a.provider_label} />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSheetId(a.id)} data-testid={`api-account-open-${a.id}`}>
                      <div className="font-semibold text-gray-900 truncate hover:text-[#F26B21]">{a.name}</div>
                      <div className="text-xs text-gray-500 truncate">{a.provider_label} · {a.billing === "prepaid" ? "Prepaid" : "Postpaid"}{a.owner_name ? ` · ${a.owner_name}` : ""}</div>
                    </button>
                    {a.status !== "active" ? <Badge variant="outline" className="bg-gray-100 text-gray-500 text-[10px]">{labelize(a.status)}</Badge>
                      : a.low_balance ? <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">Low</Badge> : null}
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{a.billing === "prepaid" ? "Balance" : "Spent this month"}</div>
                      <div className={`text-xl font-bold font-mono ${a.low_balance ? "text-red-600" : "text-gray-900"}`} data-testid={`api-balance-${a.id}`}>{money(a.billing === "prepaid" ? a.balance : a.used_mtd, a.currency)}</div>
                      {a.currency !== "INR" && <div className="text-[11px] text-gray-400">≈ {inrR(a.billing === "prepaid" ? a.balance_inr : a.used_mtd_inr)}</div>}
                    </div>
                    {a.billing === "prepaid" && a.runway_days != null && a.status === "active" && (
                      <div className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${a.runway_days < 7 ? "bg-red-50 text-red-700" : a.runway_days < 15 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                        {a.runway_days < 0 ? "Out of credit" : `~${Math.round(a.runway_days)} days left`}
                      </div>
                    )}
                  </div>
                  {a.monthly_budget > 0 && (
                    <div>
                      <div className="flex justify-between text-[11px] text-gray-500 mb-1"><span>{money(a.used_mtd, a.currency)} of {money(a.monthly_budget, a.currency)} budget</span><span className={a.over_budget ? "text-red-600 font-semibold" : ""}>{pct}%</span></div>
                      <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`absolute inset-y-0 left-0 rounded-full ${a.over_budget ? "bg-red-500" : "bg-[#F26B21]"}`} style={{ width: `${Math.min(100, pct || 0)}%` }} />
                        {projPct != null && <div className="absolute inset-y-0 w-0.5 bg-gray-500" style={{ left: `${projPct}%` }} title={`Projected ${money(a.projected_month, a.currency)}`} />}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1">Projected month: {money(a.projected_month, a.currency)}</div>
                    </div>
                  )}
                  <div className="mt-auto flex items-center gap-2 pt-1">
                    {a.billing === "prepaid" && <Button size="sm" className="bg-[#F26B21] hover:bg-[#d95b16] text-white h-9 flex-1" onClick={() => openTxn(a, "topup")} data-testid={`api-topup-${a.id}`}><Plus className="h-4 w-4 mr-1" /> Top up</Button>}
                    <Button size="sm" variant="outline" className="h-9 flex-1" onClick={() => openTxn(a, "usage")} data-testid={`api-usage-${a.id}`}>Log usage</Button>
                    <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => setImportFor(a)} aria-label="Import usage" title="Import usage" data-testid={`api-import-${a.id}`}><Upload className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {ov && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-gray-200/80">
            <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">Daily API spend, last 30 days (₹)</CardTitle></CardHeader>
            <CardContent className="h-56" data-testid="api-daily-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ov.daily} margin={{ top: 10, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6B7280" }} axisLine={false} tickLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 9, fill: "#6B7280" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(1)}k`} />
                  <Tooltip formatter={(v) => [inrR(v), "Spend"]} cursor={{ fill: "#FFF7ED" }} />
                  <Bar dataKey="value" fill="#F26B21" radius={[3, 3, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="border-gray-200/80">
            <CardHeader className="pb-0 flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-sm font-semibold text-gray-700">This month's usage by</CardTitle>
              <div className="inline-flex rounded-lg border border-gray-200 p-0.5">
                {[["by_client", "Client"], ["by_project", "Project"], ["by_agent", "Agent"], ["by_account", "Account"]].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setBreakdown(k)} className={`rounded-md px-2 py-1 text-[11px] font-semibold h-7 ${breakdown === k ? "bg-[#FFF7ED] text-[#F26B21]" : "text-gray-500"}`} data-testid={`api-breakdown-${k}`}>{l}</button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="h-56 pt-2" data-testid="api-breakdown-chart">
              {(ov[breakdown] || []).length === 0 ? <p className="text-sm text-gray-400 pt-6">Nothing tagged this month.</p> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ov[breakdown].slice(0, 7)} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <XAxis type="number" tick={{ fontSize: 9, fill: "#6B7280" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={118} />
                    <Tooltip formatter={(v) => [inrR(v), "Usage"]} cursor={{ fill: "#FFF7ED" }} />
                    <Bar dataKey="value" fill="#FBA834" radius={[0, 5, 5, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-gray-200/80 overflow-hidden">
        <CardHeader className="pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-sm font-semibold text-gray-700">Top-ups & usage</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filter.account_id} onValueChange={(v) => setFilter((f) => ({ ...f, account_id: v }))}>
              <SelectTrigger className="w-full sm:w-52 h-9" data-testid="api-filter-account"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All accounts</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filter.kind} onValueChange={(v) => setFilter((f) => ({ ...f, kind: v }))}>
              <SelectTrigger className="w-[48%] sm:w-36 h-9" data-testid="api-filter-kind"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All types</SelectItem>{Object.entries(KIND_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
            {del.dialog}<BulkDeleteBar kit={del} />
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="bg-gray-50/70">
              {del.canDelete && <TableHead className="w-20" />}
              <TableHead>Date</TableHead><TableHead>Account</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right hidden sm:table-cell">In ₹</TableHead><TableHead className="hidden md:table-cell">Tagged to</TableHead><TableHead className="hidden lg:table-cell">Note</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {txns.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-sm text-gray-400 py-8">No entries.</TableCell></TableRow>}
              {txns.slice(0, shown).map((t) => (
                <TableRow key={t.id} data-testid={`api-txn-row-${t.id}`}>
                  {del.canDelete && <TableCell className="w-20"><RowDeleteControls kit={del} row={t} /></TableCell>}
                  <TableCell className="text-xs text-gray-500 whitespace-nowrap">{t.date}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap"><button type="button" className="hover:text-[#F26B21]" onClick={() => setSheetId(t.account_id)}>{t.account_name}</button></TableCell>
                  <TableCell><Badge variant="outline" className={`${KIND_STYLE[t.kind]} text-[10px]`}>{KIND_LABEL[t.kind]}</Badge>{t.ledger_tx_id && <span className="ml-1 text-[10px] text-emerald-600">ledger</span>}</TableCell>
                  <TableCell className="text-right font-mono text-sm whitespace-nowrap">{t.kind === "usage" ? "−" : ""}{money(Math.abs(t.amount), t.currency)}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-gray-500 whitespace-nowrap hidden sm:table-cell">{inrR(Math.round(Math.abs(t.amount_inr)))}</TableCell>
                  <TableCell className="text-xs text-gray-500 hidden md:table-cell">{[t.client_name, t.project_name, t.agent_name].filter(Boolean).join(" · ") || "—"}</TableCell>
                  <TableCell className="text-xs text-gray-400 hidden lg:table-cell max-w-[200px] truncate">{t.note || (t.units ? `${Number(t.units).toLocaleString("en-IN")} ${t.unit_label}` : "")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {txns.length > shown && (
          <div className="border-t border-gray-100 px-4 py-3 flex items-center justify-between gap-2 text-xs text-gray-500">
            <span>Showing {shown} of {txns.length}{txns.length >= 200 ? "+" : ""} entries</span>
            <Button variant="outline" size="sm" onClick={() => setShown((n) => n + 50)} data-testid="api-txns-more">Show more</Button>
          </div>
        )}
      </Card>

      <AccountDialog open={accDialog.open} onOpenChange={(o) => setAccDialog((d) => ({ ...d, open: o }))} account={accDialog.account} meta={meta} onSaved={refresh} />
      <TxnDialog open={txnDialog.open} onOpenChange={(o) => setTxnDialog((d) => ({ ...d, open: o }))} account={txnDialog.account} kind={txnDialog.kind} onSaved={refresh} />
      <ImportDialog open={!!importFor} onOpenChange={(o) => !o && setImportFor(null)} account={importFor} onSaved={refresh} />
      <AccountSheet id={sheetId} ver={ver} onClose={() => setSheetId(null)} onChanged={refresh} canDelete={!!meta?.can_delete}
        onEdit={(a) => setAccDialog({ open: true, account: a })} onTxn={(a, k) => openTxn(a, k)} />
    </FinanceLayout>
  );
}
