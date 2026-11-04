import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useLoad, Spinner, Stat, PageHead, PillTabs, Pill, Field, ago, fmtDateTime, Empty } from "@/components/kit";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar } from "@/components/RecordDelete";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LifeBuoy, Plus, Search, Clock, AlertTriangle, UserX, Star, Inbox, Settings2, Lock, Send } from "lucide-react";

export const STATUS_TONE = { open: "orange", in_progress: "blue", waiting: "amber", resolved: "green", closed: "gray" };
export const PRIORITY_TONE = { low: "gray", normal: "blue", high: "amber", urgent: "red" };

export function TicketThread({ ticket, audience = "team" }) {
  return (
    <div className="space-y-3" data-testid="ticket-thread">
      {ticket.messages.map((m) => {
        if (m.author_type === "system") {
          return <div key={m.id} className="text-center text-[11px] text-gray-400">{m.author_name} · {m.body} · {ago(m.at)}</div>;
        }
        const mine = audience === "portal" ? m.author_type === "portal" : m.author_type === "user" && ticket.raised_by?.id !== m.author_id;
        return (
          <div key={m.id} className={`rounded-xl border px-3.5 py-2.5 ${m.internal ? "bg-amber-50 border-amber-200" : mine ? "bg-[#FFF7ED] border-orange-100" : "bg-white border-gray-200"}`} data-testid={`msg-${m.id}`}>
            <div className="flex items-center justify-between gap-2 text-xs mb-1">
              <span className="font-semibold text-gray-800 truncate">{m.author_name}{m.internal && <span className="ml-1.5 inline-flex items-center gap-0.5 text-amber-700"><Lock className="h-3 w-3" /> Internal note</span>}</span>
              <span className="text-gray-400 shrink-0" title={fmtDateTime(m.at)}>{ago(m.at)}</span>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">{m.body}</div>
          </div>
        );
      })}
    </div>
  );
}

