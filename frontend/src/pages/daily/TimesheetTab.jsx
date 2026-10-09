import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import ExportMenu from "@/components/ExportMenu";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Plus, Trash2, Navigation, Send, Save, CheckCircle2, AlertTriangle, Lock, Clock, MapPin, Eye } from "lucide-react";

export const TS_STATUS = {
  not_started: ["Not started", "bg-gray-100 text-gray-500 border-gray-200"],
  draft: ["Draft", "bg-amber-50 text-amber-800 border-amber-200"],
  submitted: ["Waiting for approval", "bg-blue-50 text-blue-700 border-blue-200"],
  approved: ["Approved", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  rejected: ["Sent back", "bg-red-50 text-red-700 border-red-200"],
};
const DAY_STATUS = { office: "In office", wfh: "WFH", field: "Field", half_day: "Half day", leave: "Leave", absent: "Absent" };
const PRESENT = ["office", "wfh", "field", "half_day"];
const hm = (s) => { if (!s) return null; const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const dayHours = (d) => (d && d.start && d.end ? Math.max(0, (hm(d.end) - hm(d.start) - (Number(d.break_min) || 0)) / 60) : 0);
const r2 = (n) => Math.round(n * 100) / 100;
const dLabel = (iso, o = { weekday: "short", day: "numeric" }) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", o);
const weekLabel = (dates) => `${dLabel(dates[0], { day: "numeric", month: "short" })} – ${dLabel(dates[6], { day: "numeric", month: "short", year: "numeric" })}`;
export const TsPill = ({ status, testid }) => { const [l, c] = TS_STATUS[status] || TS_STATUS.draft; return <Badge variant="outline" className={`${c} text-[11px] whitespace-nowrap`} data-testid={testid}>{l}</Badge>; };
const newRow = () => ({ id: `new-${Math.random().toString(36).slice(2, 9)}`, project_id: "", task: "", billable: true, hours: {} });

/** The weekly grid — editable for the owner, read-only for reviewers. */
export function TimesheetGrid({ data, sheet, setSheet, editable, projects }) {
  const { dates, day_info: info, today } = data;
  const [pickedDay, setPhoneDay] = useState(null);
  // the picked day may belong to a week that's no longer shown
  const phoneDay = pickedDay && dates.includes(pickedDay) ? pickedDay : dates.includes(today) ? today : dates[0];
  const days = sheet.days || {};
  const rows = sheet.rows || [];
  const projName = (id) => projects[id]?.name || "Project";
  const setDay = (d, k, v) => setSheet((s) => ({ ...s, days: { ...s.days, [d]: { ...(s.days?.[d] || { break_min: 0 }), [k]: v } } }));
  const setRow = (id, k, v) => setSheet((s) => ({ ...s, rows: s.rows.map((r) => (r.id === id ? { ...r, [k]: v } : r)) }));
  const setHours = (id, d, v) => setSheet((s) => ({ ...s, rows: s.rows.map((r) => (r.id === id ? { ...r, hours: { ...r.hours, [d]: v } } : r)) }));
  const removeRow = (id) => setSheet((s) => ({ ...s, rows: s.rows.filter((r) => r.id !== id) }));
  const addRow = () => setSheet((s) => ({ ...s, rows: [...(s.rows || []), newRow()] }));
  const perDay = (d) => r2(rows.reduce((t, r) => t + (Number(r.hours?.[d]) || 0), 0));
  const rowTotal = (r) => r2(Object.values(r.hours || {}).reduce((t, h) => t + (Number(h) || 0), 0));
  const projectOptions = Object.values(projects).filter((p) => p.status !== "completed" || rows.some((r) => r.project_id === p.id));
  const statusOptions = (d) => Object.entries(DAY_STATUS).filter(([k]) => d <= today || ["leave", "absent"].includes(k));
  const over = (d) => perDay(d) > dayHours(days[d]) + 0.25 && dayHours(days[d]) > 0;
  const head = (d) => {
    const i = info[d];
    return (
      <>
        <div className={`font-semibold ${d === today ? "text-[#F26B21]" : "text-gray-700"}`}>{dLabel(d)}</div>
        {i.holiday ? <div className="text-[10px] font-medium text-rose-600 truncate" title={i.holiday.name}>{i.holiday.name}</div>
          : i.weekly_off ? <div className="text-[10px] text-gray-400">Weekly off</div>
            : i.optional_holiday ? <div className="text-[10px] text-sky-600 truncate" title={i.optional_holiday}>Optional</div> : <div className="text-[10px] text-transparent">.</div>}
      </>
    );
  };
  const timeInput = (d, k) => (
    <Input type="time" value={days[d]?.[k] || ""} disabled={!editable || !PRESENT.includes(days[d]?.status)} onChange={(e) => setDay(d, k, e.target.value)}
      className="h-8 px-1.5 text-xs md:text-xs" aria-label={`${k === "start" ? "In" : "Out"} ${d}`} data-testid={`ts-${k}-${d}`} />
  );
  const statusSelect = (d, cls = "") => (
    <select value={days[d]?.status || ""} disabled={!editable} onChange={(e) => setDay(d, "status", e.target.value || null)}
      className={`h-8 w-full rounded-md border border-gray-200 bg-white px-1 text-xs disabled:bg-gray-50 disabled:text-gray-600 ${cls}`} aria-label={`Status ${d}`} data-testid={`ts-status-${d}`}>
      <option value="">—</option>
      {statusOptions(d).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
  const rowLabel = (r) => (
    <div className="space-y-1">
      {editable ? (
        <>
          <select value={r.project_id || ""} onChange={(e) => { setRow(r.id, "project_id", e.target.value || null); if (!e.target.value) setRow(r.id, "billable", false); }}
            className="h-8 w-full rounded-md border border-gray-200 bg-white px-1.5 text-xs" aria-label="Project" data-testid={`ts-project-${r.id}`}>
            <option value="">Internal / no project</option>
            {projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}{p.client_name ? ` · ${p.client_name}` : ""}</option>)}
          </select>
          <div className="flex items-center gap-1.5">
            <Input value={r.task || ""} onChange={(e) => setRow(r.id, "task", e.target.value)} placeholder="Task (optional)" className="h-7 px-2 text-xs md:text-xs" data-testid={`ts-task-${r.id}`} />
            <label className="flex items-center gap-1 text-[11px] text-gray-500 whitespace-nowrap cursor-pointer">
              <input type="checkbox" checked={!!r.billable} onChange={(e) => setRow(r.id, "billable", e.target.checked)} className="h-3.5 w-3.5 accent-[#F26B21]" /> Billable
            </label>
          </div>
        </>
      ) : (
        <div><div className="text-sm font-medium text-gray-900 truncate">{r.project_id ? projName(r.project_id) : "Internal"}</div>
          <div className="text-[11px] text-gray-500 truncate">{r.task || "—"}{r.billable ? " · billable" : ""}</div></div>
      )}
    </div>
  );

  return (
    <>
      {/* tablet / desktop grid */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 bg-white" data-testid="ts-grid">
        <table className="w-full min-w-[920px] text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50/80 text-xs">
              <th className="sticky left-0 z-10 bg-gray-50 text-left font-semibold text-gray-500 px-3 py-2 w-[280px]">Week of {dLabel(dates[0], { day: "numeric", month: "short" })}</th>
              {dates.map((d) => <th key={d} className={`px-1.5 py-2 text-center w-[88px] ${info[d].weekly_off || info[d].holiday ? "bg-gray-100/60" : ""}`}>{head(d)}</th>)}
              <th className="px-2 py-2 text-right font-semibold text-gray-500 w-16">Total</th>
              {editable && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={10} className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#F26B21]">Attendance</td></tr>
            <tr>
              <td className="sticky left-0 z-10 bg-white px-3 py-1 text-xs text-gray-600">Status</td>
              {dates.map((d) => <td key={d} className="px-1 py-1">{statusSelect(d)}{days[d]?.from_checkin && <div className="mt-0.5 flex items-center justify-center gap-0.5 text-[9px] text-emerald-600" title="Pre-filled from your check-in"><Navigation className="h-2.5 w-2.5" />check-in</div>}</td>)}
              <td />{editable && <td />}
            </tr>
            <tr><td className="sticky left-0 z-10 bg-white px-3 py-1 text-xs text-gray-600">In</td>{dates.map((d) => <td key={d} className="px-1 py-1">{timeInput(d, "start")}</td>)}<td />{editable && <td />}</tr>
            <tr><td className="sticky left-0 z-10 bg-white px-3 py-1 text-xs text-gray-600">Out</td>{dates.map((d) => <td key={d} className="px-1 py-1">{timeInput(d, "end")}</td>)}<td />{editable && <td />}</tr>
            <tr>
              <td className="sticky left-0 z-10 bg-white px-3 py-1 text-xs text-gray-600">Break (min)</td>
              {dates.map((d) => <td key={d} className="px-1 py-1"><Input type="number" min="0" step="15" value={days[d]?.break_min ?? ""} disabled={!editable || !PRESENT.includes(days[d]?.status)}
                onChange={(e) => setDay(d, "break_min", e.target.value)} className="h-8 px-1.5 text-xs md:text-xs" aria-label={`Break ${d}`} /></td>)}
              <td />{editable && <td />}
            </tr>
            <tr className="border-b border-gray-100">
              <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700">Time at work</td>
              {dates.map((d) => <td key={d} className="px-1 py-1.5 text-center font-mono text-xs text-gray-700">{dayHours(days[d]) ? `${r2(dayHours(days[d]))} h` : ""}</td>)}
              <td className="px-2 text-right font-mono text-xs font-semibold">{r2(dates.reduce((t, d) => t + dayHours(days[d]), 0))}</td>{editable && <td />}
            </tr>
            <tr><td colSpan={10} className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#F26B21]">Work — hours by project</td></tr>
            {rows.length === 0 && <tr><td colSpan={10} className="px-3 py-3 text-xs text-gray-400">No work rows yet.{editable ? " Add one for each project you worked on." : ""}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-50 align-top" data-testid={`ts-row-${r.id}`}>
                <td className="sticky left-0 z-10 bg-white px-3 py-1.5">{rowLabel(r)}</td>
                {dates.map((d) => (
                  <td key={d} className="px-1 py-1.5">
                    {editable ? <Input type="number" min="0" max="24" step="0.5" value={r.hours?.[d] ?? ""} disabled={d > today} onChange={(e) => setHours(r.id, d, e.target.value)}
                      className="h-8 px-1.5 text-center text-xs md:text-xs" aria-label={`Hours ${d}`} data-testid={`ts-hours-${r.id}-${d}`} />
                      : <div className="h-8 flex items-center justify-center font-mono text-xs text-gray-700">{r.hours?.[d] || ""}</div>}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-mono text-xs font-semibold text-gray-800">{rowTotal(r) || ""}</td>
                {editable && <td className="py-1.5"><Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600" onClick={() => removeRow(r.id)} aria-label="Remove row"><Trash2 className="h-3.5 w-3.5" /></Button></td>}
              </tr>
            ))}
            <tr className="border-t border-gray-200 bg-gray-50/60">
              <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2">
                {editable ? <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addRow} data-testid="ts-add-row"><Plus className="h-3.5 w-3.5 mr-1" /> Add row</Button>
                  : <span className="text-xs font-semibold text-gray-700">Logged</span>}
              </td>
              {dates.map((d) => <td key={d} className={`px-1 py-2 text-center font-mono text-xs font-semibold ${over(d) ? "text-amber-700" : "text-gray-800"}`} title={over(d) ? "More than your time at work" : ""}>{perDay(d) || ""}</td>)}
              <td className="px-2 py-2 text-right font-mono text-sm font-bold text-gray-900" data-testid="ts-total">{r2(dates.reduce((t, d) => t + perDay(d), 0))}</td>
              {editable && <td />}
            </tr>
          </tbody>
        </table>
      </div>

      {/* phone: one day at a time */}
      <div className="md:hidden space-y-3" data-testid="ts-phone">
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {dates.map((d) => (
            <button key={d} type="button" onClick={() => setPhoneDay(d)} data-testid={`ts-day-${d}`}
              className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-center min-w-[58px] ${phoneDay === d ? "border-[#F26B21] bg-[#FFF7ED]" : "border-gray-200 bg-white"}`}>
              <div className={`text-[11px] font-semibold ${phoneDay === d ? "text-[#F26B21]" : "text-gray-600"}`}>{dLabel(d)}</div>
              <div className="text-[10px] text-gray-500">{info[d].holiday ? "Holiday" : info[d].weekly_off ? "Off" : days[d]?.status ? DAY_STATUS[days[d].status] : "—"}</div>
              <div className="text-[10px] font-mono text-gray-700">{perDay(d) ? `${perDay(d)} h` : " "}</div>
            </button>
          ))}
        </div>
        <Card className="border-gray-200/80"><CardContent className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-gray-900">{dLabel(phoneDay, { weekday: "long", day: "numeric", month: "short" })}</div>
            {info[phoneDay].holiday && <span className="text-xs text-rose-600">{info[phoneDay].holiday.name}</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 space-y-1"><Label className="text-xs">Status</Label>{statusSelect(phoneDay, "h-10 text-sm")}</div>
            <div className="space-y-1"><Label className="text-xs">In</Label>{timeInput(phoneDay, "start")}</div>
            <div className="space-y-1"><Label className="text-xs">Out</Label>{timeInput(phoneDay, "end")}</div>
            <div className="space-y-1"><Label className="text-xs">Break (min)</Label><Input type="number" min="0" step="15" value={days[phoneDay]?.break_min ?? ""} disabled={!editable || !PRESENT.includes(days[phoneDay]?.status)} onChange={(e) => setDay(phoneDay, "break_min", e.target.value)} className="h-8 text-xs" /></div>
            <div className="space-y-1"><Label className="text-xs">Time at work</Label><div className="h-8 flex items-center font-mono text-sm">{r2(dayHours(days[phoneDay]))} h</div></div>
          </div>
          <div className="pt-1 border-t border-gray-100 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#F26B21]">Work</div>
            {rows.map((r) => (
              <div key={r.id} className="rounded-lg border border-gray-200 p-2 space-y-1.5">
                {rowLabel(r)}
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-gray-500">Hours</Label>
                  {editable ? <Input type="number" min="0" max="24" step="0.5" value={r.hours?.[phoneDay] ?? ""} disabled={phoneDay > today} onChange={(e) => setHours(r.id, phoneDay, e.target.value)} className="h-8 w-20 text-center text-sm" />
                    : <span className="font-mono text-sm">{r.hours?.[phoneDay] || 0}</span>}
                  <span className="text-[11px] text-gray-400 ml-auto">week {rowTotal(r)} h</span>
                  {editable && <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400" onClick={() => removeRow(r.id)} aria-label="Remove row"><Trash2 className="h-3.5 w-3.5" /></Button>}
                </div>
              </div>
            ))}
            {editable && <Button variant="outline" size="sm" className="w-full" onClick={addRow}><Plus className="h-3.5 w-3.5 mr-1" /> Add row</Button>}
            <div className={`text-right text-sm font-semibold ${over(phoneDay) ? "text-amber-700" : "text-gray-800"}`}>Logged {perDay(phoneDay)} h</div>
          </div>
        </CardContent></Card>
      </div>
    </>
  );
}

const cleanSheet = (s) => ({
  week_start: s.week_start,
  days: Object.fromEntries(Object.entries(s.days || {}).filter(([, v]) => v && v.status).map(([d, v]) => [d, {
    status: v.status, start: v.start || null, end: v.end || null, break_min: Number(v.break_min) || 0, note: v.note || "" }])),
  rows: (s.rows || []).map((r) => ({ id: String(r.id).startsWith("new-") ? null : r.id, project_id: r.project_id || null, task: r.task || "", billable: !!r.billable,
    hours: Object.fromEntries(Object.entries(r.hours || {}).filter(([, h]) => h !== "" && h !== null && Number(h) > 0).map(([d, h]) => [d, Number(h)])) })),
});

// ---------------------------------------------------------------- my timesheet
export function MyTimesheet() {
  const [params, setParams] = useSearchParams();
  const week = params.get("week") || "";
  const [data, setData] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [projects, setProjects] = useState({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const load = useCallback(() => api.get("/timesheets/me", { params: week ? { week } : {} })
    .then((r) => { setData(r.data); setSheet(r.data.sheet); setDirty(false); setProjects((p) => ({ ...(r.data.projects || {}), ...p })); }).catch((e) => toast.error(apiError(e))), [week]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/projects").then((r) => setProjects((prev) => ({ ...prev, ...Object.fromEntries(r.data.map((p) => [p.id, { id: p.id, name: p.name, client_name: p.client_name, status: p.status }])) }))).catch(() => {});
  }, []);
  const go = (w) => setParams((p) => { const n = new URLSearchParams(p); n.set("tab", "timesheet"); if (w) n.set("week", w); else n.delete("week"); return n; });
  const setSheetDirty = (fn) => { setSheet(fn); setDirty(true); };

  if (!data || !sheet) return <div className="h-40 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;
  const editable = data.can_edit;
  const total = r2((sheet.rows || []).reduce((t, r) => t + Object.values(r.hours || {}).reduce((a, h) => a + (Number(h) || 0), 0), 0));
  const billable = r2((sheet.rows || []).filter((r) => r.billable).reduce((t, r) => t + Object.values(r.hours || {}).reduce((a, h) => a + (Number(h) || 0), 0), 0));
  const workingDays = data.dates.filter((d) => !data.day_info[d].weekly_off && !data.day_info[d].holiday).length;
  const canSubmit = editable && data.today >= data.can_submit_from;

  const save = async (submit) => {
    setBusy(true);
    try {
      const { data: r } = submit ? await api.post("/timesheets/me/submit", cleanSheet(sheet)) : await api.put("/timesheets/me", cleanSheet(sheet));
      setData(r); setSheet(r.sheet); setDirty(false);
      toast.success(submit ? (r.sheet.status === "approved" ? "Timesheet approved" : "Sent for approval") : "Draft saved");
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4" data-testid="my-timesheet">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => go(data.prev_week)} aria-label="Previous week" data-testid="ts-prev"><ChevronLeft className="h-4 w-4" /></Button>
          <div className="min-w-[190px] text-center font-semibold text-gray-900 text-sm" data-testid="ts-week-label">{weekLabel(data.dates)}</div>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => go(data.next_week)} aria-label="Next week" data-testid="ts-next"><ChevronRight className="h-4 w-4" /></Button>
          {week && <Button variant="ghost" size="sm" onClick={() => go("")}>This week</Button>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TsPill status={sheet.status} testid="ts-status" />
          <span className="text-sm text-gray-600"><span className="font-semibold font-mono text-gray-900">{total}</span> h logged · <span className="font-mono">{billable}</span> billable · {workingDays} working days</span>
          {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
        </div>
        {editable && (
          <div className="flex gap-2 lg:ml-auto">
            <Button variant="outline" disabled={busy} onClick={() => save(false)} data-testid="ts-save"><Save className="h-4 w-4 mr-1.5" /> Save draft</Button>
            <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={busy || !canSubmit} onClick={() => save(true)} data-testid="ts-submit"
              title={canSubmit ? "" : `You can submit from ${dLabel(data.can_submit_from, { weekday: "long", day: "numeric", month: "short" })}`}><Send className="h-4 w-4 mr-1.5" /> Submit week</Button>
          </div>
        )}
      </div>

      {sheet.status === "rejected" && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 flex items-start gap-2" data-testid="ts-rejected"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><span><span className="font-semibold">Sent back{sheet.reviewed_by ? ` by ${sheet.reviewed_by}` : ""}:</span> {sheet.review_note}</span></div>}
      {sheet.status === "submitted" && <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 flex items-center gap-2"><Lock className="h-4 w-4" /> Waiting for your manager. Ask them to reopen it if something needs changing.</div>}
      {sheet.status === "approved" && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 flex items-center gap-2" data-testid="ts-approved"><CheckCircle2 className="h-4 w-4" /> Approved by {sheet.approved_by}{sheet.review_note ? ` — ${sheet.review_note}` : ""}. Days you registered now count in attendance.</div>}
      {editable && sheet.suggested && !sheet.id && <div className="rounded-lg border border-orange-200 bg-[#FFF7ED] px-3 py-2 text-sm text-gray-700 flex items-center gap-2"><Navigation className="h-4 w-4 text-[#F26B21]" /> Pre-filled from your check-ins and daily reports — check it, fill the gaps and save.</div>}
      {editable && !canSubmit && <p className="text-xs text-gray-500 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Fill it in as the week goes; you can submit from {dLabel(data.can_submit_from, { weekday: "long", day: "numeric", month: "short" })}.</p>}

      <TimesheetGrid data={data} sheet={sheet} setSheet={setSheetDirty} editable={editable} projects={projects} />

      {data.recent?.length > 0 && (
        <Card className="border-gray-200/80"><CardContent className="p-4">
          <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Recent weeks</div>
          <div className="flex flex-wrap gap-2">
            {data.recent.map((r) => (
              <button key={r.id} type="button" onClick={() => go(r.week_start)} className={`rounded-lg border px-3 py-1.5 text-left text-xs hover:border-orange-200 ${r.week_start === data.week_start ? "border-[#F26B21] bg-[#FFF7ED]" : "border-gray-200 bg-white"}`}>
                <div className="font-semibold text-gray-800">{dLabel(r.week_start, { day: "numeric", month: "short" })}</div>
                <div className="text-gray-500">{TS_STATUS[r.status]?.[0]} · {r.work_hours} h</div>
              </button>
            ))}
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- manager review
export function TimesheetReviewDialog({ sid, onClose, onDone }) {
  const [data, setData] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!sid) return;
    setData(null); setNote("");
    api.get(`/timesheets/${sid}`).then((r) => setData(r.data)).catch((e) => toast.error(apiError(e)));
  }, [sid]);
  const act = async (action) => {
    if (action === "reject" && !note.trim()) return toast.error("Say what needs fixing");
    setBusy(true);
    try {
      const { data: r } = await api.post(`/timesheets/${sid}/${action}`, { note });
      toast.success(action === "approve" ? `Approved${r.days_added_to_attendance ? ` · ${r.days_added_to_attendance} day${r.days_added_to_attendance > 1 ? "s" : ""} added to attendance` : ""}` : action === "reject" ? "Sent back" : "Reopened");
      onDone && onDone(); onClose();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const sh = data?.sheet;
  const changed = sh ? Object.entries(sh.days || {}).filter(([d, v]) => { const rec = data.day_info[d]?.record; return rec && rec.check_in_local && v.start && v.start !== rec.check_in_local; }) : [];
  const selfRegistered = sh ? Object.entries(sh.days || {}).filter(([d, v]) => v.status && !data.day_info[d]?.record?.status).length : 0;
  return (
    <Dialog open={!!sid} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl w-[96vw] max-h-[94vh] overflow-y-auto" data-testid="ts-review-dialog">
        <DialogHeader><DialogTitle>{data ? `${data.person.name} · ${weekLabel(data.dates)}` : "Timesheet"}</DialogTitle></DialogHeader>
        {!data ? <p className="text-sm text-gray-400">Loading…</p> : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <TsPill status={sh.status} />
              <span className="text-gray-600"><span className="font-mono font-semibold text-gray-900">{sh.totals.work_hours}</span> h logged · <span className="font-mono">{sh.totals.billable_hours}</span> billable · {sh.totals.days_present} days present{sh.totals.days_leave ? ` · ${sh.totals.days_leave} leave` : ""}</span>
            </div>
            {(selfRegistered > 0 || changed.length > 0) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-0.5" data-testid="ts-review-flags">
                {selfRegistered > 0 && <div><MapPin className="inline h-3.5 w-3.5 mr-1" />{selfRegistered} day{selfRegistered > 1 ? "s" : ""} registered without a check-in — approving adds them to attendance.</div>}
                {changed.map(([d, v]) => <div key={d}><Clock className="inline h-3.5 w-3.5 mr-1" />{dLabel(d)}: in-time {v.start} differs from check-in {data.day_info[d].record.check_in_local}.</div>)}
              </div>
            )}
            <TimesheetGrid data={data} sheet={sh} setSheet={() => {}} editable={false} projects={data.projects || {}} />
            {data.can_review && <div className="space-y-1"><Label>Note {sh.status === "submitted" ? "(required to send back)" : ""}</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="ts-review-note" /></div>}
          </div>
        )}
        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {data?.can_review && ["submitted", "approved"].includes(sh.status) && <Button variant="outline" disabled={busy} onClick={() => act("reopen")} data-testid="ts-reopen">Reopen</Button>}
          {data?.can_review && sh.status === "submitted" && <Button variant="outline" className="text-red-700 border-red-200 hover:bg-red-50" disabled={busy} onClick={() => act("reject")} data-testid="ts-reject">Send back</Button>}
          {data?.can_review && sh.status === "submitted" && <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy} onClick={() => act("approve")} data-testid="ts-approve"><CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TimesheetApprovals({ branchOptions }) {
  const [week, setWeek] = useState("");
  const [status, setStatus] = useState("all");
  const [branch, setBranch] = useState("all");
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => {
    const params = {};
    if (week) params.week = week;
    if (branch !== "all") params.branch = branch;
    api.get("/timesheets", { params }).then((r) => { setD(r.data); if (!week) setWeek(r.data.week_start); }).catch((e) => toast.error(apiError(e)));
  }, [week, branch]);
  useEffect(() => { load(); }, [load]);
  const rows = useMemo(() => (d ? d.rows.filter((r) => status === "all" || r.status === status) : []), [d, status]);
  if (!d) return <div className="h-40 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;
  const chips = [["all", "All", d.rows.length], ["submitted", "Waiting", d.counts.submitted], ["approved", "Approved", d.counts.approved],
    ["rejected", "Sent back", d.counts.rejected], ["draft", "Draft", d.counts.draft], ["not_started", "Not started", d.counts.not_started]];
  return (
    <div className="space-y-4" data-testid="ts-approvals">
      <div className="flex flex-col lg:flex-row lg:items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setWeek(d.prev_week)} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></Button>
          <div className="min-w-[190px] text-center font-semibold text-gray-900 text-sm" data-testid="ts-approvals-week">{weekLabel(d.dates)}</div>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setWeek(d.next_week)} aria-label="Next week"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Select value={branch} onValueChange={setBranch}>
          <SelectTrigger className="lg:w-48 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All locations</SelectItem>{branchOptions.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
        </Select>
        <div className="lg:ml-auto"><ExportMenu dataset="timesheets" params={{ week: d.week_start, ...(branch !== "all" ? { branch } : {}) }} /></div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map(([k, l, n]) => (
          <button key={k} type="button" onClick={() => setStatus(k)} data-testid={`ts-filter-${k}`}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${status === k ? "border-[#F26B21] bg-[#FFF7ED] text-[#F26B21]" : "border-gray-200 bg-white text-gray-600"}`}>{l} <span className="opacity-70">{n}</span></button>
        ))}
      </div>
      <Card className="border-gray-200/80 overflow-hidden">
        <div className="divide-y divide-gray-100">
          {rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400">Nobody here.</p>}
          {rows.map((r) => (
            <div key={r.user.id} className="flex items-center gap-3 px-4 py-3" data-testid={`ts-approval-row-${r.user.id}`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-900 truncate">{r.user.name}{r.self && <span className="text-xs text-gray-400"> · you</span>}</div>
                <div className="text-xs text-gray-500 truncate">{r.branch}{r.status !== "not_started" ? ` · ${r.days_present} days · ${r.work_hours} h${r.work_hours ? ` (${Math.round((100 * r.billable_hours) / r.work_hours)}% billable)` : ""}` : ""}</div>
              </div>
              <TsPill status={r.status} testid={`ts-approval-status-${r.user.id}`} />
              <Button variant={r.status === "submitted" ? "default" : "outline"} size="sm" disabled={!r.sheet_id} onClick={() => setOpen(r.sheet_id)}
                className={r.status === "submitted" ? "bg-[#F26B21] hover:bg-[#d95b16] text-white" : ""} data-testid={`ts-review-${r.user.id}`}>
                <Eye className="h-3.5 w-3.5 mr-1" />{r.status === "submitted" ? "Review" : "View"}
              </Button>
            </div>
          ))}
        </div>
      </Card>
      <TimesheetReviewDialog sid={open} onClose={() => setOpen(null)} onDone={load} />
    </div>
  );
}
