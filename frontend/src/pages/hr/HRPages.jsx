import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import HRLayout from "@/pages/hr/HRLayout";
import { useLoad, Spinner, Stat, PillTabs, Pill, Field, Empty, Avatar, fmtDate, localISO, monthLabel, inr } from "@/components/kit";
import { useRecordDelete, RowDeleteControls } from "@/components/RecordDelete";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import {
  Users, UserPlus, UserMinus, CalendarClock, FileWarning, Cake, Award, Search, Eye, ShieldCheck, ExternalLink, Plus, CheckCircle2,
  GraduationCap, BookOpen, Repeat2, Link2, PlayCircle, Boxes, IndianRupee, ClipboardList, Target, Pencil,
} from "lucide-react";

const STATUS_TONE = { active: "green", probation: "blue", notice: "amber", exited: "gray" };
const useTeam = () => {
  const [team, setTeam] = useState([]);
  useEffect(() => { api.get("/users/team").then((r) => setTeam(r.data)).catch(() => {}); }, []);
  return team;
};
const PersonPick = ({ value, onChange, team, placeholder = "Pick a person", allowNone, testid }) => (
  <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
    <SelectTrigger data-testid={testid}><SelectValue placeholder={placeholder} /></SelectTrigger>
    <SelectContent>{allowNone && <SelectItem value="none">— None —</SelectItem>}{!allowNone && <SelectItem value="none" disabled>{placeholder}</SelectItem>}
      {team.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
  </Select>
);

// ============================================================ Overview
const MiniBars = ({ data, testid }) => (
  <div style={{ height: Math.max(120, data.length * 30) }} data-testid={testid}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke="#F3F4F6" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "#FFF7ED" }} contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v) => [v, "People"]} />
        <Bar dataKey="count" fill="#F26B21" radius={[0, 4, 4, 0]} barSize={14} label={{ position: "right", fontSize: 11, fill: "#374151" }} />
      </BarChart>
    </ResponsiveContainer>
  </div>
);

const ListCard = ({ title, icon: Icon, items, empty, render, testid }) => (
  <Card className="border-gray-200/80 shadow-sm" data-testid={testid}>
    <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Icon className="h-4 w-4 text-[#F26B21]" />{title}</CardTitle></CardHeader>
    <CardContent className="pt-0">{items?.length ? <ul className="divide-y divide-gray-50">{items.map(render)}</ul> : <p className="text-xs text-gray-400 py-2">{empty}</p>}</CardContent>
  </Card>
);

