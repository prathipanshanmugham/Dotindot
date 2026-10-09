import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import api, { apiError } from "@/lib/api";
import ExportMenu from "@/components/ExportMenu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MapPin, LogIn, LogOut, Clock, FileText, Plus, Trash2, CheckCircle2, AlertTriangle, MoreHorizontal, Building2, Home, Car, Coffee, Plane, Users, Navigation, CalendarDays, Sheet, ClipboardCheck, PartyPopper, IndianRupee, LayoutGrid, Settings2 } from "lucide-react";
import HolidayCalendar, { UpcomingHolidays } from "@/pages/daily/HolidayCalendar";
import { MyTimesheet, TimesheetApprovals } from "@/pages/daily/TimesheetTab";

const STATUS_META = {
  office: { label: "In office", short: "Office", icon: Building2, cls: "bg-emerald-50 text-emerald-700 border-emerald-200", cell: "bg-emerald-500", letter: "P" },
  wfh: { label: "Work from home", short: "WFH", icon: Home, cls: "bg-blue-50 text-blue-700 border-blue-200", cell: "bg-blue-500", letter: "W" },
  field: { label: "Field / client site", short: "Field", icon: Car, cls: "bg-violet-50 text-violet-700 border-violet-200", cell: "bg-violet-500", letter: "F" },
  half_day: { label: "Half day", short: "Half day", icon: Coffee, cls: "bg-teal-50 text-teal-700 border-teal-200", cell: "bg-teal-400", letter: "H" },
  leave: { label: "On leave", short: "Leave", icon: Plane, cls: "bg-gray-100 text-gray-600 border-gray-200", cell: "bg-gray-400", letter: "L" },
  absent: { label: "Absent", short: "Absent", icon: AlertTriangle, cls: "bg-red-50 text-red-700 border-red-200", cell: "bg-red-500", letter: "A" },
  late: { label: "Late", short: "Late", cls: "bg-amber-50 text-amber-800 border-amber-200", cell: "bg-amber-400", letter: "P" },
  not_checked_in: { label: "Not checked in", short: "Missing", cls: "bg-red-50 text-red-700 border-red-200", cell: "bg-red-200", letter: "–" },
  pending: { label: "Not in yet", short: "Not in yet", cls: "bg-gray-50 text-gray-500 border-gray-200" },
  off: { label: "Weekly off", short: "Off", cls: "bg-gray-50 text-gray-400 border-gray-200" },
  holiday: { label: "Holiday", short: "Holiday", cls: "bg-rose-50 text-rose-700 border-rose-200", cell: "bg-rose-300", letter: "H" },
  missing: { cell: "bg-red-100", letter: "·" },
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const initials = (n) => (n || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const km = (m) => (m == null ? "" : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
const prettyDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

const getPosition = () => new Promise((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition(
    (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
    () => resolve(null), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
});

export const StatePill = ({ state, record, testid }) => {
  const m = STATUS_META[state] || STATUS_META.pending;
  const text = state === "late" && record?.late_by_min ? `Late ${record.late_by_min}m` : m.short;
  return <Badge variant="outline" className={`${m.cls} text-[11px] font-medium whitespace-nowrap`} data-testid={testid}>{text}</Badge>;
};

const LocationVerdict = ({ r, compact }) => {
  if (!r) return null;
  if (r.status !== "office" && r.status !== "field") return compact ? null : <span className="text-xs text-gray-500">{STATUS_META[r.status]?.label}</span>;
  if (!r.check_in_location) return <span className="inline-flex items-center gap-1 text-xs text-gray-400"><MapPin className="h-3.5 w-3.5" />{compact ? "No GPS" : "Location not shared"}</span>;
  if (r.status === "office" && r.on_site) return <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><MapPin className="h-3.5 w-3.5" />{compact ? `On site · ${km(r.distance_m)}` : `At ${r.nearest_branch_name} · ${km(r.distance_m)} away`}</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-amber-700"><MapPin className="h-3.5 w-3.5" />{compact ? `${km(r.distance_m)} away` : `${km(r.distance_m)} from ${r.nearest_branch_name}`}</span>;
};

// ---------------------------------------------------------------- My day
function MyDay() {
  const [d, setD] = useState(null);
  const [status, setStatus] = useState("office");
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState([]);
  const [reportDate, setReportDate] = useState(null);
  const [form, setForm] = useState({ summary: "", tasks: [], plan_tomorrow: "", blockers: "" });

  const load = useCallback((date) => api.get("/daily/me", { params: date ? { date } : {} }).then((r) => {
    setD(r.data);
    const rep = r.data.record?.report;
    setForm(rep ? { summary: rep.summary || "", tasks: (rep.tasks || []).map((t) => ({ ...t, hours: t.hours ?? "" })), plan_tomorrow: rep.plan_tomorrow || "", blockers: rep.blockers || "" }
      : { summary: "", tasks: [{ text: "", project_id: "", hours: "" }], plan_tomorrow: "", blockers: "" });
  }).catch(() => {}), []);
  useEffect(() => { load(); api.get("/projects").then((r) => setProjects(r.data)).catch(() => {}); }, [load]);
  useEffect(() => { if (reportDate) load(reportDate); }, [reportDate, load]);
  if (!d) return <div className="h-40 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  const isToday = d.date === d.today;
  const rec = d.record;
  const checkedIn = !!rec?.check_in_at || ["leave", "absent"].includes(rec?.status);
  const s = d.settings;

  const checkIn = async () => {
    setBusy(true);
    let pos = null;
    if (["office", "field"].includes(status)) {
      toast.message("Getting your location…");
      pos = await getPosition();
      if (!pos) toast.warning("Couldn't get your location. Checking in without it.");
    }
    try {
      await api.post("/daily/check-in", { status, ...(pos || {}) });
      toast.success(status === "leave" ? "Marked as on leave" : "Checked in");
      load();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const checkOut = async () => {
    setBusy(true);
    const pos = await getPosition();
    try { await api.post("/daily/check-out", { ...(pos || {}) }); toast.success("Checked out — have a good evening"); load(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const saveReport = async (submit) => {
    setBusy(true);
    try {
      await api.put("/daily/me/report", { date: d.date, summary: form.summary, plan_tomorrow: form.plan_tomorrow, blockers: form.blockers, submit,
        tasks: form.tasks.filter((t) => t.text.trim()).map((t) => ({ text: t.text.trim(), project_id: t.project_id || null, hours: t.hours === "" ? null : Number(t.hours) })) });
      toast.success(submit ? "Report submitted" : "Draft saved");
      load(isToday ? undefined : d.date);
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const setTask = (i, k, v) => setForm((f) => { const t = [...f.tasks]; t[i] = { ...t[i], [k]: v }; return { ...f, tasks: t }; });
  const reportDays = [0, 1, 2, 3].map((n) => { const [y, m, dd] = d.today.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd - n)).toISOString().slice(0, 10); });
  const rep = rec?.report;
  const editable = reportDays.includes(d.date);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card className="border-gray-200/80 shadow-sm" data-testid="my-day-card">
          <CardContent className="p-4 sm:p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#F26B21]">Today</div>
                <div className="text-lg font-bold text-gray-900">{prettyDate(d.today)}</div>
                <div className="text-xs text-gray-500">Office hours {s.work_start}–{s.work_end}{d.home_branch ? ` · ${d.home_branch.name}` : ""}</div>
              </div>
              {rec?.status && <StatePill state={rec.late ? "late" : rec.status} record={rec} testid="my-day-state" />}
            </div>

            {isToday && d.holiday && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800 flex items-center gap-2" data-testid="my-day-holiday">
                <PartyPopper className="h-4 w-4 shrink-0" /><span><span className="font-semibold">{d.holiday.name}</span> — it's a holiday. Check in only if you're working today.</span>
              </div>
            )}
            {!isToday ? (
              <Button variant="outline" className="w-full" onClick={() => { setReportDate(null); load(); }}>Back to today</Button>
            ) : !checkedIn ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2" role="radiogroup" aria-label="Where are you working today?">
                  {["office", "wfh", "field", "half_day", "leave"].map((k) => {
                    const M = STATUS_META[k]; const Icon = M.icon;
                    return (
                      <button key={k} type="button" role="radio" aria-checked={status === k} onClick={() => setStatus(k)} data-testid={`checkin-status-${k}`}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium min-h-[48px] ${status === k ? "border-[#F26B21] bg-[#FFF7ED] text-[#F26B21]" : "border-gray-200 text-gray-700 hover:border-orange-200"}`}>
                        <Icon className="h-4 w-4 shrink-0" />{M.label}
                      </button>
                    );
                  })}
                </div>
                <Button className="w-full h-12 text-base bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={busy} onClick={checkIn} data-testid="check-in-btn">
                  {status === "leave" ? <><Plane className="h-5 w-5 mr-2" /> Mark today as leave</> : <><LogIn className="h-5 w-5 mr-2" /> Check in</>}
                </Button>
                {["office", "field"].includes(status) && <p className="text-xs text-gray-500 flex items-start gap-1.5"><Navigation className="h-3.5 w-3.5 mt-0.5 shrink-0" />Your phone's location is recorded once at check-in to confirm you're at {d.home_branch?.name || "your branch"} (within {s.geofence_m} m).</p>}
              </>
            ) : (
              <div className="space-y-3">
                {rec.check_in_at && (
                  <div className="rounded-xl bg-gray-50 p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-sm"><span className="text-gray-500 flex items-center gap-1.5"><LogIn className="h-4 w-4" /> Checked in</span>
                      <span className="font-mono font-semibold text-gray-900" data-testid="my-checkin-time">{rec.check_in_local}{rec.late && <span className="ml-1.5 text-xs text-amber-700 font-sans font-medium">({rec.late_by_min} min late)</span>}</span></div>
                    {rec.check_out_at && <div className="flex items-center justify-between text-sm"><span className="text-gray-500 flex items-center gap-1.5"><LogOut className="h-4 w-4" /> Checked out</span><span className="font-mono font-semibold text-gray-900">{rec.check_out_local} · {rec.hours} h</span></div>}
                    <div className="pt-0.5" data-testid="my-location-verdict"><LocationVerdict r={rec} /></div>
                  </div>
                )}
                {rec.check_in_at && !rec.check_out_at && (
                  <Button variant="outline" className="w-full h-11" disabled={busy} onClick={checkOut} data-testid="check-out-btn"><LogOut className="h-4 w-4 mr-2" /> Check out</Button>
                )}
                {rec.marked_by && <p className="text-xs text-gray-500">Marked as {STATUS_META[rec.status]?.label.toLowerCase()} by {rec.marked_by}{rec.marked_note ? ` — ${rec.marked_note}` : ""}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {d.upcoming_holidays?.length > 0 && (
          <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-4"><UpcomingHolidays items={d.upcoming_holidays.slice(0, 3)} testid="my-day-upcoming-holidays" /></CardContent></Card>
        )}
        <Card className="border-gray-200/80 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700">Last 2 weeks</CardTitle></CardHeader>
          <CardContent className="space-y-1.5" data-testid="my-history">
            {d.history.length === 0 && <p className="text-sm text-gray-400">Nothing yet. Your check-ins and reports show up here.</p>}
            {d.history.map((h) => (
              <button key={h.id} type="button" onClick={() => setReportDate(h.date)} className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-orange-50/50 ${h.date === d.date ? "bg-orange-50" : ""}`}>
                <span className="w-24 text-xs text-gray-600 shrink-0">{prettyDate(h.date)}</span>
                {h.status ? <StatePill state={h.late ? "late" : h.status} record={h} /> : <span className="text-xs text-gray-400">—</span>}
                <span className="ml-auto text-xs text-gray-500 font-mono">{h.check_in_local || ""}{h.check_out_local ? `–${h.check_out_local}` : ""}</span>
                {h.report?.submitted ? <FileText className="h-4 w-4 text-emerald-600 shrink-0" aria-label="Report filed" /> : <FileText className="h-4 w-4 text-gray-200 shrink-0" aria-label="No report" />}
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="lg:col-span-3 border-gray-200/80 shadow-sm" data-testid="daily-report-card">
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold">Daily report</CardTitle>
          <Select value={d.date} onValueChange={(v) => setReportDate(v)}>
            <SelectTrigger className="w-40 h-9" data-testid="report-date-select"><SelectValue /></SelectTrigger>
            <SelectContent>{reportDays.map((x, i) => <SelectItem key={x} value={x}>{i === 0 ? "Today" : i === 1 ? "Yesterday" : prettyDate(x)}</SelectItem>)}{!editable && <SelectItem value={d.date}>{prettyDate(d.date)}</SelectItem>}</SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-4">
          {rep?.submitted && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 flex items-center gap-2" data-testid="report-submitted-banner"><CheckCircle2 className="h-4 w-4" /> Submitted {new Date(rep.submitted_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}. You can still edit and resubmit.</div>}
          {rec?.manager_note && <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900"><span className="font-semibold">{rec.reviewed_by}:</span> {rec.manager_note}</div>}
          <div className="space-y-1"><Label>What did you work on?</Label>
            <Textarea rows={3} value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} placeholder="Short summary of your day" data-testid="report-summary" />
          </div>
          <div className="space-y-2">
            <Label>Tasks</Label>
            {form.tasks.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_72px_36px] sm:grid-cols-[1fr_180px_72px_36px] gap-2 items-center">
                <Input value={t.text} onChange={(e) => setTask(i, "text", e.target.value)} placeholder="Task" data-testid={`report-task-${i}`} />
                <Select value={t.project_id || "none"} onValueChange={(v) => setTask(i, "project_id", v === "none" ? "" : v)}>
                  <SelectTrigger className="hidden sm:flex" aria-label="Project"><SelectValue placeholder="Project" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">No project</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" min="0" step="0.5" value={t.hours} onChange={(e) => setTask(i, "hours", e.target.value)} placeholder="Hrs" aria-label="Hours" />
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-red-600" onClick={() => setForm((f) => ({ ...f, tasks: f.tasks.filter((_, j) => j !== i) }))} aria-label="Remove task"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setForm((f) => ({ ...f, tasks: [...f.tasks, { text: "", project_id: "", hours: "" }] }))} data-testid="report-add-task"><Plus className="h-3.5 w-3.5 mr-1" /> Add task</Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Plan for tomorrow</Label><Textarea rows={2} value={form.plan_tomorrow} onChange={(e) => setForm((f) => ({ ...f, plan_tomorrow: e.target.value }))} data-testid="report-plan" /></div>
            <div className="space-y-1"><Label>Blockers / help needed</Label><Textarea rows={2} value={form.blockers} onChange={(e) => setForm((f) => ({ ...f, blockers: e.target.value }))} placeholder="Leave empty if none" /></div>
          </div>
          {!editable && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">Reports older than 3 days are read-only.</p>}
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button variant="outline" disabled={busy || !editable} onClick={() => saveReport(false)} data-testid="report-save-draft">Save draft</Button>
            <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={busy || !editable} onClick={() => saveReport(true)} data-testid="report-submit">{rep?.submitted ? "Resubmit report" : "Submit report"}</Button>
          </div>
          <p className="text-xs text-gray-400">Reports are due by {s.report_due}. You can file missed reports for up to 3 days back.</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- report dialog (manager)
function ReportDialog({ rid, onClose, onSaved }) {
  const [r, setR] = useState(null);
  const [note, setNote] = useState("");
  const [projects, setProjects] = useState({});
  useEffect(() => {
    if (!rid) return;
    setR(null);
    api.get(`/daily/records/${rid}`).then((x) => { setR(x.data); setNote(x.data.manager_note || ""); }).catch((e) => toast.error(apiError(e)));
    api.get("/projects").then((x) => setProjects(Object.fromEntries(x.data.map((p) => [p.id, p.name])))).catch(() => {});
  }, [rid]);
  const save = async () => {
    try { await api.post(`/daily/records/${rid}/review`, { note }); toast.success("Note saved"); onSaved && onSaved(); onClose(); }
    catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Dialog open={!!rid} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto" data-testid="daily-report-dialog">
        <DialogHeader><DialogTitle>{r ? `${r.user_name} · ${prettyDate(r.date)}` : "Daily report"}</DialogTitle></DialogHeader>
        {!r ? <p className="text-sm text-gray-400">Loading…</p> : (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {r.status && <StatePill state={r.late ? "late" : r.status} record={r} />}
              {r.check_in_local && <span className="text-gray-600 font-mono text-xs">{r.check_in_local}{r.check_out_local ? `–${r.check_out_local}` : ""}{r.hours ? ` · ${r.hours} h` : ""}</span>}
              <LocationVerdict r={r} compact />
            </div>
            {!r.report?.submitted && <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 text-xs">No report submitted{r.report ? " (draft saved)" : ""}.</p>}
            {r.report?.summary && <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Summary</div><p className="text-gray-800 whitespace-pre-line">{r.report.summary}</p></div>}
            {r.report?.tasks?.length > 0 && (
              <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Tasks</div>
                <ul className="space-y-1">{r.report.tasks.map((t, i) => <li key={i} className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" /><span className="flex-1">{t.text}{t.project_id && projects[t.project_id] ? <span className="text-gray-400"> · {projects[t.project_id]}</span> : ""}</span>{t.hours ? <span className="text-xs text-gray-500 font-mono">{t.hours} h</span> : null}</li>)}</ul>
              </div>
            )}
            {r.report?.plan_tomorrow && <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Tomorrow</div><p className="text-gray-700">{r.report.plan_tomorrow}</p></div>}
            {r.report?.blockers && <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-red-800"><span className="font-semibold">Blocker:</span> {r.report.blockers}</div>}
            <div className="space-y-1 pt-1"><Label>Your note to {r.user_name?.split(" ")[0]}</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="review-note" /></div>
          </div>
        )}
        <DialogFooter className="gap-2"><Button variant="outline" onClick={onClose}>Close</Button><Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={!r || !note.trim()} onClick={save} data-testid="review-save">Save note</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Team today
function TeamToday({ branchOptions }) {
  const [date, setDate] = useState("");
  const [branch, setBranch] = useState("all");
  const [d, setD] = useState(null);
  const [openRid, setOpenRid] = useState(null);
  const load = useCallback(() => {
    const params = {};
    if (date) params.date = date;
    if (branch !== "all") params.branch = branch;
    api.get("/daily/team", { params }).then((r) => { setD(r.data); if (!date) setDate(r.data.date); }).catch((e) => toast.error(apiError(e)));
  }, [date, branch]);
  useEffect(() => { load(); }, [load]);
  const mark = async (user_id, status) => {
    try { await api.put("/daily/mark", { user_id, date: d.date, status }); toast.success(`Marked ${STATUS_META[status].label.toLowerCase()}`); load(); }
    catch (e) { toast.error(apiError(e)); }
  };
  if (!d) return <div className="h-40 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;
  const sm = d.summary;
  const tiles = [
    ["Present", `${sm.present}/${sm.people}`, `${sm.rate}%`, "text-emerald-700"], ["Late", sm.late, null, sm.late ? "text-amber-700" : ""],
    ["WFH", sm.wfh, null, ""], ["On leave", sm.leave, null, ""], ["Not checked in", sm.not_checked_in, null, sm.not_checked_in ? "text-red-600" : ""],
    ["Reports filed", `${sm.reports_submitted}/${sm.present}`, null, ""],
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <Input type="date" className="sm:w-44" value={date} max={d.today} onChange={(e) => setDate(e.target.value)} data-testid="team-date" />
        <Select value={branch} onValueChange={setBranch}>
          <SelectTrigger className="sm:w-52" data-testid="team-branch"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All locations</SelectItem>{branchOptions.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
        </Select>
        {d.weekly_off && <span className="text-xs text-gray-500">Weekly off day</span>}
        {d.holidays?.length > 0 && <span className="text-xs text-rose-700 inline-flex items-center gap-1"><PartyPopper className="h-3.5 w-3.5" />{d.holidays.map((h) => h.name).join(", ")}</span>}
        {sm.off_site > 0 && <span className="text-xs text-amber-700 sm:ml-auto flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{sm.off_site} checked in "office" away from their branch</span>}
      </div>
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3" data-testid="team-tiles">
        {tiles.map(([l, v, sub, tone]) => (
          <Card key={l} className="border-gray-200/80"><CardContent className="p-3">
            <div className={`text-lg font-bold font-mono ${tone || "text-gray-900"}`}>{v}</div>
            <div className="text-[11px] text-gray-500">{l}{sub ? ` · ${sub}` : ""}</div>
          </CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        {d.branches.map((g) => (
          <Card key={g.branch_id || "none"} className="border-gray-200/80 shadow-sm" data-testid={`team-branch-${g.branch_id || "none"}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2"><MapPin className="h-4 w-4 text-[#F26B21]" />{g.name}{g.city && <span className="text-xs font-normal text-gray-400">{g.city}</span>}</CardTitle>
                <span className="text-xs text-gray-500"><span className="font-semibold text-gray-800">{g.present}</span>/{g.people.length} present</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-1.5"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${g.rate}%` }} /></div>
            </CardHeader>
            <CardContent className="divide-y divide-gray-100 p-0 pb-1">
              {g.people.map(({ user: u, state, record: r }) => (
                <div key={u.id} className="flex items-center gap-3 px-4 sm:px-6 py-2.5" data-testid={`team-row-${u.id}`}>
                  <span className="h-8 w-8 rounded-full bg-gradient-to-br from-[#F26B21] to-[#FBA834] text-white text-[10px] font-bold flex items-center justify-center shrink-0">{initials(u.name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 truncate">{u.name}</div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                      {r?.check_in_local && <span className="font-mono">{r.check_in_local}{r.check_out_local ? `–${r.check_out_local}` : ""}</span>}
                      <LocationVerdict r={r} compact />
                    </div>
                  </div>
                  <StatePill state={state} record={r} testid={`team-state-${u.id}`} />
                  <Button variant="ghost" size="icon" className={`h-8 w-8 shrink-0 ${r?.report?.submitted ? "text-emerald-600" : "text-gray-300"}`} disabled={!r}
                    onClick={() => setOpenRid(r.id)} aria-label={r?.report?.submitted ? "Read report" : "No report"} title={r?.report?.submitted ? "Read report" : "No report yet"} data-testid={`team-report-${u.id}`}>
                    <FileText className="h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-gray-400" aria-label="Mark attendance" data-testid={`team-mark-${u.id}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel className="text-xs">Mark {u.name.split(" ")[0]} as</DropdownMenuLabel>
                      {["office", "wfh", "field", "half_day", "leave", "absent"].map((k) => <DropdownMenuItem key={k} onClick={() => mark(u.id, k)} data-testid={`mark-${u.id}-${k}`}>{STATUS_META[k].label}</DropdownMenuItem>)}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      <ReportDialog rid={openRid} onClose={() => setOpenRid(null)} onSaved={load} />
    </div>
  );
}

// ---------------------------------------------------------------- Attendance month
function AttendanceMonth({ branchOptions }) {
  const [month, setMonth] = useState("");
  const [branch, setBranch] = useState("all");
  const [d, setD] = useState(null);
  useEffect(() => {
    const params = {};
    if (month) params.month = month;
    if (branch !== "all") params.branch = branch;
    api.get("/daily/attendance", { params }).then((r) => { setD(r.data); if (!month) setMonth(r.data.month); }).catch((e) => toast.error(apiError(e)));
  }, [month, branch]);
  if (!d) return <div className="h-40 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;
  const legend = ["office", "wfh", "field", "half_day", "late", "leave", "absent", "holiday", "missing"];
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <Input type="month" className="sm:w-44" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="attendance-month" />
        <Select value={branch} onValueChange={setBranch}>
          <SelectTrigger className="sm:w-52" data-testid="attendance-branch"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All locations</SelectItem>{branchOptions.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
        </Select>
        <div className="sm:ml-auto"><ExportMenu dataset="attendance" params={{ month: d.month, ...(branch !== "all" ? { branch } : {}) }} /></div>
      </div>
      <div className="flex flex-wrap gap-2" data-testid="attendance-branch-rates">
        <span className="text-xs text-gray-500 self-center">{d.working_days} working days so far ·</span>
        {d.by_branch.map((b) => <span key={b.name} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs"><span className="text-gray-600">{b.name}</span> <span className="font-semibold text-gray-900">{b.rate}%</span></span>)}
      </div>
      <Card className="border-gray-200/80 overflow-hidden">
        <div className="overflow-x-auto" data-testid="attendance-grid">
          <table className="text-xs border-collapse min-w-full">
            <thead>
              <tr className="bg-gray-50/70 text-gray-500">
                <th className="sticky left-0 z-10 bg-gray-50 text-left font-semibold px-3 py-2 min-w-[150px]">Person</th>
                {d.days.map((x) => { const dt = new Date(x + "T00:00:00"); return <th key={x} className="px-0.5 py-2 font-medium w-7 text-center"><div>{dt.getDate()}</div><div className="text-[9px] text-gray-400">{WEEKDAYS[(dt.getDay() + 6) % 7][0]}</div></th>; })}
                <th className="px-2 py-2 font-semibold text-right">Present</th><th className="px-2 py-2 font-semibold text-right">Late</th><th className="px-2 py-2 font-semibold text-right">Leave</th>
                <th className="px-2 py-2 font-semibold text-right">Rate</th><th className="px-2 py-2 font-semibold text-right whitespace-nowrap">Avg in</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.user.id} className="border-t border-gray-100" data-testid={`attendance-row-${r.user.id}`}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5"><div className="font-medium text-gray-900 truncate max-w-[160px]">{r.user.name}</div><div className="text-[10px] text-gray-400">{r.branch}</div></td>
                  {r.cells.map((c, i) => {
                    const m = c && STATUS_META[c];
                    return <td key={i} className="px-0.5 py-1 text-center">{c === "off" ? <span className="block h-5 w-5 mx-auto rounded bg-gray-50" /> : c ? <span title={`${d.days[i]} · ${STATUS_META[c]?.label || "No check-in"}`} className={`block h-5 w-5 mx-auto rounded ${m?.cell || "bg-gray-200"} text-[9px] leading-5 font-bold text-white`}>{m?.letter}</span> : null}</td>;
                  })}
                  <td className="px-2 text-right font-mono">{r.totals.present}</td><td className="px-2 text-right font-mono">{r.totals.late || ""}</td><td className="px-2 text-right font-mono">{r.totals.leave || ""}</td>
                  <td className={`px-2 text-right font-mono font-semibold ${r.totals.rate != null && r.totals.rate < 80 ? "text-red-600" : "text-gray-900"}`}>{r.totals.rate != null ? `${r.totals.rate}%` : "—"}</td>
                  <td className="px-2 text-right font-mono">{r.totals.avg_check_in || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
        {legend.map((k) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-3 w-3 rounded ${STATUS_META[k].cell}`} />{k === "missing" ? "No check-in" : STATUS_META[k].label}</span>)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Settings
function AttendanceSettings() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/daily/settings").then((r) => setS(r.data)).catch(() => {}); }, []);
  if (!s) return null;
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try { const { data } = await api.put("/daily/settings", { work_start: s.work_start, work_end: s.work_end, late_grace_min: Number(s.late_grace_min) || 0,
      geofence_m: Number(s.geofence_m) || 300, report_due: s.report_due, weekly_off: s.weekly_off, require_location_for_office: s.require_location_for_office,
      std_hours_per_day: Number(s.std_hours_per_day) || 8, timesheet_approval: !!s.timesheet_approval });
      setS(data); toast.success("Attendance settings saved"); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Card className="border-gray-200/80 max-w-2xl" data-testid="attendance-settings">
      <CardContent className="p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="space-y-1"><Label>Office starts</Label><Input type="time" value={s.work_start} onChange={(e) => set("work_start", e.target.value)} data-testid="set-work-start" /></div>
          <div className="space-y-1"><Label>Office ends</Label><Input type="time" value={s.work_end} onChange={(e) => set("work_end", e.target.value)} /></div>
          <div className="space-y-1"><Label>Grace (minutes)</Label><Input type="number" min="0" value={s.late_grace_min} onChange={(e) => set("late_grace_min", e.target.value)} /></div>
          <div className="space-y-1"><Label>Report due by</Label><Input type="time" value={s.report_due} onChange={(e) => set("report_due", e.target.value)} /></div>
          <div className="space-y-1"><Label>On-site radius (m)</Label><Input type="number" min="20" value={s.geofence_m} onChange={(e) => set("geofence_m", e.target.value)} data-testid="set-geofence" /></div>
          <div className="space-y-1"><Label>Hours per working day</Label><Input type="number" min="1" max="16" step="0.5" value={s.std_hours_per_day ?? 8} onChange={(e) => set("std_hours_per_day", e.target.value)} data-testid="set-std-hours" /></div>
        </div>
        <div className="space-y-1.5"><Label>Weekly off</Label>
          <div className="flex flex-wrap gap-1.5">{WEEKDAYS.map((w, i) => (
            <button key={w} type="button" onClick={() => set("weekly_off", s.weekly_off.includes(i) ? s.weekly_off.filter((x) => x !== i) : [...s.weekly_off, i])}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold h-8 ${s.weekly_off.includes(i) ? "border-[#F26B21] bg-[#FFF7ED] text-[#F26B21]" : "border-gray-200 text-gray-600"}`}>{w}</button>
          ))}</div>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
          <div><div className="text-sm font-medium text-gray-800">Require location for "In office"</div><div className="text-xs text-gray-500">People can't check in at the office with location turned off.</div></div>
          <Switch checked={!!s.require_location_for_office} onCheckedChange={(v) => set("require_location_for_office", v)} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
          <div><div className="text-sm font-medium text-gray-800">Timesheets need manager approval</div><div className="text-xs text-gray-500">Turn off to approve weekly timesheets automatically when they're submitted.</div></div>
          <Switch checked={s.timesheet_approval !== false} onCheckedChange={(v) => set("timesheet_approval", v)} data-testid="set-ts-approval" />
        </label>
        <p className="text-xs text-gray-500">Branch locations come from <Link to="/locations" className="text-[#F26B21] font-medium">Locations</Link>. Drop each branch's pin precisely so on-site checks are accurate.</p>
        <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={busy} onClick={save} data-testid="settings-save">Save settings</Button>
      </CardContent>
    </Card>
  );
}

function CostRates() {
  const [d, setD] = useState(null);
  const [rates, setRates] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/timesheets/cost-rates").then((r) => { setD(r.data); setRates(r.data.rates || {}); }).catch(() => {}); }, []);
  if (!d) return null;
  const save = async () => {
    setBusy(true);
    try {
      const body = { rates: Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, Number(v) || 0])), per_user: d.per_user || {} };
      const { data } = await api.put("/timesheets/cost-rates", body);
      setRates(data.rates); toast.success("Cost rates saved");
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Card className="border-gray-200/80 max-w-2xl" data-testid="cost-rates">
      <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><IndianRupee className="h-4 w-4 text-[#F26B21]" />Team cost per hour</CardTitle>
        <p className="text-xs text-gray-500">Used by the Client Profitability and Utilisation reports to turn timesheet hours into cost. Only admins and finance can see these.</p></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {d.roles.map((r) => (
            <div key={r.value} className="flex items-center gap-2">
              <Label className="flex-1 text-sm font-normal text-gray-700">{r.label}</Label>
              <div className="relative w-32"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
                <Input type="number" min="0" disabled={!d.can_edit} value={rates[r.value] ?? ""} onChange={(e) => setRates((x) => ({ ...x, [r.value]: e.target.value }))} className="pl-6 h-9" placeholder="0" data-testid={`rate-${r.value}`} /></div>
              <span className="text-xs text-gray-400">/h</span>
            </div>
          ))}
        </div>
        {d.can_edit && <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={busy} onClick={save} data-testid="cost-rates-save">Save cost rates</Button>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- page
export default function DailyPage() {
  const { user, hasPerm } = useAuth();
  const [params, setParams] = useSearchParams();
  const isTeam = hasPerm("daily_reports.team");
  const isAdmin = ["super_admin", "admin"].includes(user?.role);
  const [branchOptions, setBranchOptions] = useState([]);
  useEffect(() => { if (isTeam) api.get("/locations/branch-options").then((r) => setBranchOptions(r.data)).catch(() => {}); }, [isTeam]);
  const tabs = useMemo(() => [["me", "My day"], ["timesheet", "Timesheet"], ["calendar", "Holidays"],
    ...(isTeam ? [["team", "Team today"], ["attendance", "Attendance"], ["approvals", "Approvals"]] : []), ...(isAdmin ? [["settings", "Settings"]] : [])], [isTeam, isAdmin]);
  const TAB_ICON = { me: Clock, timesheet: Sheet, calendar: CalendarDays, team: Users, attendance: LayoutGrid, approvals: ClipboardCheck, settings: Settings2 };
  const requested = params.get("tab") || (user?.role === "super_admin" && isTeam ? "team" : "me");
  const tab = tabs.some(([k]) => k === requested) ? requested : "me";
  return (
    <div className="space-y-5 max-w-7xl" data-testid="daily-page">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Daily Reporting</h1>
        <p className="text-sm text-gray-500 mt-1">{isTeam ? "Check-ins, timesheets, holidays and attendance by location." : "Check in, fill your weekly timesheet and see upcoming holidays."}</p>
      </div>
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList className={`bg-white border border-gray-200 h-auto flex-wrap justify-start ${tabs.length < 2 ? "hidden" : ""}`}>
          {tabs.map(([k, l]) => { const I = TAB_ICON[k]; return <TabsTrigger key={k} value={k} className="data-[state=active]:bg-[#FFF7ED] data-[state=active]:text-[#F26B21]" data-testid={`daily-tab-${k}`}>{I && <I className="h-3.5 w-3.5 mr-1.5" />}{l}</TabsTrigger>; })}
        </TabsList>
        <TabsContent value="me" className="pt-2"><MyDay /></TabsContent>
        <TabsContent value="timesheet" className="pt-2">{tab === "timesheet" && <MyTimesheet />}</TabsContent>
        <TabsContent value="calendar" className="pt-2">{tab === "calendar" && <HolidayCalendar />}</TabsContent>
        {isTeam && <TabsContent value="approvals" className="pt-2">{tab === "approvals" && <TimesheetApprovals branchOptions={branchOptions} />}</TabsContent>}
        {isTeam && <TabsContent value="team" className="pt-2"><TeamToday branchOptions={branchOptions} /></TabsContent>}
        {isTeam && <TabsContent value="attendance" className="pt-2"><AttendanceMonth branchOptions={branchOptions} /></TabsContent>}
        {isAdmin && <TabsContent value="settings" className="pt-2 space-y-4"><AttendanceSettings /><CostRates /></TabsContent>}
      </Tabs>
    </div>
  );
}