function NewTicketDialog({ open, onClose, meta, onCreated }) {
  const isDesk = meta?.is_desk;
  const [f, setF] = useState({ kind: "internal", client_id: "", category: "it", priority: "normal", subject: "", body: "" });
  const [clients, setClients] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF({ kind: "internal", client_id: "", category: "it", priority: "normal", subject: "", body: "" });
    if (isDesk) api.get("/clients").then((r) => setClients((Array.isArray(r.data) ? r.data : r.data.items || []).map((c) => ({ id: c.id, name: c.name })))).catch(() => {});
  }, [open, isDesk]);
  const cats = f.kind === "client" ? meta?.client_categories : meta?.internal_categories;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/support/tickets", { ...f, client_id: f.kind === "client" ? f.client_id : null });
      toast.success(`${data.number} created${data.assignee_name ? ` — assigned to ${data.assignee_name}` : ""}`);
      onCreated(data); onClose();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="new-ticket-dialog">
        <DialogHeader><DialogTitle>{f.kind === "client" ? "Log a client ticket" : "New support request"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {isDesk && <PillTabs tabs={[["internal", "Internal request"], ["client", "For a client"]]} value={f.kind}
            onChange={(v) => setF((x) => ({ ...x, kind: v, category: v === "client" ? "website" : "it" }))} testid="nt-kind" />}
          {f.kind === "client" && (
            <Field label="Client"><Select value={f.client_id} onValueChange={(v) => set("client_id", v)}>
              <SelectTrigger data-testid="nt-client"><SelectValue placeholder="Pick a client" /></SelectTrigger>
              <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category"><Select value={f.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger data-testid="nt-category"><SelectValue /></SelectTrigger>
              <SelectContent>{(cats || []).map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Priority"><Select value={f.priority} onValueChange={(v) => set("priority", v)}>
              <SelectTrigger data-testid="nt-priority"><SelectValue /></SelectTrigger>
              <SelectContent>{(meta?.priorities || []).map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></Field>
          </div>
          <Field label="Subject"><Input value={f.subject} onChange={(e) => set("subject", e.target.value)} placeholder="e.g. Need access to the Meta Business account" data-testid="nt-subject" /></Field>
          <Field label="Details"><Textarea rows={5} value={f.body} onChange={(e) => set("body", e.target.value)} placeholder="What do you need, and by when?" data-testid="nt-body" /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !f.subject.trim() || !f.body.trim() || (f.kind === "client" && !f.client_id)} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="nt-submit">Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({ open, onClose, meta, onSaved }) {
  const [sla, setSla] = useState({});
  const [routing, setRouting] = useState({});
  useEffect(() => { if (open && meta) { setSla(Object.fromEntries(Object.entries(meta.sla_hours).map(([k, v]) => [k, String(v)]))); setRouting(meta.routing || {}); } }, [open, meta]);
  const save = async () => {
    try {
      await api.put("/support/settings", { sla_hours: Object.fromEntries(Object.entries(sla).map(([k, v]) => [k, Number(v)])), routing });
      toast.success("Desk settings saved"); onSaved(); onClose();
    } catch (e) { toast.error(apiError(e)); }
  };
  const Route = ({ prefix, cats }) => cats.map((c) => (
    <div key={c.value} className="flex items-center gap-2">
      <span className="text-sm text-gray-700 w-40 shrink-0 truncate">{c.label}</span>
      <Select value={routing[`${prefix}:${c.value}`] || "none"} onValueChange={(v) => setRouting((r) => ({ ...r, [`${prefix}:${c.value}`]: v === "none" ? null : v }))}>
        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="none">{prefix === "client" ? "Account manager" : "Unassigned"}</SelectItem>
          {meta.team.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select>
    </div>
  ));
  if (!meta) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto" data-testid="support-settings">
        <DialogHeader><DialogTitle>Support desk settings</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Resolve within (hours)</div>
            <div className="grid grid-cols-4 gap-2">{meta.priorities.map((p) => (
              <Field key={p.value} label={p.label}><Input type="number" value={sla[p.value] || ""} onChange={(e) => setSla((s) => ({ ...s, [p.value]: e.target.value }))} /></Field>))}</div>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Who picks up internal requests</div>
            <Route prefix="internal" cats={meta.internal_categories} />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Who picks up client tickets</div>
            <Route prefix="client" cats={meta.client_categories} />
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="support-settings-save">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TicketSheet({ id, meta, onClose, onChanged }) {
  const [t, setT] = useState(null);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setT(null); setBody(""); setInternal(false);
    if (id) api.get(`/support/tickets/${id}`).then((r) => setT(r.data)).catch((e) => { toast.error(apiError(e)); onClose(); });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const team = t?.audience === "team";
  const send = async (status) => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/support/tickets/${id}/messages`, { body, internal: team && internal, ...(status ? { status } : {}) });
      setT(data); setBody(""); onChanged();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const update = async (patch) => {
    try { const { data } = await api.put(`/support/tickets/${id}`, patch); setT((x) => ({ ...x, ...data })); onChanged(); }
    catch (e) { toast.error(apiError(e)); }
  };
  const mineInternal = t && t.kind === "internal" && !team;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col" data-testid="ticket-sheet">
        {!t ? <Spinner /> : (
          <>
            <SheetHeader className="p-5 pb-3 border-b border-gray-100 text-left">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                <span className="font-mono font-semibold text-gray-700">{t.number}</span>
                <Pill tone={t.kind === "client" ? "orange" : "violet"}>{t.kind === "client" ? t.client_name || "Client" : "Internal"}</Pill>
                <span>{t.category_label}</span>
                {t.overdue && <Pill tone="red"><AlertTriangle className="h-3 w-3" /> Past SLA</Pill>}
              </div>
              <SheetTitle className="text-lg leading-snug pr-6">{t.subject}</SheetTitle>
              <p className="text-xs text-gray-500">Raised by {t.raised_by?.name} · {fmtDateTime(t.created_at)}{t.due_at ? ` · due ${fmtDateTime(t.due_at)}` : ""}</p>
              {t.can_manage ? (
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <Select value={t.status} onValueChange={(v) => update({ status: v })}><SelectTrigger className="h-8 text-xs" data-testid="ticket-status"><SelectValue /></SelectTrigger>
                    <SelectContent>{meta.statuses.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
                  <Select value={t.priority} onValueChange={(v) => update({ priority: v })}><SelectTrigger className="h-8 text-xs" data-testid="ticket-priority"><SelectValue /></SelectTrigger>
                    <SelectContent>{meta.priorities.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
                  <Select value={t.assignee_id || "none"} onValueChange={(v) => update({ assignee_id: v === "none" ? "" : v })}><SelectTrigger className="h-8 text-xs" data-testid="ticket-assignee"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Unassigned</SelectItem>{meta.team.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Pill tone={STATUS_TONE[t.status]}>{t.status_label}</Pill><Pill tone={PRIORITY_TONE[t.priority]}>{t.priority}</Pill>
                  {t.assignee_name && <span className="text-xs text-gray-500">with {t.assignee_name}</span>}
                </div>
              )}
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-5"><TicketThread ticket={t} /></div>
            <div className="border-t border-gray-100 p-4 space-y-2 bg-white">
              {t.status === "closed" && !team ? <p className="text-xs text-gray-500">This request is closed. <button className="text-[#F26B21] font-semibold" onClick={() => update({ status: "open" })}>Re-open it</button></p> : (
                <>
                  {team && t.kind === "client" && <PillTabs tabs={[["reply", "Reply to client"], ["note", "Internal note"]]} value={internal ? "note" : "reply"} onChange={(v) => setInternal(v === "note")} testid="composer-mode" />}
                  <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={internal ? "Only the team sees this…" : team ? "Write a reply…" : "Add more details…"}
                    className={internal ? "bg-amber-50/60 border-amber-200" : ""} data-testid="ticket-reply" />
                  <div className="flex flex-wrap justify-end gap-2">
                    {mineInternal && t.status !== "closed" && <Button variant="ghost" size="sm" onClick={() => update({ status: "closed" })} data-testid="ticket-close-own">Close request</Button>}
                    {team && !internal && t.can_manage && <Button variant="outline" size="sm" disabled={busy || !body.trim()} onClick={() => send("resolved")} data-testid="ticket-reply-resolve">Reply & resolve</Button>}
                    {team && !internal && t.can_manage && t.kind === "client" && <Button variant="outline" size="sm" disabled={busy || !body.trim()} onClick={() => send("waiting")}>Reply & wait</Button>}
                    <Button size="sm" disabled={busy || !body.trim()} onClick={() => send()} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="ticket-send"><Send className="h-3.5 w-3.5 mr-1.5" />{internal ? "Add note" : "Send"}</Button>
                  </div>
                </>
              )}
              {t.rating && <p className="text-xs text-gray-500 flex items-center gap-1"><Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" /> Client rated {t.rating.score}/5{t.rating.comment ? ` — “${t.rating.comment}”` : ""}</p>}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function SupportPage() {
  const [sp, setSp] = useSearchParams();
  const [meta, reloadMeta] = useLoad("/support/meta");
  const [summary, reloadSummary] = useLoad("/support/summary");
  const isDesk = meta?.is_desk;
  const [view, setView] = useState(null);
  const [status, setStatus] = useState(sp.get("status") || "active");
  const [priority, setPriority] = useState("all");
  const [assignee, setAssignee] = useState(sp.get("assignee") || "all");
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const openId = sp.get("ticket");
  useEffect(() => { if (meta && !view) setView(meta.is_desk ? "client" : "mine"); }, [meta, view]);
  const params = useMemo(() => {
    if (!view) return null;
    const p = { status: status === "all" ? undefined : status, priority: priority === "all" ? undefined : priority, q: q.trim() || undefined };
    if (view === "client" || view === "internal") return { ...p, scope: "desk", kind: view, assignee: assignee === "all" ? undefined : assignee };
    return { ...p, scope: view === "assigned" ? "assigned" : "mine" };
  }, [view, status, priority, assignee, q]);
  const [rows, reload] = useLoad(view ? "/support/tickets" : null, params);
  const del = useRecordDelete({ coll: "tickets", permKey: "support.delete", rows: rows || [], onDeleted: () => { reload(); reloadSummary(); }, labelOf: (r) => `${r.number} ${r.subject}` });
  const open = (id) => setSp((p) => { const n = new URLSearchParams(p); n.set("ticket", id); return n; });
  const close = () => setSp((p) => { const n = new URLSearchParams(p); n.delete("ticket"); return n; });
  const changed = () => { reload(); reloadSummary(); };
  if (!meta || !view) return <Spinner />;
  const tabs = isDesk
    ? [["client", "Client tickets", summary?.client?.open], ["internal", "Internal requests", summary?.internal?.open], ["assigned", "Assigned to me", summary?.assigned_open], ["mine", "My requests", summary?.my_open]]
    : [["mine", "My requests", summary?.my_open], ...(summary?.assigned_open ? [["assigned", "Assigned to me", summary.assigned_open]] : [])];
  const s = summary || {};
  return (
    <div className="space-y-5 max-w-7xl" data-testid="support-page">
      <PageHead kicker="Core" title="Support" sub={isDesk ? "Client tickets from the portal and the team's internal requests, in one desk." : "Ask for help with IT, tools, HR, payroll, finance or admin — and follow it here."}
        actions={<>
          {meta.can_manage && <Button variant="outline" size="sm" onClick={() => setSettings(true)} data-testid="support-settings-btn"><Settings2 className="h-3.5 w-3.5 mr-1.5" /> Desk settings</Button>}
          <Button size="sm" onClick={() => setNewOpen(true)} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="new-ticket-btn"><Plus className="h-3.5 w-3.5 mr-1.5" /> New request</Button>
        </>} />
      {isDesk && summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat icon={Inbox} label="Open client tickets" value={s.client?.open ?? 0} sub={s.client?.urgent ? `${s.client.urgent} urgent` : null} testid="sup-open-client" />
          <Stat icon={LifeBuoy} label="Open internal" value={s.internal?.open ?? 0} tone="violet" />
          <Stat icon={UserX} label="Unassigned" value={(s.client?.unassigned || 0) + (s.internal?.unassigned || 0)} tone="amber" />
          <Stat icon={AlertTriangle} label="Past SLA" value={(s.client?.overdue || 0) + (s.internal?.overdue || 0)} tone="red" />
          <Stat icon={Star} label="Client rating" value={s.csat ? `${s.csat}/5` : "—"} sub={s.avg_resolution_hours ? `${s.avg_resolution_hours}h to resolve` : null} tone="green" className="col-span-2 lg:col-span-1" />
        </div>
      )}
      <PillTabs tabs={tabs} value={view} onChange={setView} testid="support-view" />
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, subject, client" className="pl-9 bg-white" data-testid="support-search" /></div>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-40 bg-white" data-testid="support-status"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="all">All</SelectItem>{meta.statuses.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select>
        <Select value={priority} onValueChange={setPriority}><SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Any priority</SelectItem>{meta.priorities.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select>
        {(view === "client" || view === "internal") && (
          <Select value={assignee} onValueChange={setAssignee}><SelectTrigger className="w-44 bg-white" data-testid="support-assignee"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Anyone</SelectItem><SelectItem value="none">Unassigned</SelectItem>{meta.team.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select>
        )}
        {meta.can_delete && <span className="ml-auto">{del.dialog}<BulkDeleteBar kit={del} /></span>}
      </div>
      <Card className="border-gray-200/80 shadow-sm">
        <CardContent className="p-0">
          {!rows ? <Spinner className="h-40" /> : rows.length === 0 ? (
            <Empty icon={LifeBuoy} title={view === "mine" ? "No requests yet" : "Nothing here"} sub={view === "mine" ? "Need a laptop fixed, a tool login or a salary certificate? Raise a request." : "No tickets match these filters."}
              action={view === "mine" && <Button size="sm" onClick={() => setNewOpen(true)} className="bg-[#F26B21] hover:bg-[#E05A10] text-white">New request</Button>} />
          ) : (
            <ul className="divide-y divide-gray-100" data-testid="ticket-list">
              {rows.map((r) => {
                const unread = view === "mine" ? r.unread_for_requester : r.unread_for_team;
                return (
                  <li key={r.id} className="px-4 py-3 hover:bg-orange-50/40 cursor-pointer flex gap-3" onClick={() => open(r.id)} data-testid={`ticket-row-${r.id}`}>
                    <span className="pt-0.5"><RowDeleteControls kit={del} row={r} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {unread && <span className="h-2 w-2 rounded-full bg-[#F26B21]" title="New reply" />}
                        <span className="font-mono text-xs text-gray-400">{r.number}</span>
                        <span className="font-semibold text-gray-900 truncate">{r.subject}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 truncate">
                        {r.kind === "client" ? r.client_name : r.raised_by?.name} · {r.category_label}
                        {r.last_message?.preview ? ` · “${r.last_message.preview.slice(0, 80)}${r.last_message.preview.length > 80 ? "…" : ""}”` : ""}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex gap-1"><Pill tone={PRIORITY_TONE[r.priority]}>{r.priority}</Pill><Pill tone={STATUS_TONE[r.status]}>{r.status_label}</Pill></div>
                      <div className="text-[11px] text-gray-400 flex items-center gap-1">
                        {r.overdue && <span className="text-red-600 font-semibold flex items-center gap-0.5"><Clock className="h-3 w-3" /> late</span>}
                        {r.assignee_name || (view !== "mine" ? "Unassigned" : "")} · {ago(r.last_activity_at)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <NewTicketDialog open={newOpen} onClose={() => setNewOpen(false)} meta={meta} onCreated={(t) => { changed(); open(t.id); }} />
      <SettingsDialog open={settings} onClose={() => setSettings(false)} meta={meta} onSaved={reloadMeta} />
      <TicketSheet id={openId} meta={meta} onClose={close} onChanged={changed} />
    </div>
  );
}
