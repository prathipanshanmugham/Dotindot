import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import ExportMenu from "@/components/ExportMenu";
import MultiSelect from "@/components/MultiSelect";
import { useRecordDelete } from "@/components/RecordDelete";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Plus, Upload, Pencil, Trash2, PartyPopper, MapPin, Plane } from "lucide-react";

export const HOLIDAY_STYLE = {
  public: { chip: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500" },
  company: { chip: "bg-orange-50 text-[#C2410C] border-orange-200", dot: "bg-[#F26B21]" },
  regional: { chip: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500" },
  optional: { chip: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-400" },
};
const AWAY = { leave: "On leave", half_day: "Half day", wfh: "WFH" };
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthLabel = (m) => new Date(m + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const shiftMonth = (m, k) => { const [y, mo] = m.split("-").map(Number); const t = y * 12 + (mo - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
const fmt = (iso, o = { day: "numeric", month: "short" }) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", o);

function HolidayDialog({ open, onOpenChange, holiday, meta, onSaved, defaultDate }) {
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF(holiday ? { date: holiday.date, name: holiday.name, type: holiday.type, branch_ids: holiday.branch_ids || [], notes: holiday.notes || "" }
      : { date: defaultDate || "", name: "", type: "public", branch_ids: [], notes: "" });
  }, [open, holiday, defaultDate]);
  const save = async () => {
    setBusy(true);
    try {
      if (holiday) await api.put(`/holidays/${holiday.id}`, f); else await api.post("/holidays", f);
      toast.success(holiday ? "Holiday updated" : "Holiday added");
      onOpenChange(false); onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="holiday-dialog">
        <DialogHeader><DialogTitle>{holiday ? "Edit holiday" : "Add a holiday"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Date</Label><Input type="date" value={f.date || ""} onChange={(e) => setF((x) => ({ ...x, date: e.target.value }))} data-testid="holiday-date" /></div>
            <div className="space-y-1"><Label>Type</Label>
              <Select value={f.type || "public"} onValueChange={(v) => setF((x) => ({ ...x, type: v }))}>
                <SelectTrigger data-testid="holiday-type"><SelectValue /></SelectTrigger>
                <SelectContent>{(meta?.types || []).map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label>Name</Label><Input value={f.name || ""} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} placeholder="e.g. Pongal" data-testid="holiday-name" /></div>
          <div className="space-y-1"><Label>Locations</Label>
            <MultiSelect options={(meta?.branches || []).map((b) => ({ value: b.id, label: b.name, hint: b.city }))} value={f.branch_ids || []}
              onChange={(v) => setF((x) => ({ ...x, branch_ids: v }))} placeholder="All locations" testid="holiday-branches" />
            <p className="text-[11px] text-gray-400">Leave empty to apply it everywhere. Optional holidays are shown but stay working days.</p>
          </div>
          <div className="space-y-1"><Label>Notes</Label><Textarea rows={2} value={f.notes || ""} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter className="gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={busy || !f.date || !f.name?.trim()} onClick={save} data-testid="holiday-save">{holiday ? "Save" : "Add holiday"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ open, onOpenChange, meta, onSaved }) {
  const [text, setText] = useState("");
  const [type, setType] = useState("public");
  const [branchIds, setBranchIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const parts = l.split(/[,\t]/).map((x) => x.trim());
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(parts[0] || "") && parts[1];
    return { ok, date: parts[0], name: parts[1], type: parts[2] ? parts[2].toLowerCase() : undefined, raw: l };
  }), [text]);
  const good = rows.filter((r) => r.ok);
  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/holidays/bulk", { rows: good.map(({ date, name, type: t }) => ({ date, name, type: t })), type, branch_ids: branchIds });
      toast.success(`${data.added} added${data.skipped ? ` · ${data.skipped} already there` : ""}`);
      setText(""); onOpenChange(false); onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="holiday-import-dialog">
        <DialogHeader><DialogTitle>Import the holiday list</DialogTitle>
          <DialogDescription>Paste one holiday per line: <span className="font-mono">date, name</span> and optionally a type (public, company, regional, optional).</DialogDescription></DialogHeader>
        <Textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" placeholder={"2027-01-15, Pongal\n2027-01-26, Republic Day\n2027-03-04, Holi, optional"} data-testid="holiday-import-text" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Default type</Label>
            <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(meta?.types || []).map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1"><Label>Locations</Label>
            <MultiSelect options={(meta?.branches || []).map((b) => ({ value: b.id, label: b.name }))} value={branchIds} onChange={setBranchIds} placeholder="All locations" />
          </div>
        </div>
        <p className="text-xs text-gray-500" data-testid="holiday-import-preview">{good.length} ready{rows.length - good.length ? ` · ${rows.length - good.length} lines skipped (need YYYY-MM-DD, name)` : ""}</p>
        <DialogFooter className="gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={busy || !good.length} onClick={run} data-testid="holiday-import-run">Import {good.length || ""}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const UpcomingHolidays = ({ items, title = "Upcoming holidays", compact, testid = "upcoming-holidays" }) => (
  <div data-testid={testid}>
    {title && <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">{title}</div>}
    {(!items || items.length === 0) ? <p className="text-sm text-gray-400">No holidays coming up.</p> : (
      <ul className="space-y-2">
        {items.map((h) => (
          <li key={h.id} className="flex items-center gap-3">
            <div className="w-11 shrink-0 rounded-lg bg-gray-50 border border-gray-100 text-center py-1">
              <div className="text-[9px] font-bold uppercase text-gray-400">{fmt(h.date, { month: "short" })}</div>
              <div className="text-sm font-bold leading-none text-gray-900">{new Date(h.date + "T00:00:00").getDate()}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-900 truncate">{h.name}</div>
              {!compact && <div className="text-[11px] text-gray-500 truncate">{h.weekday} · {h.type_label}{h.locations && h.locations[0] !== "All locations" ? ` · ${h.locations.join(", ")}` : ""}</div>}
            </div>
            <span className={`h-2 w-2 rounded-full shrink-0 ${HOLIDAY_STYLE[h.type]?.dot || "bg-gray-300"}`} />
          </li>
        ))}
      </ul>
    )}
  </div>
);

export default function HolidayCalendar() {
  const [month, setMonth] = useState("");
  const [branch, setBranch] = useState("");
  const [d, setD] = useState(null);
  const [meta, setMeta] = useState(null);
  const [yearList, setYearList] = useState([]);
  const [edit, setEdit] = useState({ open: false, holiday: null });
  const [importOpen, setImportOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(null);
  const year = (month || d?.month || "").slice(0, 4);

  const load = useCallback(() => {
    const params = {};
    if (month) params.month = month;
    if (branch) params.branch = branch;
    api.get("/holidays/calendar", { params }).then((r) => { setD(r.data); if (!month) setMonth(r.data.month); }).catch((e) => toast.error(apiError(e)));
  }, [month, branch]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/holidays/meta").then((r) => setMeta(r.data)).catch(() => {}); }, []);
  const loadYear = useCallback(() => {
    if (!year) return;
    api.get("/holidays", { params: { year, ...(branch ? { branch } : {}) } }).then((r) => setYearList(r.data)).catch(() => {});
  }, [year, branch]);
  useEffect(() => { loadYear(); }, [loadYear]);
  const refresh = () => { load(); loadYear(); };
  const del = useRecordDelete({ coll: "holidays", permKey: "holidays.manage", rows: yearList, onDeleted: refresh, labelOf: (h) => `${h.name} (${h.date})` });

  if (!d) return <div className="h-40 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;
  const lead = (new Date(d.days[0].date + "T00:00:00").getDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...d.days];
  while (cells.length % 7) cells.push(null);
  const canManage = d.can_manage;
  const dayOffCount = d.days.filter((x) => x.holidays.some((h) => h.day_off) && !x.weekly_off).length;
  const selectedDay = dayOpen ? d.days.find((x) => x.date === dayOpen) : null;

  return (
    <div className="space-y-4" data-testid="holiday-calendar">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setMonth(shiftMonth(d.month, -1))} aria-label="Previous month" data-testid="cal-prev"><ChevronLeft className="h-4 w-4" /></Button>
          <div className="min-w-[150px] text-center font-semibold text-gray-900" data-testid="cal-month">{monthLabel(d.month)}</div>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setMonth(shiftMonth(d.month, 1))} aria-label="Next month" data-testid="cal-next"><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" className="ml-1" onClick={() => setMonth(d.today.slice(0, 7))}>Today</Button>
        </div>
        <Select value={branch || "default"} onValueChange={(v) => setBranch(v === "default" ? "" : v)}>
          <SelectTrigger className="sm:w-64 bg-white" data-testid="cal-branch"><MapPin className="h-4 w-4 mr-1.5 text-gray-400" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="default">{d.is_team ? "All locations" : `My location${d.branch_name && !branch ? ` (${d.branch_name})` : ""}`}</SelectItem>
            {d.branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
          <ExportMenu dataset="holidays" params={{ year, ...(branch ? { branch } : {}) }} />
          {canManage && <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} data-testid="holiday-import-btn"><Upload className="h-4 w-4 mr-1.5" /> Import list</Button>}
          {canManage && <Button size="sm" className="bg-[#F26B21] hover:bg-[#d95b16] text-white" onClick={() => setEdit({ open: true, holiday: null })} data-testid="holiday-add-btn"><Plus className="h-4 w-4 mr-1.5" /> Add holiday</Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <Card className="xl:col-span-3 border-gray-200/80 overflow-hidden">
          <div className="grid grid-cols-7 bg-gray-50/80 border-b border-gray-100">
            {WEEK.map((w) => <div key={w} className="px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">{w}</div>)}
          </div>
          <div className="grid grid-cols-7" data-testid="cal-grid">
            {cells.map((c, i) => {
              if (!c) return <div key={i} className="min-h-[64px] sm:min-h-[92px] border-b border-r border-gray-100 bg-gray-50/40" />;
              const hol = c.holidays[0];
              const off = c.weekly_off;
              return (
                <button key={c.date} type="button" onClick={() => setDayOpen(c.date)} data-testid={`cal-day-${c.date}`}
                  className={`min-h-[64px] sm:min-h-[92px] border-b border-r border-gray-100 p-1 sm:p-1.5 text-left align-top hover:bg-orange-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F26B21] ${off ? "bg-gray-50/70" : "bg-white"} ${hol?.day_off ? "bg-rose-50/40" : ""}`}>
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${c.is_today ? "bg-[#F26B21] text-white" : off ? "text-gray-400" : "text-gray-700"}`}>{new Date(c.date + "T00:00:00").getDate()}</span>
                    {c.away.length > 0 && <span className="text-[10px] font-semibold text-gray-500 inline-flex items-center gap-0.5" title={c.away.map((a) => `${a.name}: ${AWAY[a.status]}`).join("\n")}><Plane className="h-3 w-3" />{c.away.length}</span>}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {c.holidays.slice(0, 2).map((h) => (
                      <div key={h.id} className={`hidden sm:block truncate rounded border px-1 py-0.5 text-[10px] font-medium ${HOLIDAY_STYLE[h.type]?.chip}`}>{h.name}</div>
                    ))}
                    {c.holidays.length > 0 && <div className="sm:hidden flex gap-0.5">{c.holidays.map((h) => <span key={h.id} className={`h-1.5 w-1.5 rounded-full ${HOLIDAY_STYLE[h.type]?.dot}`} />)}</div>}
                    {off && !c.holidays.length && <div className="hidden sm:block text-[10px] text-gray-400">Weekly off</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
        <div className="space-y-4">
          <Card className="border-gray-200/80"><CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-700"><PartyPopper className="h-4 w-4 text-[#F26B21]" /><span><span className="font-semibold">{dayOffCount}</span> holiday{dayOffCount === 1 ? "" : "s"} off in {monthLabel(d.month).split(" ")[0]}</span></div>
            <UpcomingHolidays items={d.upcoming} />
          </CardContent></Card>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-gray-500">
            {(meta?.types || []).map((t) => <span key={t.value} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${HOLIDAY_STYLE[t.value]?.dot}`} />{t.label}</span>)}
            <span className="inline-flex items-center gap-1.5"><Plane className="h-3 w-3" />{d.is_team ? "Team away" : "You're away"}</span>
          </div>
        </div>
      </div>

      <Card className="border-gray-200/80" data-testid="holiday-year-list">
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold">All holidays in {year}</CardTitle>
          <span className="text-xs text-gray-500">{yearList.filter((h) => h.day_off).length} days off · {yearList.filter((h) => !h.day_off).length} optional</span>
        </CardHeader>
        <CardContent className="p-0">
          {yearList.length === 0 ? <p className="px-6 pb-5 text-sm text-gray-400">No holidays added for {year} yet.{canManage ? " Add them one by one or paste the list from HR." : ""}</p> : (
            <ul className="divide-y divide-gray-100">
              {yearList.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-4 sm:px-6 py-2.5" data-testid={`holiday-row-${h.id}`}>
                  <span className="w-24 shrink-0 text-sm text-gray-700">{fmt(h.date)} <span className="text-gray-400 text-xs">{h.weekday}</span></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-900 truncate">{h.name}</span>
                    <span className="block text-[11px] text-gray-500 truncate">{h.locations.join(", ")}</span>
                  </span>
                  <Badge variant="outline" className={`${HOLIDAY_STYLE[h.type]?.chip} text-[10px] hidden sm:inline-flex`}>{h.type_label}</Badge>
                  {canManage && <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400" onClick={() => setEdit({ open: true, holiday: h })} aria-label="Edit holiday" data-testid={`holiday-edit-${h.id}`}><Pencil className="h-3.5 w-3.5" /></Button>}
                  {del.canDelete && <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600" onClick={() => del.requestDelete(h)} aria-label="Delete holiday" data-testid={`holiday-delete-${h.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {del.dialog}

      <Dialog open={!!selectedDay} onOpenChange={(o) => !o && setDayOpen(null)}>
        <DialogContent className="max-w-sm" data-testid="cal-day-dialog">
          <DialogHeader><DialogTitle>{selectedDay && fmt(selectedDay.date, { weekday: "long", day: "numeric", month: "long" })}</DialogTitle></DialogHeader>
          {selectedDay && (
            <div className="space-y-3 text-sm">
              {selectedDay.weekly_off && <p className="text-gray-500">Weekly off.</p>}
              {selectedDay.holidays.map((h) => (
                <div key={h.id} className={`rounded-lg border px-3 py-2 ${HOLIDAY_STYLE[h.type]?.chip}`}><div className="font-semibold">{h.name}</div><div className="text-xs opacity-80">{h.type_label} · {h.locations.join(", ")}</div>{h.notes && <div className="text-xs mt-1">{h.notes}</div>}</div>
              ))}
              {selectedDay.away.length > 0 && (
                <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Away</div>
                  <ul className="space-y-1">{selectedDay.away.map((a) => <li key={a.user_id} className="flex justify-between"><span>{a.name}</span><span className="text-gray-500">{AWAY[a.status]}</span></li>)}</ul></div>
              )}
              {!selectedDay.weekly_off && !selectedDay.holidays.length && !selectedDay.away.length && <p className="text-gray-500">A regular working day.</p>}
            </div>
          )}
          {canManage && selectedDay && <DialogFooter><Button variant="outline" onClick={() => { setEdit({ open: true, holiday: null, date: selectedDay.date }); setDayOpen(null); }}><Plus className="h-4 w-4 mr-1.5" /> Add holiday</Button></DialogFooter>}
        </DialogContent>
      </Dialog>
      <HolidayDialog open={edit.open} onOpenChange={(o) => setEdit((x) => ({ ...x, open: o }))} holiday={edit.holiday} meta={meta} onSaved={refresh} defaultDate={edit.date} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} meta={meta} onSaved={refresh} />
    </div>
  );
}
