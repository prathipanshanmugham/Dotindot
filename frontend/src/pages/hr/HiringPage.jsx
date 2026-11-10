import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useLoad, Spinner, Empty, Pill, PillTabs, Field, Avatar, ago, fmtDate, fmtDateTime, download } from "@/components/kit";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ExternalLink, Briefcase, Users, Search, FileText, Mail, Phone, MapPin, Link2, Star, MessageCircle, CalendarClock } from "lucide-react";
import HRLayout from "./HRLayout";
import { siteUrl } from "@/pages/website/websiteKit";

const ORANGE = "bg-[#F26B21] hover:bg-[#E05A10] text-white";
const JOB_TONE = { open: "green", draft: "gray", closed: "amber" };
const APP_TONE = { new: "blue", shortlisted: "violet", interview: "amber", offer: "orange", hired: "green", rejected: "gray" };
const WHOLE = "__company";
const HINT = "## Heading · - bullet list · **bold** · [link text](https://…) · a blank line starts a new paragraph";
const STATUS_HELP = { draft: "Only here, not on the website", open: "On the careers page, taking applications", closed: "Off the website; applications are kept" };

const published = (pub, ok) => {
  if (pub?.status === "error") toast.error(`Saved, but the website wasn't updated: ${pub.error || "the build failed"}`);
  else toast.success(ok);
};

