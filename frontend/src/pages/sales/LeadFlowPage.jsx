import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLoad, Spinner, Stat, PageHead, PillTabs, Pill, Field, inr, fmtDate, localISO } from "@/components/kit";
import { LeadSankey, SourceTable, MonthlyBySource, SOURCE_COLORS } from "@/components/LeadFlowChart";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar } from "@/components/RecordDelete";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { GitBranch, Users2, CheckCircle2, Target, Wallet, Plus, Upload, Link2, Copy, RefreshCw, Search } from "lucide-react";

const PERIODS = [["30", "30 days"], ["90", "90 days"], ["180", "6 months"], ["365", "12 months"]];
const STAGES = [["new", "New"], ["contacted", "Contacted"], ["qualified", "Qualified"], ["converted", "Converted"], ["lost", "Lost"]];
const STAGE_TONE = { new: "gray", contacted: "blue", qualified: "violet", converted: "green", lost: "red" };

function parseCsv(text) {
  const rows = [];
  let cur = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; cur.push(field); rows.push(cur); cur = []; field = ""; }
    else field += c;
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }
  const clean = rows.filter((r) => r.some((x) => x.trim()));
  if (!clean.length) return [];
  const head = clean[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return clean.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
}

function LeadDialog({ open, onClose, lead, clients, sources, defaultClient, onSaved }) {
  const blank = { client_id: defaultClient || "", name: "", phone: "", email: "", source: "meta_ads", campaign: "", stage: "new", value: "", date: localISO(), notes: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF(lead ? { ...blank, ...lead, value: lead.value ? String(lead.value) : "" } : blank);
  }, [open, lead]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!f.client_id) return toast.error("Pick the client");
    if (!f.name.trim() && !f.phone.trim()) return toast.error("Add a name or phone");
    setBusy(true);
    try {
      const body = { ...f, value: Number(f.value) || 0 };
      if (lead) await api.put(`/client-leads/${lead.id}`, body);
      else await api.post("/client-leads", body);
      toast.success(lead ? "Lead updated" : "Lead added");
      onSaved(); onClose();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="client-lead-dialog">
        <DialogHeader><DialogTitle>{lead ? "Edit lead" : "Add a client lead"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Client" className="sm:col-span-2">
            <Select value={f.client_id} onValueChange={(v) => set("client_id", v)} disabled={!!lead}>
              <SelectTrigger data-testid="cl-client"><SelectValue placeholder="Pick a client" /></SelectTrigger>
              <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} data-testid="cl-name" /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Source">
            <Select value={f.source} onValueChange={(v) => set("source", v)}>
              <SelectTrigger data-testid="cl-source"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(sources).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Stage">
            <Select value={f.stage} onValueChange={(v) => set("stage", v)}>
              <SelectTrigger data-testid="cl-stage"><SelectValue /></SelectTrigger>
              <SelectContent>{STAGES.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Campaign"><Input value={f.campaign} onChange={(e) => set("campaign", e.target.value)} placeholder="Optional" /></Field>
          <Field label="Date"><Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
          {f.stage === "converted" && <Field label="Deal value (₹)" className="sm:col-span-2"><Input type="number" value={f.value} onChange={(e) => set("value", e.target.value)} /></Field>}
          <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="cl-save">{lead ? "Save" : "Add lead"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ open, onClose, clients, defaultClient, onDone }) {
  const [cid, setCid] = useState(defaultClient || "");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const parsed = parseCsv(await file.text());
    setRows(parsed);
    if (!parsed.length) toast.error("No rows found — the first line must be the column names");
  };
  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/client-leads/import", { client_id: cid, rows });
      toast.success(`${data.imported} leads imported${data.skipped ? ` · ${data.skipped} skipped` : ""}`);
      onDone(); onClose(); setRows([]);
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="client-lead-import">
        <DialogHeader><DialogTitle>Import client leads (CSV)</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <Field label="Client">
            <Select value={cid} onValueChange={setCid}><SelectTrigger><SelectValue placeholder="Pick a client" /></SelectTrigger>
              <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
          </Field>
          <Field label="CSV file" hint="Columns: name, phone, email, source, campaign, stage, value, date, notes. Export from Meta lead forms, Google Sheets or your CRM.">
            <Input type="file" accept=".csv,text/csv" onChange={onFile} data-testid="cl-import-file" />
          </Field>
          {rows.length > 0 && <p className="text-xs text-gray-600">{rows.length} rows ready · first: <b>{rows[0].name || rows[0].phone || "—"}</b> ({rows[0].source || "source not set"})</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={run} disabled={busy || !cid || !rows.length} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="cl-import-run">Import {rows.length || ""}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CaptureDialog({ open, onClose, clientId, clientName }) {
  const [info, setInfo] = useState(null);
  const load = (rotate = false) => api.get("/client-leads/intake-key", { params: { ...(clientId ? { client_id: clientId } : {}), ...(rotate ? { rotate: true } : {}) } })
    .then((r) => setInfo(r.data)).catch((e) => { toast.error(apiError(e)); onClose(); });
  useEffect(() => { if (open) { setInfo(null); load(); } }, [open, clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  const copy = (t) => { navigator.clipboard?.writeText(t); toast.success("Copied"); };
  const sample = info ? `curl -X POST ${info.url} \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"Priya","phone":"+91 98765 43210","source":"meta_ads","campaign":"Diwali offer"}'` : "";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl" data-testid="capture-dialog">
        <DialogHeader><DialogTitle>Lead capture link — {clientName || "our pipeline"}</DialogTitle></DialogHeader>
        {!info ? <Spinner className="h-24" /> : (
          <div className="space-y-3 text-sm">
            <p className="text-gray-600">Point website forms, Meta lead ads (via Zapier / Make / Pabbly), WhatsApp tools or landing pages at this link. Each submission lands here as a new lead{clientId ? " for this client" : " in the sales pipeline"}.</p>
            <div className="flex gap-2"><Input readOnly value={info.url} className="font-mono text-xs" data-testid="capture-url" /><Button variant="outline" size="icon" onClick={() => copy(info.url)}><Copy className="h-4 w-4" /></Button></div>
            <p className="text-xs text-gray-500">Accepted fields: {info.fields.join(", ")} (JSON or form post). {info.count ? `${info.count} leads received so far` : "No leads received yet"}{info.last_used_at ? ` · last ${fmtDate(info.last_used_at)}` : ""}.</p>
            <pre className="rounded-lg bg-gray-900 text-gray-100 text-[11px] p-3 overflow-x-auto">{sample}</pre>
            <p className="text-xs text-amber-700">Anyone with this link can add leads. If it leaks, make a new link — the old one stops working.</p>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => load(true)} data-testid="capture-rotate"><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> New link</Button>
          <Button onClick={onClose} className="bg-[#F26B21] hover:bg-[#E05A10] text-white">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LeadFlowPage() {
  const { hasPerm } = useAuth();
  const canInternal = hasPerm("sales.pipeline");
  const canClients = hasPerm("lead_flow");
  const [scope, setScope] = useState(canInternal ? "internal" : "clients");
  const [days, setDays] = useState("90");
  const [clientId, setClientId] = useState("all");
  const [tab, setTab] = useState("flow");
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("all");
  const [edit, setEdit] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [capture, setCapture] = useState(false);
  const end = localISO();
  const start = localISO(new Date(Date.now() - (Number(days) - 1) * 86400000));
  const params = { scope, start, end, ...(scope === "clients" && clientId !== "all" ? { client_id: clientId } : {}) };
  const [flow, reload] = useLoad("/lead-flow", params);
  const [clients] = useLoad(canClients ? "/clients" : null);
  const clientList = useMemo(() => (Array.isArray(clients) ? clients : clients?.items || []).map((c) => ({ id: c.id, name: c.name })), [clients]);
  const leadParams = { ...(clientId !== "all" ? { client_id: clientId } : {}), ...(stage !== "all" ? { stage } : {}), ...(q.trim() ? { q: q.trim() } : {}), start, end };
  const [leads, reloadLeads] = useLoad(scope === "clients" && tab === "leads" ? "/client-leads" : null, leadParams);
  const del = useRecordDelete({ coll: "client_leads", permKey: "sales.delete", rows: leads || [], onDeleted: () => { reloadLeads(); reload(); }, labelOf: (r) => r.name });
  const t = flow?.totals;
  const isClients = scope === "clients";
  const winWord = isClients ? "Converted" : "Won";
  const selName = clientList.find((c) => c.id === clientId)?.name;
  const refresh = () => { reload(); reloadLeads(); };

  return (
    <div className="space-y-5 max-w-7xl" data-testid="lead-flow-page">
      <PageHead kicker="Growth" title="Lead Flow" sub="Where leads come from, how far they get, and which sources turn into business."
        actions={flow?.can_manage && (
          <>
            <Button variant="outline" size="sm" onClick={() => (isClients && clientId === "all" ? toast.info("Pick a client first — each client has its own capture link") : setCapture(true))} data-testid="lead-capture-btn"><Link2 className="h-3.5 w-3.5 mr-1.5" /> Capture link</Button>
            {isClients && <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} data-testid="lead-import-btn"><Upload className="h-3.5 w-3.5 mr-1.5" /> Import CSV</Button>}
            {isClients && <Button size="sm" onClick={() => setAddOpen(true)} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="lead-add-btn"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add lead</Button>}
          </>
        )} />

      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
        {canInternal && canClients && <PillTabs tabs={[["internal", "Our leads"], ["clients", "Client leads"]]} value={scope} onChange={(v) => { setScope(v); setTab("flow"); }} testid="lf-scope" />}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {isClients && (
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="w-full sm:w-56 bg-white" data-testid="lf-client"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All clients</SelectItem>{clientList.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-full sm:w-36 bg-white" data-testid="lf-period"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODS.map(([k, v]) => <SelectItem key={k} value={k}>Last {v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {!flow ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat icon={Users2} label="Leads" value={t.leads} testid="lf-total" />
            <Stat icon={Target} label="Qualified" value={t.qualified} sub={t.leads ? `${Math.round((100 * t.qualified) / t.leads)}%` : null} tone="violet" />
            <Stat icon={CheckCircle2} label={winWord} value={t.won} sub={`${t.win_rate}%`} tone="green" />
            <Stat icon={Wallet} label={`${winWord} value`} value={inr(t.won_value)} tone="blue" />
            {isClients
              ? <Stat icon={Wallet} label="Cost per lead (paid)" value={t.cost_per_lead ? inr(t.cost_per_lead) : "—"} sub={t.ad_spend ? `${inr(t.ad_spend)} spend` : null} tone="amber" className="col-span-2 lg:col-span-1" />
              : <Stat icon={GitBranch} label="Open pipeline" value={inr(t.pipeline_value)} sub={`${t.open} open`} tone="amber" className="col-span-2 lg:col-span-1" />}
          </div>

          {isClients && <PillTabs tabs={[["flow", "Flow"], ["leads", "Leads list"]]} value={tab} onChange={setTab} testid="lf-tab" />}

          {tab === "flow" ? (
            <>
              <Card className="border-gray-200/80 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">{isClients ? (selName ? `${selName} — lead flow` : "Client lead flow") : "Our lead flow"}</CardTitle>
                  <p className="text-xs text-gray-500">Left: where leads came from · middle: the furthest stage they reached · right: how they ended up. Hover a band for numbers.</p>
                </CardHeader>
                <CardContent><LeadSankey flow={flow} /></CardContent>
              </Card>
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <Card className="border-gray-200/80 shadow-sm lg:col-span-3">
                  <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">By source</CardTitle></CardHeader>
                  <CardContent><SourceTable sources={flow.sources} winLabel={winWord} showSpend={isClients} /></CardContent>
                </Card>
                <Card className="border-gray-200/80 shadow-sm lg:col-span-2">
                  <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">New leads per month</CardTitle></CardHeader>
                  <CardContent><MonthlyBySource monthly={flow.monthly} labels={flow.source_labels} /></CardContent>
                </Card>
              </div>
              {isClients && flow.clients?.length > 0 && (
                <Card className="border-gray-200/80 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">By client</CardTitle></CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="lf-clients-table">
                      <thead><tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                        <th className="text-left font-semibold py-2">Client</th><th className="text-right font-semibold py-2 px-2">Leads</th>
                        <th className="text-right font-semibold py-2 px-2">Converted</th><th className="text-right font-semibold py-2 px-2">Rate</th><th className="text-left font-semibold py-2 pl-3">Top source</th></tr></thead>
                      <tbody>{flow.clients.map((c) => (
                        <tr key={c.client_id} className="border-b border-gray-50 last:border-0 hover:bg-orange-50/40 cursor-pointer" onClick={() => setClientId(c.client_id)}>
                          <td className="py-2 font-medium text-gray-800">{c.client_name}</td><td className="py-2 px-2 text-right font-mono">{c.leads}</td>
                          <td className="py-2 px-2 text-right font-mono">{c.converted}</td><td className="py-2 px-2 text-right font-mono text-gray-600">{c.conversion_rate}%</td>
                          <td className="py-2 pl-3 text-gray-600">{c.top_source}</td></tr>))}</tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
              {!isClients && <p className="text-xs text-gray-400">Manage individual leads in the <Link to="/sales/pipeline" className="text-[#F26B21] font-semibold">sales pipeline</Link>.</p>}
            </>
          ) : (
            <Card className="border-gray-200/80 shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, campaign" className="pl-9" data-testid="cl-search" /></div>
                  <Select value={stage} onValueChange={setStage}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All stages</SelectItem><SelectItem value="open">Open</SelectItem>{STAGES.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
                  <span className="ml-auto">{del.dialog}<BulkDeleteBar kit={del} /></span>
                </div>
                {!leads ? <Spinner className="h-32" /> : leads.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">No leads match.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="client-leads-table">
                      <thead><tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                        <th className="w-14" /><th className="text-left font-semibold py-2">Lead</th><th className="text-left font-semibold py-2 px-2">Client</th>
                        <th className="text-left font-semibold py-2 px-2">Source</th><th className="text-left font-semibold py-2 px-2">Stage</th><th className="text-right font-semibold py-2 pl-2">Date</th></tr></thead>
                      <tbody>{leads.slice(0, 300).map((l) => (
                        <tr key={l.id} className="border-b border-gray-50 last:border-0 hover:bg-orange-50/40 cursor-pointer" onClick={() => flow.can_manage && setEdit(l)} data-testid={`client-lead-${l.id}`}>
                          <td className="py-2"><RowDeleteControls kit={del} row={l} /></td>
                          <td className="py-2"><div className="font-medium text-gray-800">{l.name}</div><div className="text-xs text-gray-400">{l.phone}{l.campaign ? ` · ${l.campaign}` : ""}</div></td>
                          <td className="py-2 px-2 text-gray-600">{l.client_name}</td>
                          <td className="py-2 px-2"><span className="inline-flex items-center gap-1.5 text-gray-700"><span className="h-2 w-2 rounded-sm" style={{ background: SOURCE_COLORS[l.source] || "#9ca3af" }} />{l.source_label}</span></td>
                          <td className="py-2 px-2"><Pill tone={STAGE_TONE[l.stage]}>{STAGES.find((s) => s[0] === l.stage)?.[1]}</Pill></td>
                          <td className="py-2 pl-2 text-right text-gray-500 whitespace-nowrap">{fmtDate(l.date, { day: "numeric", month: "short" })}</td></tr>))}</tbody>
                    </table>
                    {leads.length > 300 && <p className="text-xs text-gray-400 pt-2">Showing the latest 300 of {leads.length}.</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <LeadDialog open={addOpen || !!edit} lead={edit} onClose={() => { setAddOpen(false); setEdit(null); }} clients={clientList}
        sources={flow?.source_labels || {}} defaultClient={clientId !== "all" ? clientId : ""} onSaved={refresh} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} clients={clientList} defaultClient={clientId !== "all" ? clientId : ""} onDone={refresh} />
      <CaptureDialog open={capture} onClose={() => setCapture(false)} clientId={isClients && clientId !== "all" ? clientId : null}
        clientName={isClients ? (selName || null) : "our pipeline"} />
    </div>
  );
}
