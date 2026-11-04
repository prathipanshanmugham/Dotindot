import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useLoad, Spinner, PageHead, PillTabs, Pill, Field, Empty, inr, fmtDate, monthLabel, download } from "@/components/kit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Download, FileText, Repeat2, LifeBuoy, ClipboardList, Wallet } from "lucide-react";

export default function MyHRPage() {
  const [tab, setTab] = useState("payslips");
  const [pay] = useLoad("/me/payslips");
  const [me, reloadMe] = useLoad("/me/hr");
  const [kt] = useLoad("/me/kt");
  const [onb] = useLoad("/hr/onboarding", { status: "in_progress" });
  const [off] = useLoad("/hr/offboarding", { status: "in_progress" });
  const [f, setF] = useState(null);
  useEffect(() => { if (me) setF(me); }, [me]);
  const save = async () => {
    try {
      await api.put("/me/hr", Object.fromEntries(me.self_fields.map((k) => [k, f[k]])));
      toast.success("Your details are saved"); reloadMe();
    } catch (e) { toast.error(apiError(e)); }
  };
  const myTasks = [...(onb || []).map((d) => ({ ...d, kind: "onboarding" })), ...(off || []).map((d) => ({ ...d, kind: "offboarding" }))]
    .flatMap((d) => (d.tasks || []).filter((t) => !t.done && t.assignee_id === me?.id).map((t) => ({ ...t, process: d })));
  const myProcesses = [...(onb || []).map((d) => ({ ...d, kind: "onboarding" })), ...(off || []).map((d) => ({ ...d, kind: "offboarding" }))].filter((d) => d.user_id === me?.id);
  const inp = (k, label, type = "text") => <Field key={k} label={label}><Input type={type} value={f?.[k] || ""} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} data-testid={`me-${k}`} /></Field>;
  return (
    <div className="space-y-5 max-w-5xl" data-testid="my-hr-page">
      <PageHead kicker="Me" title="My HR" sub="Your payslips, your details on file, handovers and HR tasks." />
      <PillTabs tabs={[["payslips", "Payslips"], ["details", "My details"], ["work", "Handovers & tasks", (kt || []).filter((k) => k.status !== "signed_off").length + myTasks.length + myProcesses.length]]} value={tab} onChange={setTab} testid="myhr-tab" />
      {tab === "payslips" && (!pay ? <Spinner /> : (
        <>
          {pay.ctc_annual ? <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-4 flex items-center gap-3"><Wallet className="h-5 w-5 text-[#F26B21]" />
            <div><div className="text-sm text-gray-500">Annual CTC</div><div className="text-lg font-bold font-mono">{inr(pay.ctc_annual)}</div></div>
            <div className="ml-auto text-xs text-gray-400">since {fmtDate(pay.effective_from)}</div></CardContent></Card> : null}
          <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-0">
            {pay.payslips.length === 0 ? <Empty icon={FileText} title="No payslips yet" sub="They appear here once payroll for the month is finalised." /> : (
              <ul className="divide-y divide-gray-100" data-testid="my-payslips">{pay.payslips.map((p) => (
                <li key={p.id} className="px-4 py-3 flex items-center gap-3">
                  <FileText className="h-4 w-4 text-[#F26B21] shrink-0" />
                  <div className="min-w-0 flex-1"><div className="font-medium text-gray-900">{p.label}</div><div className="text-xs text-gray-500">{p.paid_days} paid days · gross {inr(p.gross)} · deductions {inr(p.total_deductions)}</div></div>
                  <div className="text-right"><div className="font-mono font-semibold">{inr(p.net)}</div><Pill tone={p.status === "paid" ? "green" : "blue"}>{p.status === "paid" ? `paid ${fmtDate(p.paid_on, { day: "numeric", month: "short" })}` : "final"}</Pill></div>
                  <Button size="sm" variant="outline" onClick={() => download(`/me/payslips/${p.id}/pdf`, `payslip-${p.month}.pdf`)} data-testid={`my-payslip-pdf-${p.month}`}><Download className="h-3.5 w-3.5" /></Button>
                </li>))}</ul>
            )}
          </CardContent></Card>
          {pay.variable_pay?.length > 0 && <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">Incentives & bonuses</CardTitle></CardHeader>
            <CardContent className="pt-0">{pay.variable_pay.map((v, i) => <div key={i} className="flex justify-between text-sm py-1.5 border-b border-gray-50 last:border-0"><span>{v.title} <span className="text-xs text-gray-400">· {monthLabel(v.month)}</span></span><span className="font-mono">{inr(v.amount)}</span></div>)}</CardContent></Card>}
          <p className="text-xs text-gray-400">Need a salary certificate or a correction? <Link to="/support" className="text-[#F26B21] font-semibold">Raise an HR request</Link>.</p>
        </>
      ))}
      {tab === "details" && (!f ? <Spinner /> : (
        <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div><div className="text-xs text-gray-400">Employee code</div><div className="font-semibold">{f.employee_code || "—"}</div></div>
            <div><div className="text-xs text-gray-400">Reports to</div><div className="font-semibold">{f.manager_name || "—"}</div></div>
            <div><div className="text-xs text-gray-400">Joined</div><div className="font-semibold">{fmtDate(f.join_date)}</div></div>
            <div><div className="text-xs text-gray-400">Bank on file</div><div className="font-semibold">{f.bank_name ? `${f.bank_name} ${f.bank_account_masked || ""}` : "—"}</div></div>
            <div><div className="text-xs text-gray-400">PAN</div><div className="font-semibold font-mono">{f.pan_masked || "—"}</div></div>
            <div><div className="text-xs text-gray-400">UAN</div><div className="font-semibold font-mono">{f.uan_masked || "—"}</div></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {inp("phone", "Phone")}{inp("personal_email", "Personal email")}{inp("date_of_birth", "Date of birth", "date")}{inp("blood_group", "Blood group")}
            <Field label="Current address" className="sm:col-span-2"><Textarea rows={2} value={f.address_current || ""} onChange={(e) => setF((x) => ({ ...x, address_current: e.target.value }))} /></Field>
            <div className="sm:col-span-2 text-xs font-bold uppercase tracking-widest text-gray-400 pt-1">Emergency contact</div>
            {["name", "relation", "phone"].map((k) => <Field key={k} label={k[0].toUpperCase() + k.slice(1)}><Input value={f.emergency_contact?.[k] || ""} onChange={(e) => setF((x) => ({ ...x, emergency_contact: { ...(x.emergency_contact || {}), [k]: e.target.value } }))} data-testid={`me-ec-${k}`} /></Field>)}
          </div>
          <p className="text-xs text-gray-400">Bank, PAN and job details are updated by HR — raise a request if they're wrong.</p>
          <div className="flex justify-end"><Button onClick={save} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="me-save">Save my details</Button></div>
        </CardContent></Card>
      ))}
      {tab === "work" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {myProcesses.map((d) => (
            <Link key={d.id} to={`/hr/${d.kind}?open=${d.id}`} className="md:col-span-2 block" data-testid={`my-process-${d.kind}`}>
              <Card className="border-orange-200 bg-[#FFF7ED]/50 shadow-sm hover:border-[#F26B21] transition-colors"><CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2"><span className="font-semibold text-gray-900">{d.kind === "onboarding" ? "Your onboarding" : "Your exit checklist"}</span><span className="text-sm font-mono text-[#F26B21] font-semibold">{d.progress}%</span></div>
                <div className="h-2 rounded-full bg-white overflow-hidden"><div className="h-full bg-[#F26B21] rounded-full" style={{ width: `${d.progress}%` }} /></div>
                <p className="text-xs text-gray-500">{d.tasks_done} of {d.tasks_total} steps done{d.kind === "onboarding" && d.manager_name ? ` · your manager: ${d.manager_name}` : ""}{d.kind === "offboarding" && d.last_working_day ? ` · last working day ${fmtDate(d.last_working_day)}` : ""}</p>
              </CardContent></Card>
            </Link>
          ))}
          <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-1"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Repeat2 className="h-4 w-4 text-violet-500" /> My handovers</CardTitle></CardHeader>
            <CardContent className="pt-0">{!kt ? <Spinner className="h-20" /> : kt.length === 0 ? <p className="text-xs text-gray-400 py-2">None.</p> : kt.map((k) => (
              <Link key={k.id} to={`/hr/kt?open=${k.id}`} className="flex items-center justify-between gap-2 py-2 border-b border-gray-50 last:border-0 text-sm hover:text-[#F26B21]">
                <span>{k.topic}<span className="block text-xs text-gray-400">{k.from_name} → {k.to_names?.join(", ")}</span></span><Pill>{k.status_label}</Pill></Link>))}</CardContent></Card>
          <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-1"><CardTitle className="text-sm font-semibold flex items-center gap-2"><ClipboardList className="h-4 w-4 text-[#F26B21]" /> My HR tasks</CardTitle></CardHeader>
            <CardContent className="pt-0">{myTasks.length === 0 ? <p className="text-xs text-gray-400 py-2">Nothing assigned to you.</p> : myTasks.map((t) => (
              <Link key={t.id} to={`/hr/${t.process.kind}?open=${t.process.id}`} className="block py-2 border-b border-gray-50 last:border-0 text-sm hover:text-[#F26B21]">
                {t.title}<span className="block text-xs text-gray-400">{t.process.kind} · {t.process.user_name} · due {fmtDate(t.due_date, { day: "numeric", month: "short" })}</span></Link>))}</CardContent></Card>
          <Card className="border-gray-200/80 shadow-sm md:col-span-2"><CardContent className="p-4 flex items-center gap-3"><LifeBuoy className="h-5 w-5 text-[#F26B21]" />
            <span className="text-sm text-gray-700">Leave letters, salary certificates, payslip corrections, laptop or tool access —</span>
            <Link to="/support" className="text-sm font-semibold text-[#F26B21]">raise a request →</Link></CardContent></Card>
        </div>
      )}
    </div>
  );
}