export function HROverviewPage() {
  const [d] = useLoad("/hr/overview");
  return (
    <HRLayout title="HR" subtitle="People, payroll, joining and leaving, skills and handovers — all in one place.">
      {!d ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <Stat icon={Users} label="Headcount" value={d.headcount} testid="hr-headcount" />
            <Stat icon={UserPlus} label="Joined this month" value={d.joiners_this_month.length} tone="green" />
            <Stat icon={UserMinus} label="Serving notice" value={d.on_notice.length} tone="amber" />
            <Stat icon={ClipboardList} label="Onboarding" value={d.onboarding_in_progress} sub="in progress" tone="blue" />
            <Stat icon={FileWarning} label="Documents pending" value={d.documents_pending} tone="red" />
            <Stat icon={ShieldCheck} label="Records incomplete" value={d.records_missing} sub="no employee code" tone="gray" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">By department</CardTitle></CardHeader>
              <CardContent><MiniBars data={d.by_department} testid="hr-by-dept" /></CardContent></Card>
            <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">By location</CardTitle></CardHeader>
              <CardContent><MiniBars data={d.by_branch} testid="hr-by-branch" /></CardContent></Card>
            <div className="space-y-4">
              {d.payroll && (
                <Card className="border-gray-200/80 shadow-sm" data-testid="hr-payroll-card"><CardContent className="p-4">
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Payroll · {monthLabel(d.payroll.month)}</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="text-lg font-bold text-gray-900">{d.payroll.status === "not_started" ? "Not started" : d.payroll.status === "paid" ? "Paid" : d.payroll.status === "finalised" ? "Finalised" : "Draft"}</div>
                    {d.payroll.totals?.net ? <div className="text-sm font-mono text-gray-600">{inr(d.payroll.totals.net)} net</div> : null}
                  </div>
                  <Link to="/hr/payroll" className="text-xs font-semibold text-[#F26B21]">Open payroll →</Link>
                </CardContent></Card>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Stat icon={Repeat2} label="Handovers open" value={d.kt_open} tone="violet" />
                <Stat icon={Target} label="Skill plans" value={d.skill_plans_active} tone="blue" />
                <Stat icon={GraduationCap} label="Training overdue" value={d.training_overdue} tone={d.training_overdue ? "red" : "gray"} />
                <Stat icon={ClipboardList} label="HR requests" value={d.hr_tickets_open} sub="open" tone="amber" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <ListCard title="Checklist tasks due" icon={ClipboardList} items={d.tasks_due} empty="Nothing due in the next 30 days." testid="hr-tasks-due"
              render={(t, i) => (<li key={i} className="py-2 text-sm"><Link to={`/hr/${t.process}?open=${t.process_id}`} className="font-medium text-gray-800 hover:text-[#F26B21]">{t.title}</Link>
                <div className="text-xs text-gray-500">{t.person} · {t.process} · <span className={t.overdue ? "text-red-600 font-semibold" : ""}>{fmtDate(t.due_date, { day: "numeric", month: "short" })}</span></div></li>)} />
            <ListCard title="Serving notice" icon={UserMinus} items={d.on_notice} empty="No one is leaving." testid="hr-on-notice"
              render={(p) => (<li key={p.id} className="py-2 text-sm flex justify-between gap-2"><span className="font-medium text-gray-800">{p.name}</span><span className="text-xs text-gray-500">last day {fmtDate(p.last_working_day, { day: "numeric", month: "short" })}</span></li>)} />
            <ListCard title="Probation ending" icon={CalendarClock} items={d.probation_ending} empty="None in the next 30 days."
              render={(p) => (<li key={p.id} className="py-2 text-sm flex justify-between gap-2"><span className="font-medium text-gray-800">{p.name}</span><span className="text-xs text-gray-500">{fmtDate(p.date, { day: "numeric", month: "short" })}</span></li>)} />
            <ListCard title="Birthdays & work anniversaries" icon={Cake} items={[...d.birthdays.map((b) => ({ ...b, kind: "b" })), ...d.anniversaries.map((a) => ({ ...a, kind: "a" }))].sort((a, b) => a.date.localeCompare(b.date))}
              empty="Nothing in the next 30 days." testid="hr-celebrations"
              render={(p, i) => (<li key={i} className="py-2 text-sm flex justify-between gap-2"><span className="font-medium text-gray-800 flex items-center gap-1.5">{p.kind === "b" ? <Cake className="h-3.5 w-3.5 text-pink-500" /> : <Award className="h-3.5 w-3.5 text-amber-500" />}{p.name}</span>
                <span className="text-xs text-gray-500">{p.kind === "a" ? `${p.years} yr · ` : ""}{fmtDate(p.date, { day: "numeric", month: "short" })}</span></li>)} />
          </div>
        </>
      )}
    </HRLayout>
  );
}

// ============================================================ People
const SENS = [["pan", "PAN"], ["uan", "UAN (PF)"], ["pf_number", "PF member ID"], ["esi_number", "ESI number"], ["bank_account", "Bank account no."]];

function PersonSheet({ id, meta, onClose, onSaved }) {
  const team = useTeam();
  const [p, setP] = useState(null);
  const [tab, setTab] = useState("job");
  const [f, setF] = useState({});
  const [sens, setSens] = useState({});
  const [shown, setShown] = useState({});
  const [busy, setBusy] = useState(false);
  const [branches, setBranches] = useState([]);
  const load = () => api.get(`/hr/people/${id}`).then((r) => { setP(r.data); setF(r.data); setSens({}); setShown({}); }).catch((e) => toast.error(apiError(e)));
  useEffect(() => { setP(null); setTab("job"); if (id) { load(); api.get("/locations/branch-options").then((r) => setBranches(r.data)).catch(() => {}); } }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const can = meta?.can_manage;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    const keys = ["designation", "department", "phone", "join_date", "branch_id", "employee_code", "employment_type", "status", "manager_id", "probation_end",
      "confirmation_date", "notice_period_days", "work_location", "personal_email", "date_of_birth", "gender", "blood_group", "marital_status", "address_current",
      "address_permanent", "emergency_contact", "education", "previous_employer", "documents", "notes"];
    const body = Object.fromEntries(keys.filter((k) => f[k] !== undefined).map((k) => [k, f[k]]));
    if (meta.can_view_sensitive) {
      Object.assign(body, Object.fromEntries(Object.entries(sens).filter(([, v]) => v !== undefined && v !== "")));
      for (const k of ["bank_name", "bank_ifsc", "bank_account_holder", "aadhaar_last4"]) if (f[k] !== undefined) body[k] = f[k];
    }
    if (body.notice_period_days !== undefined) body.notice_period_days = Number(body.notice_period_days) || 0;
    try { const { data } = await api.put(`/hr/people/${id}`, body); setP(data); setF(data); setSens({}); toast.success("HR record saved"); onSaved(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const reveal = async (field) => {
    try { const { data } = await api.post(`/hr/people/${id}/reveal`, { field }); setShown((s) => ({ ...s, [field]: data.value || "(empty)" })); }
    catch (e) { toast.error(apiError(e)); }
  };
  // plain function (not a component) so inputs keep focus while typing
  const inp = (k, label, type = "text", className = "") => (
    <Field key={k} label={label} className={className}><Input type={type} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} disabled={!can} data-testid={`hr-f-${k}`} /></Field>
  );
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col" data-testid="person-sheet">
        {!p ? <Spinner /> : (
          <>
            <SheetHeader className="p-5 pb-3 border-b border-gray-100 text-left">
              <div className="flex items-center gap-3">
                <Avatar name={p.name} size={11} />
                <div className="min-w-0">
                  <SheetTitle className="text-lg truncate">{p.name}</SheetTitle>
                  <div className="text-xs text-gray-500 truncate">{p.designation || "—"}{p.department ? ` · ${p.department}` : ""}{p.employee_code ? ` · ${p.employee_code}` : ""}</div>
                </div>
                <Pill tone={STATUS_TONE[p.status]} className="ml-auto">{meta.statuses.find((s) => s.value === p.status)?.label || p.status}</Pill>
              </div>
              <div className="flex items-center gap-3 pt-1 text-xs">
                <span className="text-gray-500">Record {p.completeness}% complete</span>
                <Link to={`/employees/${p.id}`} className="text-[#F26B21] font-semibold inline-flex items-center gap-1">Full profile <ExternalLink className="h-3 w-3" /></Link>
              </div>
              <PillTabs tabs={[["job", "Job"], ["personal", "Personal"], ...(meta.can_view_sensitive ? [["bank", "Bank & statutory"]] : []), ["docs", "Documents"], ["growth", "Growth"]]} value={tab} onChange={setTab} testid="person-tab" />
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-5">
              {tab === "job" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {inp("employee_code", "Employee code")}
                  <Field label="Employment type"><Select value={f.employment_type || "full_time"} onValueChange={(v) => set("employment_type", v)} disabled={!can}>
                    <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{meta.employment_types.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></Field>
                  {inp("designation", "Designation")}{inp("department", "Department")}
                  <Field label="Reports to"><PersonPick value={f.manager_id} onChange={(v) => set("manager_id", v)} team={team.filter((u) => u.id !== p.id)} allowNone /></Field>
                  <Field label="Location"><Select value={f.branch_id || "none"} onValueChange={(v) => set("branch_id", v === "none" ? null : v)} disabled={!can}>
                    <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not set</SelectItem>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></Field>
                  {inp("join_date", "Date of joining", "date")}
                  <Field label="Status"><Select value={f.status || "active"} onValueChange={(v) => set("status", v)} disabled={!can}>
                    <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{meta.statuses.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></Field>
                  {inp("probation_end", "Probation ends", "date")}{inp("confirmation_date", "Confirmed on", "date")}
                  {inp("notice_period_days", "Notice period (days)", "number")}{inp("work_location", "Work location / seat")}
                  {inp("phone", "Work phone")}
                  {meta.can_view_sensitive && <Field label="HR notes (private)" className="sm:col-span-2"><Textarea rows={3} value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} disabled={!can} /></Field>}
                </div>
              )}
              {tab === "personal" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {inp("date_of_birth", "Date of birth", "date")}{inp("personal_email", "Personal email")}
                  {inp("blood_group", "Blood group")}{inp("gender", "Gender")}
                  {inp("marital_status", "Marital status")}{inp("education", "Highest education")}
                  <Field label="Current address" className="sm:col-span-2"><Textarea rows={2} value={f.address_current || ""} onChange={(e) => set("address_current", e.target.value)} disabled={!can} /></Field>
                  <Field label="Permanent address" className="sm:col-span-2"><Textarea rows={2} value={f.address_permanent || ""} onChange={(e) => set("address_permanent", e.target.value)} disabled={!can} /></Field>
                  {inp("previous_employer", "Previous employer", "text", "sm:col-span-2")}
                  <div className="sm:col-span-2 text-xs font-bold uppercase tracking-widest text-gray-400 pt-2">Emergency contact</div>
                  {["name", "relation", "phone"].map((k) => (
                    <Field key={k} label={k[0].toUpperCase() + k.slice(1)}><Input value={f.emergency_contact?.[k] || ""} disabled={!can}
                      onChange={(e) => set("emergency_contact", { ...(f.emergency_contact || {}), [k]: e.target.value })} /></Field>))}
                </div>
              )}
              {tab === "bank" && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500 flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Encrypted at rest and masked. Every reveal is logged. Aadhaar is never stored — only its last 4 digits.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SENS.map(([k, label]) => (
                      <Field key={k} label={label} hint={p[`has_${k}`] ? (shown[k] ? <span className="font-mono text-gray-700">{shown[k]}</span> : <>Saved: <span className="font-mono">{p[`${k}_masked`]}</span> · <button type="button" className="text-[#F26B21] font-semibold" onClick={() => reveal(k)} data-testid={`reveal-${k}`}>Reveal</button></>) : "Not added"}>
                        <Input value={sens[k] || ""} onChange={(e) => setSens((s) => ({ ...s, [k]: e.target.value }))} placeholder={p[`has_${k}`] ? "Type to replace" : "Add"} disabled={!can} data-testid={`hr-s-${k}`} />
                      </Field>))}
                    {inp("bank_name", "Bank name")}{inp("bank_ifsc", "IFSC")}
                    {inp("bank_account_holder", "Account holder name")}{inp("aadhaar_last4", "Aadhaar (last 4 only)")}
                  </div>
                </div>
              )}
              {tab === "docs" && (
                <div className="space-y-2" data-testid="person-docs">
                  {(f.documents || []).map((d, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                      <span className="flex-1 text-sm text-gray-800">{d.name}</span>
                      <Select value={d.status} disabled={!can} onValueChange={(v) => set("documents", f.documents.map((x, j) => (j === i ? { ...x, status: v } : x)))}>
                        <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="received">Received</SelectItem><SelectItem value="verified">Verified</SelectItem></SelectContent></Select>
                    </div>))}
                  {can && <Button variant="outline" size="sm" onClick={() => { const n = window.prompt("Document name"); if (n) set("documents", [...(f.documents || []), { name: n, status: "pending", note: "" }]); }}><Plus className="h-3.5 w-3.5 mr-1" /> Add document</Button>}
                  <p className="text-[11px] text-gray-400">Keep the files themselves in your Drive; this tracks what's been collected.</p>
                </div>
              )}
              {tab === "growth" && (
                <div className="space-y-4">
                  <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Skills</div>
                    <div className="flex flex-wrap gap-1.5">{Object.entries(p.skill_levels || {}).length ? Object.entries(p.skill_levels).map(([s, l]) => <Pill key={s} tone={l >= 4 ? "green" : l >= 3 ? "blue" : "gray"}>{s} · {l}/5</Pill>) : <span className="text-xs text-gray-400">No skills rated yet.</span>}</div></div>
                  <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Development plans</div>
                    {p.skill_plans?.length ? p.skill_plans.map((x) => <div key={x.id} className="text-sm py-1">{x.skill}: {x.current_level} → {x.target_level} <Pill tone={x.status === "achieved" ? "green" : "blue"}>{x.status}</Pill></div>) : <span className="text-xs text-gray-400">None.</span>}</div>
                  <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Handovers</div>
                    {p.kt?.length ? p.kt.map((x) => <Link key={x.id} to={`/hr/kt?open=${x.id}`} className="block text-sm py-1 text-gray-800 hover:text-[#F26B21]">{x.topic} <Pill>{x.status}</Pill></Link>) : <span className="text-xs text-gray-400">None.</span>}</div>
                  {p.onboarding && <Link to={`/hr/onboarding?open=${p.onboarding.id}`} className="block text-sm text-[#F26B21] font-semibold">Onboarding ({p.onboarding.status}) →</Link>}
                  {p.offboarding && <Link to={`/hr/offboarding?open=${p.offboarding.id}`} className="block text-sm text-[#F26B21] font-semibold">Offboarding ({p.offboarding.status}) →</Link>}
                </div>
              )}
            </div>
            {can && tab !== "growth" && (
              <div className="border-t border-gray-100 p-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setF(p); setSens({}); }}>Reset</Button>
                <Button onClick={save} disabled={busy} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="person-save">Save</Button>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function HRPeoplePage() {
  const [sp, setSp] = useSearchParams();
  const [meta] = useLoad("/hr/meta");
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState("all");
  const [inactive, setInactive] = useState(false);
  const [rows, reload] = useLoad("/hr/people", { include_inactive: inactive || undefined });
  const openId = sp.get("open");
  const depts = useMemo(() => [...new Set((rows || []).map((r) => r.department).filter(Boolean))].sort(), [rows]);
  const shown = (rows || []).filter((r) => (dept === "all" || r.department === dept) && (status === "all" || r.status === status) &&
    (!q.trim() || `${r.name} ${r.designation} ${r.employee_code} ${r.email}`.toLowerCase().includes(q.trim().toLowerCase())));
  const setOpen = (id) => setSp((p) => { const n = new URLSearchParams(p); if (id) n.set("open", id); else n.delete("open"); return n; });
  return (
    <HRLayout title="People" subtitle="Every employee's HR record — job, personal, documents, bank and statutory details.">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code, designation" className="pl-9 bg-white" data-testid="hr-people-search" /></div>
        <Select value={dept} onValueChange={setDept}><SelectTrigger className="w-44 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All departments</SelectItem>{depts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-40 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Any status</SelectItem>{(meta?.statuses || []).map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
        <label className="flex items-center gap-2 text-xs text-gray-600"><Switch checked={inactive} onCheckedChange={setInactive} /> Show former</label>
      </div>
      <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-0 overflow-x-auto">
        {!rows || !meta ? <Spinner className="h-40" /> : (
          <table className="w-full text-sm" data-testid="hr-people-table">
            <thead><tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 bg-gray-50/60">
              <th className="text-left font-semibold py-2.5 px-4">Employee</th><th className="text-left font-semibold py-2.5 px-2">Code</th><th className="text-left font-semibold py-2.5 px-2">Department</th>
              <th className="text-left font-semibold py-2.5 px-2">Location</th><th className="text-left font-semibold py-2.5 px-2">Type</th><th className="text-left font-semibold py-2.5 px-2">Joined</th>
              <th className="text-left font-semibold py-2.5 px-2">Status</th><th className="text-left font-semibold py-2.5 px-4">Record</th></tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-orange-50/40 cursor-pointer" onClick={() => setOpen(r.id)} data-testid={`hr-person-${r.id}`}>
                <td className="py-2.5 px-4"><div className="flex items-center gap-2.5"><Avatar name={r.name} /><div className="min-w-0"><div className="font-medium text-gray-900 truncate">{r.name}</div><div className="text-xs text-gray-500 truncate">{r.designation || "—"}</div></div></div></td>
                <td className="py-2.5 px-2 font-mono text-xs text-gray-600">{r.employee_code || "—"}</td>
                <td className="py-2.5 px-2 text-gray-600">{r.department || "—"}</td>
                <td className="py-2.5 px-2 text-gray-600">{r.branch_name || "—"}</td>
                <td className="py-2.5 px-2 text-gray-600">{meta.employment_types.find((t) => t.value === r.employment_type)?.label}</td>
                <td className="py-2.5 px-2 text-gray-600 whitespace-nowrap">{fmtDate(r.join_date)}</td>
                <td className="py-2.5 px-2"><Pill tone={STATUS_TONE[r.status]}>{meta.statuses.find((s) => s.value === r.status)?.label}</Pill></td>
                <td className="py-2.5 px-4"><div className="flex items-center gap-2"><div className="h-1.5 w-16 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${r.completeness >= 80 ? "bg-emerald-500" : r.completeness >= 50 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${r.completeness}%` }} /></div><span className="text-xs text-gray-500 font-mono">{r.completeness}%</span></div></td>
              </tr>))}</tbody>
          </table>
        )}
      </CardContent></Card>
      {meta && <PersonSheet id={openId} meta={meta} onClose={() => setOpen(null)} onSaved={reload} />}
    </HRLayout>
  );
}

// ============================================================ Onboarding / Offboarding
const ROLE_TONE = { hr: "orange", it: "blue", manager: "violet", employee: "gray", finance: "green", buddy: "amber" };

function ProcessSheet({ kind, id, meta, onClose, onChanged }) {
  const team = useTeam();
  const [d, setD] = useState(null);
  const [newTask, setNewTask] = useState("");
  const [deact, setDeact] = useState(true);
  const load = () => api.get(`/hr/process/${kind}/${id}`).then((r) => setD(r.data)).catch((e) => { toast.error(apiError(e)); onClose(); });
  useEffect(() => { setD(null); if (id) load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const can = meta?.can_manage;
  const tick = async (t) => {
    try { const { data } = await api.put(`/hr/process/${kind}/${id}/tasks/${t.id}`, { done: !t.done }); setD(data); onChanged(); } catch (e) { toast.error(apiError(e)); }
  };
  const assign = async (t, uid) => {
    try { const { data } = await api.put(`/hr/process/${kind}/${id}/tasks/${t.id}`, { assignee_id: uid || null }); setD(data); } catch (e) { toast.error(apiError(e)); }
  };
  const add = async () => {
    if (!newTask.trim()) return;
    try { const { data } = await api.post(`/hr/process/${kind}/${id}/tasks`, { title: newTask, group: "other", owner_role: "hr" }); setD(data); setNewTask(""); } catch (e) { toast.error(apiError(e)); }
  };
  const finish = async (path, body) => {
    try { const { data } = await api.post(`/hr/process/${kind}/${id}/${path}`, body || {}); setD(data); onChanged(); toast.success(path === "complete" ? "Marked complete" : "Cancelled"); } catch (e) { toast.error(apiError(e)); }
  };
  const updOff = async (patch) => {
    try { const { data } = await api.put(`/hr/offboarding/${id}`, patch); setD(data); onChanged(); } catch (e) { toast.error(apiError(e)); }
  };
  const asset = async (a) => {
    try { const { data } = await api.post(`/hr/offboarding/${id}/assets/${a.id}`); setD(data); toast.success(`${a.name} collected — unassigned in Assets`); } catch (e) { toast.error(apiError(e)); }
  };
  const groups = useMemo(() => {
    const g = {};
    (d?.tasks || []).forEach((t) => { (g[t.group] = g[t.group] || []).push(t); });
    return Object.entries(g);
  }, [d]);
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col" data-testid="process-sheet">
        {!d ? <Spinner /> : (
          <>
            <SheetHeader className="p-5 pb-3 border-b border-gray-100 text-left">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#F26B21]">{kind === "onboarding" ? "Onboarding" : "Offboarding"}</div>
              <SheetTitle className="text-lg">{d.user_name}</SheetTitle>
              <div className="text-xs text-gray-500">{kind === "onboarding" ? `Starts ${fmtDate(d.start_date)}${d.manager_name ? ` · manager ${d.manager_name}` : ""}${d.buddy_name ? ` · buddy ${d.buddy_name}` : ""}`
                : `${meta.offboard_types.find((t) => t.value === d.type)?.label} · last day ${fmtDate(d.last_working_day)}${d.handover_to_name ? ` · handover to ${d.handover_to_name}` : ""}`}</div>
              <div className="flex items-center gap-3 pt-1">
                <div className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-[#F26B21]" style={{ width: `${d.progress}%` }} /></div>
                <span className="text-xs font-mono text-gray-600">{d.tasks_done}/{d.tasks_total}</span>
                <Pill tone={d.status === "completed" ? "green" : d.status === "cancelled" ? "gray" : "blue"}>{d.status.replace("_", " ")}</Pill>
              </div>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {groups.map(([g, tasks]) => (
                <div key={g}>
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">{meta.group_labels[g] || "Other"}</div>
                  <ul className="space-y-1.5">{tasks.map((t) => {
                    const late = !t.done && t.due_date && t.due_date < localISO();
                    return (
                      <li key={t.id} className="flex items-start gap-2.5 rounded-lg border border-gray-100 px-3 py-2" data-testid={`task-${t.id}`}>
                        <Checkbox checked={t.done} onCheckedChange={() => tick(t)} className="mt-0.5" data-testid={`task-check-${t.id}`} />
                        <div className="min-w-0 flex-1">
                          <div className={`text-sm ${t.done ? "line-through text-gray-400" : "text-gray-800"}`}>{t.title}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-gray-500">
                            <Pill tone={ROLE_TONE[t.owner_role]}>{meta.owner_roles.find((r) => r.value === t.owner_role)?.label || t.owner_role}</Pill>
                            {t.due_date && <span className={late ? "text-red-600 font-semibold" : ""}>{fmtDate(t.due_date, { day: "numeric", month: "short" })}</span>}
                            {t.done && t.done_by && <span>· done by {t.done_by}</span>}
                          </div>
                        </div>
                        {can && !t.done && <div className="w-36 shrink-0"><Select value={t.assignee_id || "none"} onValueChange={(v) => assign(t, v === "none" ? "" : v)}>
                          <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{team.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>}
                        {(!can || t.done) && t.assignee_name && <span className="text-[11px] text-gray-500 shrink-0">{t.assignee_name}</span>}
                      </li>);
                  })}</ul>
                </div>
              ))}
              {can && d.status === "in_progress" && (
                <div className="flex gap-2"><Input value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Add a task" /><Button variant="outline" onClick={add}>Add</Button></div>
              )}
              {kind === "offboarding" && (
                <>
                  <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5 flex items-center gap-1.5"><Boxes className="h-3.5 w-3.5" /> Assets to collect</div>
                    {d.assets?.length ? <ul className="space-y-1.5">{d.assets.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm">
                        <span className={a.returned ? "line-through text-gray-400" : "text-gray-800"}>{a.name} <span className="text-xs text-gray-400">{a.code}</span></span>
                        {a.returned ? <Pill tone="green"><CheckCircle2 className="h-3 w-3" /> Collected</Pill> : can && <Button size="sm" variant="outline" onClick={() => asset(a)} data-testid={`asset-return-${a.id}`}>Mark collected</Button>}
                      </li>))}</ul> : <p className="text-xs text-gray-400">No assets assigned.</p>}</div>
                  {d.kt && <Link to={`/hr/kt?open=${d.kt.id}`} className="block rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800">Knowledge transfer: <b>{d.kt.topic}</b> ({d.kt.status.replace("_", " ")}) →</Link>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Exit interview"><label className="flex items-center gap-2 text-sm"><Checkbox checked={d.exit_interview?.done} disabled={!can} onCheckedChange={(v) => updOff({ exit_interview_done: !!v })} /> Done</label></Field>
                    <Field label="Full & final settlement"><Select value={d.fnf?.status || "pending"} disabled={!can} onValueChange={(v) => updOff({ fnf_status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="processed">Processed</SelectItem><SelectItem value="paid">Paid</SelectItem></SelectContent></Select></Field>
                    <Field label="Exit interview notes" className="sm:col-span-2"><Textarea rows={2} defaultValue={d.exit_interview?.notes} disabled={!can} onBlur={(e) => e.target.value !== (d.exit_interview?.notes || "") && updOff({ exit_interview_notes: e.target.value })} /></Field>
                  </div>
                </>
              )}
            </div>
            {can && d.status === "in_progress" && (
              <div className="border-t border-gray-100 p-4 flex flex-wrap items-center justify-end gap-2">
                {kind === "offboarding" && <label className="flex items-center gap-2 text-xs text-gray-600 mr-auto"><Switch checked={deact} onCheckedChange={setDeact} /> Deactivate their login when complete</label>}
                <Button variant="ghost" onClick={() => finish("cancel")} data-testid="process-cancel">{kind === "offboarding" ? "They're staying" : "Cancel"}</Button>
                <Button onClick={() => finish("complete", { deactivate_login: kind === "offboarding" && deact })} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="process-complete">Mark complete</Button>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StartDialog({ kind, open, onClose, meta, onStarted }) {
  const team = useTeam();
  const [f, setF] = useState({});
  useEffect(() => { if (open) setF(kind === "onboarding" ? { user_id: "", start_date: localISO(), manager_id: "", buddy_id: "" } : { user_id: "", type: "resignation", last_working_day: "", handover_to_id: "", reason: "", create_kt: true }); }, [open, kind]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const go = async () => {
    try { const { data } = await api.post(`/hr/${kind}`, { ...f, manager_id: f.manager_id || null, buddy_id: f.buddy_id || null, handover_to_id: f.handover_to_id || null });
      toast.success(`${kind === "onboarding" ? "Onboarding" : "Offboarding"} started for ${data.user_name}`); onStarted(data); onClose(); }
    catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid={`start-${kind}`}>
        <DialogHeader><DialogTitle>{kind === "onboarding" ? "Start onboarding" : "Start offboarding"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Employee" hint={kind === "onboarding" ? "Create their login in User Management first." : null}><PersonPick value={f.user_id} onChange={(v) => set("user_id", v)} team={team} testid="start-person" /></Field>
          {kind === "onboarding" ? (
            <>
              <Field label="First day"><Input type="date" value={f.start_date || ""} onChange={(e) => set("start_date", e.target.value)} /></Field>
              <Field label="Manager"><PersonPick value={f.manager_id} onChange={(v) => set("manager_id", v)} team={team} allowNone /></Field>
              <Field label="Buddy"><PersonPick value={f.buddy_id} onChange={(v) => set("buddy_id", v)} team={team} allowNone /></Field>
            </>
          ) : (
            <>
              <Field label="Reason"><Select value={f.type} onValueChange={(v) => set("type", v)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{meta.offboard_types.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Last working day"><Input type="date" value={f.last_working_day || ""} onChange={(e) => set("last_working_day", e.target.value)} data-testid="start-lwd" /></Field>
              <Field label="Hand work over to"><PersonPick value={f.handover_to_id} onChange={(v) => set("handover_to_id", v)} team={team.filter((u) => u.id !== f.user_id)} allowNone /></Field>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.create_kt} onCheckedChange={(v) => set("create_kt", !!v)} /> Open a knowledge-transfer plan</label>
            </>
          )}
          <p className="text-xs text-gray-500">The checklist comes from your template — edit it any time with "Edit checklist".</p>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={go} disabled={!f.user_id || (kind === "offboarding" && !f.last_working_day)} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="start-go">Start</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplateDialog({ kind, open, onClose, meta }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { if (open) api.get("/hr/templates").then((r) => setRows(r.data[kind].map((x) => ({ ...x })))).catch(() => {}); }, [open, kind]);
  const groups = kind === "onboarding" ? ["before_day1", "day1", "week1", "month1"] : ["notice", "last_week", "last_day", "after"];
  const save = async () => {
    try { await api.put("/hr/templates", { [kind]: rows }); toast.success("Checklist template saved"); onClose(); } catch (e) { toast.error(apiError(e)); }
  };
  const set = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto" data-testid="template-dialog">
        <DialogHeader><DialogTitle>{kind === "onboarding" ? "Onboarding" : "Offboarding"} checklist template</DialogTitle></DialogHeader>
        <p className="text-xs text-gray-500">Due = days {kind === "onboarding" ? "from the first day (negative = before)" : "from the last working day (negative = before)"}.</p>
        <div className="space-y-2">{rows.map((r, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <Input className="col-span-12 sm:col-span-5" value={r.title} onChange={(e) => set(i, "title", e.target.value)} />
            <Select value={r.group} onValueChange={(v) => set(i, "group", v)}><SelectTrigger className="col-span-4 sm:col-span-2 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{groups.map((g) => <SelectItem key={g} value={g}>{meta.group_labels[g]}</SelectItem>)}</SelectContent></Select>
            <Select value={r.owner_role} onValueChange={(v) => set(i, "owner_role", v)}><SelectTrigger className="col-span-4 sm:col-span-2 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{meta.owner_roles.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent></Select>
            <Input className="col-span-2 sm:col-span-2" type="number" value={r.due_offset_days} onChange={(e) => set(i, "due_offset_days", e.target.value)} />
            <Button variant="ghost" size="sm" className="col-span-2 sm:col-span-1 text-gray-400" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>✕</Button>
          </div>))}</div>
        <Button variant="outline" size="sm" onClick={() => setRows((x) => [...x, { title: "", group: groups[0], owner_role: "hr", due_offset_days: 0 }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add task</Button>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} className="bg-[#F26B21] hover:bg-[#E05A10] text-white">Save template</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProcessPage({ kind }) {
  const [sp, setSp] = useSearchParams();
  const [meta] = useLoad("/hr/meta");
  const [status, setStatus] = useState("in_progress");
  const [rows, reload] = useLoad(`/hr/${kind}`, { status: status === "all" ? undefined : status });
  const [startOpen, setStartOpen] = useState(false);
  const [tpl, setTpl] = useState(false);
  const del = useRecordDelete({ coll: kind === "onboarding" ? "hr_onboarding" : "hr_offboarding", permKey: "hr.delete", rows: rows || [], onDeleted: reload, labelOf: (r) => r.user_name });
  const openId = sp.get("open");
  const setOpen = (id) => setSp((p) => { const n = new URLSearchParams(p); if (id) n.set("open", id); else n.delete("open"); return n; });
  const on = kind === "onboarding";
  return (
    <HRLayout title={on ? "Onboarding" : "Offboarding"} subtitle={on ? "Get new joiners productive: documents, logins, laptop, training and check-ins." : "Leaving well: notice, handover (KT), assets back, access off, full & final."}
      actions={meta?.can_manage && <>
        <Button variant="outline" size="sm" onClick={() => setTpl(true)} data-testid="edit-template"><Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit checklist</Button>
        <Button size="sm" onClick={() => setStartOpen(true)} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid={`start-${kind}-btn`}>{on ? <UserPlus className="h-3.5 w-3.5 mr-1.5" /> : <UserMinus className="h-3.5 w-3.5 mr-1.5" />} Start {kind}</Button></>}>
      <div className="flex items-center gap-2">
        <PillTabs tabs={[["in_progress", "In progress"], ["completed", "Completed"], ["all", "All"]]} value={status} onChange={setStatus} testid={`${kind}-status`} />
        <span className="ml-auto">{del.dialog}</span>
      </div>
      {!rows || !meta ? <Spinner /> : rows.length === 0 ? (
        <Card className="border-gray-200/80 shadow-sm"><Empty icon={on ? UserPlus : UserMinus} title={on ? "No one is onboarding right now" : "No one is leaving right now"} sub="Start one when someone joins or resigns — the checklist is created for you." /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{rows.map((r) => (
          <Card key={r.id} className="border-gray-200/80 shadow-sm hover:border-orange-300 cursor-pointer" onClick={() => setOpen(r.id)} data-testid={`${kind}-card-${r.id}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3"><Avatar name={r.user_name} size={10} /><div className="min-w-0 flex-1"><div className="font-semibold text-gray-900 truncate">{r.user_name}</div>
                <div className="text-xs text-gray-500">{on ? `Started ${fmtDate(r.start_date, { day: "numeric", month: "short" })}` : `Last day ${fmtDate(r.last_working_day, { day: "numeric", month: "short" })}`}</div></div>
                <RowDeleteControls kit={del} row={r} /></div>
              <div className="flex items-center gap-2"><div className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-[#F26B21]" style={{ width: `${r.progress}%` }} /></div><span className="text-xs font-mono text-gray-600">{r.progress}%</span></div>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <Pill tone={r.status === "completed" ? "green" : r.status === "cancelled" ? "gray" : "blue"}>{r.status.replace("_", " ")}</Pill>
                {r.overdue > 0 && <Pill tone="red">{r.overdue} overdue</Pill>}
                {!on && r.assets?.some((a) => !a.returned) && <Pill tone="amber">{r.assets.filter((a) => !a.returned).length} assets out</Pill>}
              </div>
            </CardContent>
          </Card>))}</div>
      )}
      {meta && <StartDialog kind={kind} open={startOpen} onClose={() => setStartOpen(false)} meta={meta} onStarted={(d) => { reload(); setOpen(d.id); }} />}
      {meta && <TemplateDialog kind={kind} open={tpl} onClose={() => setTpl(false)} meta={meta} />}
      {meta && <ProcessSheet kind={kind} id={openId} meta={meta} onClose={() => setOpen(null)} onChanged={reload} />}
    </HRLayout>
  );
}
export const OnboardingPage = () => <ProcessPage kind="onboarding" />;
export const OffboardingPage = () => <ProcessPage kind="offboarding" />;

// ============================================================ Skills & training
const LEVEL_BG = ["#F9FAFB", "#FFEDD5", "#FDBA74", "#FB923C", "#F26B21", "#C2410C"];

function PlanDialog({ open, onClose, people, courses, onSaved, preset }) {
  const [f, setF] = useState({});
  useEffect(() => { if (open) setF({ user_id: preset?.user_id || "", skill: preset?.skill || "", current_level: preset?.current_level || 1, target_level: Math.min(5, (preset?.current_level || 1) + 2), due_date: "", course_id: "", actions: "" }); }, [open, preset]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    try { await api.post("/hr/skill-plans", { ...f, current_level: Number(f.current_level), target_level: Number(f.target_level), course_id: f.course_id || null, due_date: f.due_date || null });
      toast.success("Development plan created"); onSaved(); onClose(); } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="plan-dialog">
        <DialogHeader><DialogTitle>Skill development plan</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Employee"><PersonPick value={f.user_id} onChange={(v) => set("user_id", v)} team={people} /></Field>
          <Field label="Skill"><Input value={f.skill || ""} onChange={(e) => set("skill", e.target.value)} placeholder="e.g. Google Ads" data-testid="plan-skill" /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Now (1–5)"><Input type="number" min={1} max={5} value={f.current_level} onChange={(e) => set("current_level", e.target.value)} /></Field>
            <Field label="Target"><Input type="number" min={1} max={5} value={f.target_level} onChange={(e) => set("target_level", e.target.value)} /></Field>
            <Field label="By"><Input type="date" value={f.due_date} onChange={(e) => set("due_date", e.target.value)} /></Field>
          </div>
          <Field label="Training course" hint="Assigns the course to them as well."><Select value={f.course_id || "none"} onValueChange={(v) => set("course_id", v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">— None —</SelectItem>{courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="How they'll get there"><Textarea rows={2} value={f.actions} onChange={(e) => set("actions", e.target.value)} placeholder="Shadow a senior, certification, one live project…" /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!f.user_id || !f.skill?.trim()} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="plan-save">Create plan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CourseDialog({ open, onClose, course, onSaved }) {
  const [f, setF] = useState({});
  useEffect(() => { if (open) setF(course ? { ...course } : { title: "", category: "", provider: "", duration_hours: 0, link: "", description: "" }); }, [open, course]);
  const save = async () => {
    try { if (course) await api.put(`/training/courses/${course.id}`, { ...f, duration_hours: Number(f.duration_hours) || 0 }); else await api.post("/training/courses", { ...f, duration_hours: Number(f.duration_hours) || 0 });
      toast.success("Course saved"); onSaved(); onClose(); } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md"><DialogHeader><DialogTitle>{course ? "Edit course" : "New training course"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Title"><Input value={f.title || ""} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} data-testid="course-title" /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Category"><Input value={f.category || ""} onChange={(e) => setF((x) => ({ ...x, category: e.target.value }))} /></Field>
            <Field label="Provider"><Input value={f.provider || ""} onChange={(e) => setF((x) => ({ ...x, provider: e.target.value }))} placeholder="Google Skillshop, Udemy…" /></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Hours"><Input type="number" value={f.duration_hours ?? 0} onChange={(e) => setF((x) => ({ ...x, duration_hours: e.target.value }))} /></Field>
            <Field label="Link"><Input value={f.link || ""} onChange={(e) => setF((x) => ({ ...x, link: e.target.value }))} /></Field></div>
          <Field label="Description"><Textarea rows={2} value={f.description || ""} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!f.title?.trim()} className="bg-[#F26B21] hover:bg-[#E05A10] text-white">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SkillsPage() {
  const { hasPerm } = useAuth();
  const [meta] = useLoad("/hr/meta");
  const [tab, setTab] = useState("matrix");
  const [m, reloadM] = useLoad("/hr/skills/matrix");
  const [plans, reloadP] = useLoad("/hr/skill-plans");
  const [courses, reloadC] = useLoad("/training/courses");
  const [assigns] = useLoad("/training/assignments");
  const [planOpen, setPlanOpen] = useState(null);
  const [course, setCourse] = useState(undefined);
  const [cell, setCell] = useState(null);
  const delPlan = useRecordDelete({ coll: "hr_skill_plans", permKey: "hr.delete", rows: plans || [], onDeleted: reloadP, labelOf: (r) => `${r.user_name} · ${r.skill}` });
  const delCourse = useRecordDelete({ coll: "training_courses", permKey: "training.delete", rows: courses || [], onDeleted: reloadC, labelOf: (r) => r.title });
  const can = meta?.can_manage;
  const [skillFilter, setSkillFilter] = useState("");
  const skills = (m?.skills || []).filter((s) => !skillFilter || s.toLowerCase().includes(skillFilter.toLowerCase()));
  const setLevel = async (person, skill, level) => {
    const levels = { ...person.levels, [skill]: level };
    if (!level) delete levels[skill];
    try { await api.put(`/hr/skills/${person.id}`, { levels }); reloadM(); setCell(null); } catch (e) { toast.error(apiError(e)); }
  };
  const planStatus = async (p, status) => { try { await api.put(`/hr/skill-plans/${p.id}`, { status }); reloadP(); reloadM(); } catch (e) { toast.error(apiError(e)); } };
  const courseStats = (cid) => { const a = (assigns || []).filter((x) => x.course_id === cid); return { total: a.length, done: a.filter((x) => x.status === "completed").length }; };
  return (
    <HRLayout title="Skills & training" subtitle="Who's good at what, where the gaps are, and the plans and courses that close them."
      actions={can && <Button size="sm" onClick={() => setPlanOpen({})} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="new-plan-btn"><Plus className="h-3.5 w-3.5 mr-1.5" /> Development plan</Button>}>
      <PillTabs tabs={[["matrix", "Skill matrix"], ["plans", "Development plans", (plans || []).filter((p) => p.status === "active").length], ["courses", "Courses", (courses || []).length]]} value={tab} onChange={setTab} testid="skills-tab" />
      {tab === "matrix" && (!m ? <Spinner /> : (
        <>
          {m.gaps?.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="skill-gaps"><b>Skill gaps:</b> no one rated 4+ in {m.gaps.map((g) => g.skill).join(", ")}.</div>}
          <div className="flex items-center gap-3 flex-wrap">
            <Input value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)} placeholder="Filter skills" className="w-56 bg-white" />
            <div className="flex items-center gap-1 text-[11px] text-gray-500">Level {[1, 2, 3, 4, 5].map((l) => <span key={l} className="h-4 w-6 rounded text-center leading-4 font-semibold" style={{ background: LEVEL_BG[l], color: l >= 4 ? "#fff" : "#7C2D12" }}>{l}</span>)}<span className="ml-1">1 learning · 3 independent · 5 expert</span></div>
          </div>
          <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-0 overflow-x-auto">
            <table className="text-xs" data-testid="skill-matrix">
              <thead><tr><th className="sticky left-0 bg-white z-10 text-left font-semibold text-gray-500 py-2 px-3 min-w-[160px]">Person</th>
                {skills.map((s) => <th key={s} className="font-semibold text-gray-600 px-1 py-2 align-bottom"><div className="w-8 mx-auto [writing-mode:vertical-rl] rotate-180 whitespace-nowrap text-left">{s}</div></th>)}</tr></thead>
              <tbody>{m.people.map((p) => (
                <tr key={p.id} className="border-t border-gray-50">
                  <td className="sticky left-0 bg-white z-10 py-1.5 px-3"><div className="font-medium text-gray-800 text-sm truncate">{p.name}</div><div className="text-gray-400 truncate">{p.designation}</div></td>
                  {skills.map((s) => {
                    const l = p.levels[s] || 0;
                    return (
                      <td key={s} className="px-1 py-1 text-center relative">
                        <button type="button" disabled={!can} onClick={() => setCell(cell?.p === p.id && cell?.s === s ? null : { p: p.id, s })} title={`${p.name} · ${s}: ${l || "not rated"}`}
                          className="h-7 w-8 rounded font-semibold" style={{ background: LEVEL_BG[l], color: l >= 4 ? "#fff" : "#7C2D12" }} data-testid={`cell-${p.id}-${s}`}>{l || ""}</button>
                        {cell?.p === p.id && cell?.s === s && (
                          <div className="absolute z-20 top-8 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-lg shadow-lg p-1 flex gap-0.5">
                            {[0, 1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => setLevel(p, s, n)} className="h-7 w-7 rounded text-xs font-semibold hover:ring-2 ring-orange-300" style={{ background: LEVEL_BG[n], color: n >= 4 ? "#fff" : "#7C2D12" }}>{n || "–"}</button>)}
                          </div>)}
                      </td>);
                  })}
                </tr>))}</tbody>
            </table>
          </CardContent></Card>
          {can && <p className="text-xs text-gray-400">Tap a cell to rate. Add a skill to the list by rating it for someone in their profile, or start a development plan.</p>}
        </>
      ))}
      {tab === "plans" && (!plans ? <Spinner /> : plans.length === 0 ? <Card><Empty icon={Target} title="No development plans yet" sub="Pick a skill someone should grow into, set a target level and a date." /></Card> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{delPlan.dialog}{plans.map((p) => (
          <Card key={p.id} className="border-gray-200/80 shadow-sm" data-testid={`plan-${p.id}`}><CardContent className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2"><div><div className="font-semibold text-gray-900">{p.skill}</div><div className="text-xs text-gray-500">{p.user_name}</div></div>
              <div className="flex items-center gap-1"><Pill tone={p.status === "achieved" ? "green" : p.status === "dropped" ? "gray" : p.overdue ? "red" : "blue"}>{p.overdue ? "overdue" : p.status}</Pill><RowDeleteControls kit={delPlan} row={p} /></div></div>
            <div className="flex items-center gap-2 text-sm"><span className="font-mono">{p.current_level}</span><div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-[#F26B21]" style={{ width: `${Math.min(100, (100 * p.current_level) / p.target_level)}%` }} /></div><span className="font-mono">{p.target_level}</span></div>
            {p.actions && <p className="text-xs text-gray-600">{p.actions}</p>}
            <div className="text-xs text-gray-400">{p.due_date ? `By ${fmtDate(p.due_date)}` : "No date"}{p.course_title ? ` · course: ${p.course_title}` : ""}</div>
            {can && p.status === "active" && <div className="flex gap-2 pt-1"><Button size="sm" variant="outline" onClick={() => planStatus(p, "achieved")} data-testid={`plan-achieved-${p.id}`}>Achieved</Button><Button size="sm" variant="ghost" onClick={() => planStatus(p, "dropped")}>Drop</Button></div>}
          </CardContent></Card>))}</div>
      ))}
      {tab === "courses" && (!courses ? <Spinner /> : (
        <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100"><span className="text-sm font-semibold text-gray-800">Course catalog</span>
            <span className="flex items-center gap-2">{delCourse.dialog}{hasPerm("training") && can && <Button size="sm" variant="outline" onClick={() => setCourse(null)} data-testid="new-course-btn"><Plus className="h-3.5 w-3.5 mr-1" /> Course</Button>}</span></div>
          {courses.length === 0 ? <Empty icon={BookOpen} title="No courses yet" /> : (
            <ul className="divide-y divide-gray-100">{courses.map((c) => { const st = courseStats(c.id); return (
              <li key={c.id} className="px-4 py-3 flex items-center gap-3">
                <BookOpen className="h-4 w-4 text-[#F26B21] shrink-0" />
                <div className="min-w-0 flex-1"><div className="font-medium text-gray-900 truncate">{c.title}</div><div className="text-xs text-gray-500">{[c.category, c.provider, c.duration_hours ? `${c.duration_hours}h` : null].filter(Boolean).join(" · ")}</div></div>
                <span className="text-xs text-gray-500 font-mono">{st.done}/{st.total} done</span>
                {c.link && <a href={c.link} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-[#F26B21]"><ExternalLink className="h-4 w-4" /></a>}
                {can && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCourse(c)}><Pencil className="h-3.5 w-3.5 text-gray-500" /></Button>}
                <RowDeleteControls kit={delCourse} row={c} />
              </li>); })}</ul>
          )}
        </CardContent></Card>
      ))}
      <PlanDialog open={!!planOpen} preset={planOpen} onClose={() => setPlanOpen(null)} people={(m?.people || []).map((p) => ({ id: p.id, name: p.name }))} courses={courses || []} onSaved={reloadP} />
      <CourseDialog open={course !== undefined} course={course} onClose={() => setCourse(undefined)} onSaved={reloadC} />
    </HRLayout>
  );
}

// ============================================================ Knowledge transfer
const KT_TONE = { planned: "gray", in_progress: "blue", completed: "amber", signed_off: "green" };

function KTSheet({ id, onClose, onChanged }) {
  const { user } = useAuth();
  const team = useTeam();
  const [k, setK] = useState(null);
  const [item, setItem] = useState("");
  const [sess, setSess] = useState({ date: localISO(), duration_min: 60, notes: "", recording_link: "" });
  const [doc, setDoc] = useState({ title: "", url: "" });
  const load = () => api.get(`/hr/kt/${id}`).then((r) => setK(r.data)).catch((e) => { toast.error(apiError(e)); onClose(); });
  useEffect(() => { setK(null); if (id) load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const call = async (fn) => { try { const { data } = await fn(); setK(data); onChanged(); } catch (e) { toast.error(apiError(e)); } };
  const receiver = k && (k.to_ids || []).includes(user?.id);
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col" data-testid="kt-sheet">
        {!k ? <Spinner /> : (
          <>
            <SheetHeader className="p-5 pb-3 border-b border-gray-100 text-left">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#F26B21]">Knowledge transfer</div>
              <SheetTitle className="text-lg">{k.topic}</SheetTitle>
              <div className="text-xs text-gray-500">{k.from_name} → {k.to_names?.join(", ") || "nobody yet"}{k.due_date ? ` · by ${fmtDate(k.due_date)}` : ""} · {k.hours}h of sessions</div>
              <div className="flex items-center gap-3 pt-1"><div className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-violet-500" style={{ width: `${k.progress}%` }} /></div>
                <Pill tone={KT_TONE[k.status]}>{k.status_label}</Pill></div>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {k.scope && <p className="text-sm text-gray-600">{k.scope}</p>}
              <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">To hand over</div>
                <ul className="space-y-1.5">{k.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-2.5 rounded-lg border border-gray-100 px-3 py-2"><Checkbox checked={i.done} onCheckedChange={() => call(() => api.post(`/hr/kt/${id}/items/${i.id}/toggle`))} data-testid={`kt-item-${i.id}`} />
                    <span className={`text-sm ${i.done ? "line-through text-gray-400" : "text-gray-800"}`}>{i.title}</span></li>))}</ul>
                <div className="flex gap-2 mt-2"><Input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Add an item (a client, a process, a login…)" />
                  <Button variant="outline" onClick={() => item.trim() && call(() => api.post(`/hr/kt/${id}/items`, { title: item })).then(() => setItem(""))}>Add</Button></div></div>
              <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">Sessions</div>
                {k.sessions.length ? <ul className="space-y-2">{k.sessions.map((s) => (
                  <li key={s.id} className="rounded-lg border border-gray-100 px-3 py-2 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-medium text-gray-800"><PlayCircle className="inline h-3.5 w-3.5 mr-1 text-violet-500" />{fmtDate(s.date)} · {s.duration_min} min</span><span className="text-xs text-gray-400">{s.logged_by}</span></div>
                    {s.notes && <p className="text-xs text-gray-600 mt-1">{s.notes}</p>}{s.recording_link && <a href={s.recording_link} target="_blank" rel="noreferrer" className="text-xs text-[#F26B21] font-semibold">Recording →</a>}</li>))}</ul> : <p className="text-xs text-gray-400">No sessions logged yet.</p>}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                  <Input type="date" value={sess.date} onChange={(e) => setSess((x) => ({ ...x, date: e.target.value }))} />
                  <Input type="number" value={sess.duration_min} onChange={(e) => setSess((x) => ({ ...x, duration_min: e.target.value }))} placeholder="Minutes" />
                  <Input className="col-span-2" value={sess.recording_link} onChange={(e) => setSess((x) => ({ ...x, recording_link: e.target.value }))} placeholder="Recording link (optional)" />
                  <Textarea className="col-span-2 sm:col-span-4" rows={2} value={sess.notes} onChange={(e) => setSess((x) => ({ ...x, notes: e.target.value }))} placeholder="What was covered" />
                </div>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => call(() => api.post(`/hr/kt/${id}/sessions`, { ...sess, duration_min: Number(sess.duration_min) || 60 })).then(() => setSess({ date: localISO(), duration_min: 60, notes: "", recording_link: "" }))} data-testid="kt-log-session">Log session</Button></div>
              <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">Documents</div>
                {k.docs.map((d) => <a key={d.id} href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-gray-800 hover:text-[#F26B21] py-0.5"><Link2 className="h-3.5 w-3.5" />{d.title}</a>)}
                <div className="flex gap-2 mt-2"><Input value={doc.title} onChange={(e) => setDoc((x) => ({ ...x, title: e.target.value }))} placeholder="Title" /><Input value={doc.url} onChange={(e) => setDoc((x) => ({ ...x, url: e.target.value }))} placeholder="https://drive…" />
                  <Button variant="outline" onClick={() => doc.title && doc.url && call(() => api.post(`/hr/kt/${id}/docs`, doc)).then(() => setDoc({ title: "", url: "" }))}>Add</Button></div></div>
              <Field label="Receiving the handover"><Select value={(k.to_ids || [])[0] || "none"} onValueChange={(v) => call(() => api.put(`/hr/kt/${id}`, { to_ids: v === "none" ? [] : [v] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">— Nobody —</SelectItem>{team.filter((u) => u.id !== k.from_id).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></Field>
            </div>
            <div className="border-t border-gray-100 p-4 flex flex-wrap justify-end gap-2">
              {["planned", "in_progress"].includes(k.status) && <Button variant="outline" onClick={() => call(() => api.put(`/hr/kt/${id}`, { status: "completed" }))} data-testid="kt-complete">Handover done</Button>}
              {k.status === "completed" && <Button onClick={() => call(() => api.put(`/hr/kt/${id}`, { status: "signed_off" }))} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="kt-signoff">{receiver ? "I've got it — sign off" : "Sign off"}</Button>}
              {k.status === "signed_off" && <span className="text-xs text-emerald-700 font-semibold">Signed off by {k.signed_off_by} · {fmtDate(k.signed_off_at)}</span>}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function KTPage() {
  const [sp, setSp] = useSearchParams();
  const [meta] = useLoad("/hr/meta");
  const team = useTeam();
  const [status, setStatus] = useState("open");
  const [rows, reload] = useLoad("/hr/kt");
  const [newOpen, setNewOpen] = useState(false);
  const [f, setF] = useState({ from_id: "", to_id: "", topic: "", due_date: "", scope: "", items: "" });
  const del = useRecordDelete({ coll: "hr_kt", permKey: "hr.delete", rows: rows || [], onDeleted: reload, labelOf: (r) => r.topic });
  const openId = sp.get("open");
  const setOpen = (id) => setSp((p) => { const n = new URLSearchParams(p); if (id) n.set("open", id); else n.delete("open"); return n; });
  const shown = (rows || []).filter((r) => status === "all" || (status === "open" ? ["planned", "in_progress", "completed"].includes(r.status) : r.status === "signed_off"));
  const create = async () => {
    try {
      const { data } = await api.post("/hr/kt", { from_id: f.from_id, to_ids: f.to_id ? [f.to_id] : [], topic: f.topic, due_date: f.due_date || null, scope: f.scope,
        items: f.items.split("\n").map((x) => x.trim()).filter(Boolean) });
      toast.success("Handover plan created"); setNewOpen(false); reload(); setOpen(data.id);
    } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <HRLayout title="Knowledge transfer" subtitle="Handover plans when someone leaves, changes role or goes on long leave — so nothing lives in one person's head."
      actions={meta?.can_manage && <Button size="sm" onClick={() => { setF({ from_id: "", to_id: "", topic: "", due_date: "", scope: "", items: "" }); setNewOpen(true); }} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="new-kt-btn"><Plus className="h-3.5 w-3.5 mr-1.5" /> New handover</Button>}>
      <div className="flex items-center gap-2"><PillTabs tabs={[["open", "Open"], ["signed_off", "Signed off"], ["all", "All"]]} value={status} onChange={setStatus} testid="kt-status" /><span className="ml-auto">{del.dialog}</span></div>
      {!rows ? <Spinner /> : shown.length === 0 ? <Card><Empty icon={Repeat2} title="No handovers here" sub="Offboarding opens one automatically; you can also start one for role changes or long leave." /></Card> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{shown.map((k) => (
          <Card key={k.id} className="border-gray-200/80 shadow-sm hover:border-violet-300 cursor-pointer" onClick={() => setOpen(k.id)} data-testid={`kt-card-${k.id}`}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2"><div className="font-semibold text-gray-900">{k.topic}</div><div className="flex items-center gap-1"><Pill tone={KT_TONE[k.status]}>{k.status_label}</Pill><RowDeleteControls kit={del} row={k} /></div></div>
              <div className="text-xs text-gray-500">{k.from_name} → {k.to_names?.join(", ") || "—"}{k.due_date ? ` · by ${fmtDate(k.due_date, { day: "numeric", month: "short" })}` : ""}</div>
              <div className="flex items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-violet-500" style={{ width: `${k.progress}%` }} /></div><span className="text-xs font-mono text-gray-500">{k.progress}%</span></div>
              <div className="text-[11px] text-gray-400">{k.items.length} items · {k.sessions.length} sessions · {k.docs.length} docs</div>
            </CardContent>
          </Card>))}</div>
      )}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md" data-testid="kt-dialog"><DialogHeader><DialogTitle>New knowledge transfer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Topic"><Input value={f.topic} onChange={(e) => setF((x) => ({ ...x, topic: e.target.value }))} placeholder="e.g. Handover of Skyline Realty account" data-testid="kt-topic" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From"><PersonPick value={f.from_id} onChange={(v) => setF((x) => ({ ...x, from_id: v }))} team={team} testid="kt-from" /></Field>
              <Field label="To"><PersonPick value={f.to_id} onChange={(v) => setF((x) => ({ ...x, to_id: v }))} team={team.filter((u) => u.id !== f.from_id)} allowNone /></Field>
            </div>
            <Field label="Finish by"><Input type="date" value={f.due_date} onChange={(e) => setF((x) => ({ ...x, due_date: e.target.value }))} /></Field>
            <Field label="Items to hand over (one per line)"><Textarea rows={4} value={f.items} onChange={(e) => setF((x) => ({ ...x, items: e.target.value }))} /></Field>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button><Button onClick={create} disabled={!f.from_id || !f.topic.trim()} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="kt-create">Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <KTSheet id={openId} onClose={() => setOpen(null)} onChanged={reload} />
    </HRLayout>
  );
}