/* ------------------------------------------------------------------ job form */
const JobDialog = ({ job, meta, onClose, onSaved }) => {
  const [branches] = useLoad("/locations/branch-options");
  const [f, setF] = useState(() => ({
    title: job?.title || "", department: job?.department || "", branch_id: job ? job.branch_id || WHOLE : meta.branch_limited ? "" : WHOLE,
    location: job?.location || "", work_mode: job?.work_mode || "onsite", employment_type: job?.employment_type || "full_time",
    experience: job?.experience || "", openings: String(job?.openings || 1), summary: job?.summary || "", description: job?.description || "",
    skills: (job?.skills || []).join(", "), salary_min: job?.salary_min ?? "", salary_max: job?.salary_max ?? "", salary_currency: job?.salary_currency || "INR",
    salary_period: job?.salary_period || "month", show_salary: !!job?.show_salary, closes_on: job?.closes_on || "", status: job?.status || "open",
  }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const branchValue = f.branch_id || (meta.branch_limited ? branches?.[0]?.id || "" : WHOLE);
  const save = async (e) => {
    e.preventDefault();
    for (const [k, l] of [["title", "a job title"], ["summary", "a one-line summary"], ["description", "a description"]]) if (!f[k].trim()) return toast.error(`Add ${l}`);
    const num = (v) => (v === "" || v === null ? null : Number(v));
    const body = {
      ...f, branch_id: branchValue === WHOLE ? null : branchValue, openings: Number(f.openings) || 1,
      salary_min: num(f.salary_min), salary_max: num(f.salary_max), skills: f.skills.split(",").map((s) => s.trim()).filter(Boolean),
    };
    setBusy(true);
    try {
      const r = job ? await api.put(`/hr/jobs/${job.id}`, body) : await api.post("/hr/jobs", body);
      const pub = r.data.publish;
      published(pub, f.status === "open" ? (job ? "Saved. The careers page is updated." : "Job posted on the careers page") : job ? "Saved" : "Draft saved");
      onSaved();
    } catch (err) { toast.error(apiError(err)); setBusy(false); }
  };
  const skills = f.skills.split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="job-dialog">
        <DialogHeader>
          <DialogTitle>{job ? "Edit job" : "New job"}</DialogTitle>
          <DialogDescription>Open jobs appear on dotindot.in/careers with their own page and an apply form, and in Google's job listings.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <Field label="Job title"><Input value={f.title} onChange={set("title")} maxLength={120} placeholder="e.g. Performance marketer" data-testid="job-title" /></Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Team"><Input value={f.department} onChange={set("department")} maxLength={60} placeholder="e.g. Marketing, Content, Engineering" /></Field>
            <Field label="Branch">
              <Select value={branchValue} onValueChange={(v) => setF((s) => ({ ...s, branch_id: v }))}>
                <SelectTrigger data-testid="job-branch"><SelectValue placeholder="Pick a branch" /></SelectTrigger>
                <SelectContent>
                  {!meta.branch_limited && <SelectItem value={WHOLE}>Whole company</SelectItem>}
                  {(branches || []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="Where">
              <Select value={f.work_mode} onValueChange={set("work_mode")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(meta.work_modes).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Type">
              <Select value={f.employment_type} onValueChange={set("employment_type")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(meta.types).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Experience"><Input value={f.experience} onChange={set("experience")} maxLength={40} placeholder="e.g. 2–4 years" /></Field>
            <Field label="Openings"><Input type="number" min={1} max={100} value={f.openings} onChange={set("openings")} /></Field>
          </div>
          <Field label="Location shown" hint={f.work_mode === "remote" ? "e.g. Remote, India" : "Leave blank to use the branch's city"}>
            <Input value={f.location} onChange={set("location")} maxLength={100} placeholder={f.work_mode === "remote" ? "Remote, India" : "e.g. Erode, Tamil Nadu"} />
          </Field>
          <Field label={<span className="flex justify-between gap-2">One-line summary <span className="text-[11px] text-gray-400">{f.summary.length}/300</span></span>} hint="Shown on the careers page under the title.">
            <Textarea value={f.summary} onChange={set("summary")} rows={2} maxLength={300} placeholder="You've run Meta and Google campaigns to a cost per customer and can explain why it moved." data-testid="job-summary" />
          </Field>
          <Field label="Description" hint={HINT}>
            <Textarea value={f.description} onChange={set("description")} rows={12} maxLength={20000} className="font-mono text-[13px] leading-relaxed" data-testid="job-description"
              placeholder={"## What you'll do\n- …\n\n## What you bring\n- …\n\n## What we offer\n- …"} />
          </Field>
          <Field label="Skills" hint="Separate with commas. Shown as tags and sent to Google.">
            <Input value={f.skills} onChange={set("skills")} placeholder="Meta Ads, Google Ads, GA4" />
            {skills.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{skills.slice(0, 15).map((s) => <Pill key={s} tone="gray">{s}</Pill>)}</div>}
          </Field>
          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="text-sm font-semibold text-gray-800">Salary <span className="font-normal text-gray-400">(optional)</span></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="From"><Input type="number" min={0} value={f.salary_min} onChange={set("salary_min")} placeholder="25000" /></Field>
              <Field label="To"><Input type="number" min={0} value={f.salary_max} onChange={set("salary_max")} placeholder="40000" /></Field>
              <Field label="Currency">
                <Select value={f.salary_currency} onValueChange={set("salary_currency")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{meta.currencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Per">
                <Select value={f.salary_period} onValueChange={set("salary_period")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="month">Month</SelectItem><SelectItem value="year">Year</SelectItem></SelectContent>
                </Select>
              </Field>
            </div>
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <Switch checked={f.show_salary} onCheckedChange={(v) => setF((s) => ({ ...s, show_salary: v }))} />
              <span className="text-gray-700">Show the salary on the website</span>
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Status" hint={STATUS_HELP[f.status]}>
              <Select value={f.status} onValueChange={set("status")}>
                <SelectTrigger data-testid="job-status"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(meta.statuses).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Applications close" hint="Optional. The job comes off the website after this day."><Input type="date" value={f.closes_on} onChange={set("closes_on")} /></Field>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy} className={ORANGE} data-testid="job-save">{busy ? "Saving…" : f.status === "open" ? "Save and publish" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const Confirm = ({ title, text, action = "Delete", onClose, onConfirm }) => {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{text}</DialogDescription></DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="destructive" disabled={busy} data-testid="hiring-confirm"
            onClick={async () => { setBusy(true); try { await onConfirm(); } catch (e) { toast.error(apiError(e)); setBusy(false); } }}>{busy ? "Working…" : action}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ------------------------------------------------------------------ jobs */
const JobsTab = ({ data, reload, onApplications, onEdit }) => {
  const [show, setShow] = useState("open");
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(null);
  const jobs = data.jobs.filter((j) => show === "all" || j.status === show);
  const count = (s) => data.jobs.filter((j) => j.status === s).length;
  const setStatus = async (j, status) => {
    setBusy(j.id);
    try { const r = await api.put(`/hr/jobs/${j.id}`, { status }); published(r.data.publish, status === "open" ? "Job is on the careers page" : status === "closed" ? "Job closed and taken off the website" : "Moved to drafts"); reload(); }
    catch (e) { toast.error(apiError(e)); }
    setBusy(null);
  };
  return (
    <div className="space-y-4">
      <PillTabs tabs={[["open", "Open", count("open")], ["draft", "Drafts", count("draft")], ["closed", "Closed", count("closed")], ["all", "All", data.jobs.length]]} value={show} onChange={setShow} testid="jobs-show" />
      {!jobs.length ? (
        <Card className="border-gray-200/80 shadow-sm"><Empty icon={Briefcase} title={show === "open" ? "No open jobs" : "Nothing here"}
          sub={show === "open" ? "Post a job and it appears on dotindot.in/careers with an apply form. The careers page still takes general applications." : "Jobs you save as drafts or close appear here."}
          action={data.can_manage && show === "open" && <Button size="sm" className={ORANGE} onClick={() => onEdit(null)}><Plus className="h-3.5 w-3.5 mr-1.5" /> New job</Button>} /></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {jobs.map((j) => (
            <Card key={j.id} className="border-gray-200/80 shadow-sm" data-testid={`job-card-${j.id}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900 break-words">{j.title}</span>
                      <Pill tone={JOB_TONE[j.status]}>{j.status === "open" && !j.live ? "Past closing date" : data.meta.statuses[j.status]}</Pill>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{[j.department, j.location_label || j.branch_name || "Whole company", data.meta.work_modes[j.work_mode], data.meta.types[j.employment_type]]
                      .filter((x, i, a) => x && a.findIndex((y) => (y || "").toLowerCase() === x.toLowerCase()) === i).join(" · ")}</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                  <button type="button" className="inline-flex items-center gap-1.5 text-gray-700 hover:text-[#F26B21] min-h-[32px]" onClick={() => onApplications(j.id)} data-testid={`job-apps-${j.id}`}>
                    <Users className="h-4 w-4 text-gray-400" /> {j.applications} application{j.applications === 1 ? "" : "s"}
                    {j.new_applications > 0 && <Pill tone="blue">{j.new_applications} new</Pill>}
                  </button>
                  {j.closes_on && <span className="inline-flex items-center gap-1.5 text-gray-500"><CalendarClock className="h-4 w-4 text-gray-400" /> Closes {fmtDate(j.closes_on)}</span>}
                </div>
                <div className="flex flex-wrap items-center gap-1 border-t border-gray-100 pt-2.5">
                  {j.live && <Button variant="ghost" size="sm" className="text-gray-600" asChild><a href={siteUrl(`/careers/${j.slug}/`)} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> View</a></Button>}
                  {data.can_manage && <Button variant="ghost" size="sm" className="text-gray-600" onClick={() => onEdit(j)} data-testid={`job-edit-${j.id}`}><Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit</Button>}
                  {data.can_manage && j.status !== "open" && <Button variant="ghost" size="sm" className="text-emerald-700" disabled={busy === j.id} onClick={() => setStatus(j, "open")}>Publish</Button>}
                  {data.can_manage && j.status === "open" && <Button variant="ghost" size="sm" className="text-amber-700" disabled={busy === j.id} onClick={() => setStatus(j, "closed")} data-testid={`job-close-${j.id}`}>Close</Button>}
                  {data.can_delete && <Button variant="ghost" size="icon" className="h-9 w-9 ml-auto text-gray-400 hover:text-red-600" onClick={() => setDel(j)} aria-label="Delete job"><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {del && <Confirm title="Delete this job?" text={`“${del.title}” comes off the website. Its ${del.applications} application${del.applications === 1 ? "" : "s"} stay under Applications. You can restore the job from the recycle bin for 24 hours.`}
        onClose={() => setDel(null)} onConfirm={async () => { const r = await api.delete(`/hr/jobs/${del.id}`); setDel(null); published(r.data.publish, "Job deleted"); reload(); }} />}
    </div>
  );
};

/* ------------------------------------------------------------------ applications */
const Stars = ({ value, onChange, disabled }) => (
  <div className="flex items-center" role="radiogroup" aria-label="Rating">
    {[1, 2, 3, 4, 5].map((n) => (
      <button key={n} type="button" disabled={disabled} onClick={() => onChange(n === value ? 0 : n)} aria-label={`${n} star${n > 1 ? "s" : ""}`} aria-checked={n === value} role="radio"
        className="h-9 w-8 grid place-items-center disabled:cursor-default">
        <Star className={`h-4 w-4 ${n <= value ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
      </button>
    ))}
  </div>
);

const ApplicationDialog = ({ id, meta, canManage, canDelete, onClose, onChanged }) => {
  const [a, reload] = useLoad(`/hr/jobs/applications/${id}`);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const save = async (body, msg) => {
    setBusy(true);
    try { await api.put(`/hr/jobs/applications/${id}`, body); if (msg) toast.success(msg); await reload(); onChanged(); }
    catch (e) { toast.error(apiError(e)); }
    setBusy(false);
  };
  const wa = a?.phone ? a.phone.replace(/\D/g, "") : "";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="application-dialog">
        {!a ? <Spinner className="h-48" /> : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">{a.name} <Pill tone={APP_TONE[a.status]}>{meta.app_statuses[a.status]}</Pill></DialogTitle>
              <DialogDescription>{a.job_title} · applied {fmtDateTime(a.created_at)}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-2 text-sm">
                <a href={`mailto:${a.email}`} className="flex items-center gap-2 min-h-[36px] text-gray-700 hover:text-[#F26B21] break-all"><Mail className="h-4 w-4 text-gray-400 shrink-0" />{a.email}</a>
                <span className="flex items-center gap-2 min-h-[36px] text-gray-700">
                  <Phone className="h-4 w-4 text-gray-400 shrink-0" /><a href={`tel:${a.phone}`} className="hover:text-[#F26B21]">{a.phone}</a>
                  {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-emerald-700 hover:underline">WhatsApp</a>}
                </span>
                {a.city && <span className="flex items-center gap-2 min-h-[36px] text-gray-700"><MapPin className="h-4 w-4 text-gray-400 shrink-0" />{a.city}</span>}
                {a.experience && <span className="flex items-center gap-2 min-h-[36px] text-gray-700"><Briefcase className="h-4 w-4 text-gray-400 shrink-0" />{a.experience}</span>}
                {a.link && <a href={a.link} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-2 min-h-[36px] text-gray-700 hover:text-[#F26B21] break-all sm:col-span-2"><Link2 className="h-4 w-4 text-gray-400 shrink-0" />{a.link.replace(/^https?:\/\/(www\.)?/, "")}</a>}
              </div>
              {a.cv && (
                <button type="button" onClick={() => download(`/hr/jobs/applications/${id}/cv`, a.cv.name)} data-testid="cv-download"
                  className="w-full flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-left hover:border-[#F26B21] hover:bg-orange-50/40 transition-colors">
                  <span className="h-10 w-10 rounded-lg bg-[#FFF7ED] text-[#F26B21] grid place-items-center shrink-0"><FileText className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-gray-900 truncate">{a.cv.name}</span><span className="block text-xs text-gray-500">{a.cv.type?.toUpperCase()} · {Math.max(1, Math.round((a.cv.size || 0) / 1024))} KB · download</span></span>
                </button>
              )}
              {a.note && <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700 whitespace-pre-wrap break-words">{a.note}</div>}
              <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
                <Field label="Status">
                  <Select value={a.status} onValueChange={(v) => save({ status: v }, `Moved to ${meta.app_statuses[v]}`)} disabled={!canManage || busy}>
                    <SelectTrigger data-testid="application-status"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(meta.app_statuses).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Rating"><Stars value={a.rating || 0} onChange={(n) => save({ rating: n })} disabled={!canManage || busy} /></Field>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-gray-800">Notes</div>
                {canManage && (
                  <div className="flex gap-2 items-start">
                    <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={3000} placeholder="Interview feedback, next steps…" className="min-w-0" data-testid="application-note" />
                    <Button type="button" variant="outline" disabled={busy || !note.trim()} onClick={async () => { await save({ note }); setNote(""); }}>Add</Button>
                  </div>
                )}
                {!(a.notes || []).length ? <p className="text-xs text-gray-400">No notes yet.</p> : (
                  <ol className="space-y-2">
                    {[...a.notes].reverse().map((n) => (
                      <li key={n.id} className={`text-sm rounded-lg px-3 py-2 ${n.kind === "status" ? "text-gray-500 bg-gray-50" : "text-gray-800 bg-white border border-gray-200"}`}>
                        <div className="whitespace-pre-wrap break-words">{n.text}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{n.by_name || "Website"} · {ago(n.at)}</div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              {(a.other_applications || []).length > 0 && (
                <div className="text-xs text-gray-500">Also applied for: {a.other_applications.map((o) => `${o.job_title} (${meta.app_statuses[o.status]}, ${fmtDate(o.created_at)})`).join(" · ")}</div>
              )}
            </div>
            <DialogFooter className="gap-2">
              {canDelete && <Button variant="ghost" className="text-red-600 sm:mr-auto" onClick={() => setDel(true)}><Trash2 className="h-4 w-4 mr-1.5" /> Delete</Button>}
              <Button variant="outline" onClick={onClose}>Close</Button>
            </DialogFooter>
            {del && <Confirm title="Delete this application?" text={`${a.name}'s application and CV are removed. You can restore it from the recycle bin for 24 hours.`}
              onClose={() => setDel(false)} onConfirm={async () => { await api.delete(`/hr/jobs/applications/${id}`); toast.success("Application deleted"); onChanged(); onClose(); }} />}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

const ApplicationsTab = ({ data, jobId, setJobId, openId, setOpenId, reloadJobs }) => {
  const [status, setStatus] = useState(data.new_total ? "new" : "all");
  const [q, setQ] = useState("");
  const params = useMemo(() => ({ job_id: jobId || undefined, status: status === "all" ? undefined : status, q: q.trim() || undefined }), [jobId, status, q]);
  const [res, reload] = useLoad("/hr/jobs/applications", params);
  const counts = res?.counts || {};
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const st = data.meta.app_statuses;
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center">
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone, city" className="pl-9" />
        </div>
        <Select value={jobId || "all"} onValueChange={(v) => setJobId(v === "all" ? "" : v)}>
          <SelectTrigger className="sm:w-64" data-testid="applications-job"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All jobs</SelectItem>
            <SelectItem value="general">General applications ({data.general_applications})</SelectItem>
            {data.jobs.map((j) => <SelectItem key={j.id} value={j.id}>{j.title}{j.status !== "open" ? ` (${data.meta.statuses[j.status].toLowerCase()})` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <PillTabs tabs={[...Object.entries(st).map(([k, l]) => [k, l, counts[k] || 0]), ["all", "All", total]]} value={status} onChange={setStatus} testid="applications-status" />
      {!res ? <Spinner className="h-40" /> : !res.rows.length ? (
        <Card className="border-gray-200/80 shadow-sm"><Empty icon={Users} title={total ? "No one at this stage" : "No applications yet"}
          sub={total ? "Pick another stage above." : "When people apply on dotindot.in/careers, their details and CV appear here."} /></Card>
      ) : (
        <Card className="border-gray-200/80 shadow-sm overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {res.rows.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setOpenId(r.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-orange-50/40" data-testid={`application-row-${r.id}`}>
                  <Avatar name={r.name} size={9} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900 truncate">{r.name}</span>
                      <Pill tone={APP_TONE[r.status]}>{st[r.status]}</Pill>
                      {r.rating > 0 && <span className="inline-flex items-center gap-0.5 text-xs text-amber-600"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{r.rating}</span>}
                    </span>
                    <span className="block text-xs text-gray-500 truncate mt-0.5">{[r.job_title, r.city, r.experience].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="hidden sm:flex items-center gap-2 text-xs text-gray-400 shrink-0">{r.cv && <FileText className="h-3.5 w-3.5" />}{r.note && <MessageCircle className="h-3.5 w-3.5" />}{ago(r.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {openId && <ApplicationDialog id={openId} meta={data.meta} canManage={data.can_manage} canDelete={data.can_delete} onClose={() => setOpenId(null)} onChanged={() => { reload(); reloadJobs(); }} />}
    </div>
  );
};

/* ------------------------------------------------------------------ page */
export default function HiringPage() {
  const [data, reload] = useLoad("/hr/jobs");
  const [sp, setSp] = useSearchParams();
  const [edit, setEdit] = useState(undefined);
  const tab = sp.get("tab") === "applications" ? "applications" : "jobs";
  const setParam = (patch) => setSp((p) => {
    const n = new URLSearchParams(p);
    Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k)));
    return n;
  }, { replace: true });
  return (
    <HRLayout title="Hiring" subtitle="Jobs on dotindot.in/careers and the people who apply"
      actions={data?.can_manage && <Button size="sm" onClick={() => setEdit(null)} className={ORANGE} data-testid="new-job-btn"><Plus className="h-3.5 w-3.5 mr-1.5" /> New job</Button>}>
      {!data ? <Spinner /> : (
        <div className="space-y-4" data-testid="hiring-page">
          <div className="flex flex-wrap items-center gap-2">
            <PillTabs tabs={[["jobs", "Jobs", data.jobs.length], ["applications", data.new_total ? `Applications · ${data.new_total} new` : "Applications"]]} value={tab}
              onChange={(v) => setParam({ tab: v === "applications" ? "applications" : "", job: "", open: "" })} testid="hiring-tab" />
            <Button variant="ghost" size="sm" className="ml-auto text-gray-500" asChild><a href={siteUrl("/careers/")} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Careers page</a></Button>
          </div>
          {tab === "jobs"
            ? <JobsTab data={data} reload={reload} onEdit={setEdit} onApplications={(id) => setParam({ tab: "applications", job: id })} />
            : <ApplicationsTab data={data} jobId={sp.get("job") || ""} setJobId={(v) => setParam({ job: v })} openId={sp.get("open")} setOpenId={(v) => setParam({ open: v })} reloadJobs={reload} />}
        </div>
      )}
      {edit !== undefined && data && <JobDialog job={edit} meta={data.meta} onClose={() => setEdit(undefined)} onSaved={() => { setEdit(undefined); reload(); }} />}
    </HRLayout>
  );
}
