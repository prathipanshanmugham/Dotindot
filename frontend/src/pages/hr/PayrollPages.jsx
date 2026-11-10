import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import HRLayout from "@/pages/hr/HRLayout";
import { useLoad, Spinner, Stat, PillTabs, Pill, Field, Empty, inr, fmtDate, localISO, monthLabel, thisMonth, download } from "@/components/kit";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar } from "@/components/RecordDelete";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { IndianRupee, Users, Landmark, ShieldCheck, Download, FileSpreadsheet, RefreshCw, Lock, Unlock, CheckCircle2, AlertTriangle, Plus, Calculator, Wallet, Trophy, Percent, Pencil, X } from "lucide-react";
import { CardTable } from "@/components/ui/table";

const RUN_TONE = { draft: "amber", finalised: "blue", paid: "green" };
const ITEM_TONE = { pending: "amber", approved: "blue", paid: "green", rejected: "gray", applied: "green" };
const num = (v) => (v === "" || v == null ? 0 : Number(v));

// ============================================================ payslip
function PayslipSheet({ id, editable, onClose, onChanged }) {
  const [s, setS] = useState(null);
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setS(null);
    if (id) api.get(`/hr/payroll/payslips/${id}`).then((r) => { setS(r.data); setF({ lop_days: r.data.lop_days, tds: r.data.tds, pt: r.data.pt, extra_earnings: r.data.inputs?.extra_earnings || [], extra_deductions: r.data.inputs?.extra_deductions || [] }); }).catch((e) => toast.error(apiError(e)));
  }, [id]);
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put(`/hr/payroll/payslips/${id}`, { lop_days: num(f.lop_days), tds: num(f.tds), pt: num(f.pt), extra_earnings: f.extra_earnings, extra_deductions: f.extra_deductions });
      setS(data); onChanged(); toast.success("Payslip updated");
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const Lines = ({ title, rows, total }) => (
    <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">{title}</div>
      <table className="w-full text-sm"><tbody>
        {rows.map((r, i) => <tr key={i} className="border-b border-gray-50"><td className="py-1.5 text-gray-700">{r.name}</td><td className="py-1.5 text-right font-mono">{inr(r.amount)}</td></tr>)}
        {total != null && <tr><td className="py-1.5 font-semibold text-gray-900">Total</td><td className="py-1.5 text-right font-mono font-semibold">{inr(total)}</td></tr>}
      </tbody></table></div>
  );
  const extraRows = (k) => (
    <div className="space-y-1.5">
      {(f[k] || []).map((x, i) => (
        <div key={i} className="flex gap-2"><Input value={x.name} onChange={(e) => setF((v) => ({ ...v, [k]: v[k].map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) }))} className="h-8" />
          <Input type="number" value={x.amount} onChange={(e) => setF((v) => ({ ...v, [k]: v[k].map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)) }))} className="h-8 w-28" />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setF((v) => ({ ...v, [k]: v[k].filter((_, j) => j !== i) }))}><X className="h-3.5 w-3.5" /></Button></div>))}
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setF((v) => ({ ...v, [k]: [...(v[k] || []), { name: k === "extra_earnings" ? "Arrears" : "Recovery", amount: 0 }] }))}><Plus className="h-3 w-3 mr-1" /> Add line</Button>
    </div>
  );
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col" data-testid="payslip-sheet">
        {!s ? <Spinner /> : (
          <>
            <SheetHeader className="p-5 pb-3 border-b border-gray-100 text-left">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#F26B21]">Payslip · {monthLabel(s.month)}</div>
              <SheetTitle className="text-lg">{s.user_name}</SheetTitle>
              <div className="text-xs text-gray-500">{[s.employee_code, s.designation, s.branch_name].filter(Boolean).join(" · ")} · {s.paid_days}/{s.days_in_month} paid days{s.lop_days ? ` · ${s.lop_days} LOP` : ""}</div>
              <div className="flex items-end justify-between pt-1"><div><div className="text-xs text-gray-500">Net pay</div><div className="text-2xl font-bold font-mono text-gray-900" data-testid="payslip-net">{inr(s.net)}</div></div>
                <Button size="sm" variant="outline" onClick={() => download(`/hr/payroll/payslips/${id}/pdf`, "payslip.pdf")} data-testid="payslip-pdf"><Download className="h-3.5 w-3.5 mr-1.5" /> PDF</Button></div>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Lines title="Earnings" rows={s.earnings} total={s.gross} />
                <Lines title="Deductions" rows={s.deductions} total={s.total_deductions} />
              </div>
              {s.employer?.length > 0 && <Lines title={`Employer contributions · cost to company ${inr(s.employer_cost)}`} rows={s.employer} />}
              {editable && (
                <div className="rounded-xl border border-orange-100 bg-[#FFFBF7] p-4 space-y-3" data-testid="payslip-edit">
                  <div className="text-sm font-semibold text-gray-800">Adjust this payslip</div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Loss-of-pay days"><Input type="number" step="0.5" value={f.lop_days} onChange={(e) => setF((v) => ({ ...v, lop_days: e.target.value }))} data-testid="payslip-lop" /></Field>
                    <Field label="TDS"><Input type="number" value={f.tds} onChange={(e) => setF((v) => ({ ...v, tds: e.target.value }))} /></Field>
                    <Field label="Prof. tax"><Input type="number" value={f.pt} onChange={(e) => setF((v) => ({ ...v, pt: e.target.value }))} /></Field>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><div className="text-xs font-semibold text-gray-600 mb-1">Extra earnings</div>{extraRows("extra_earnings")}</div>
                    <div><div className="text-xs font-semibold text-gray-600 mb-1">Extra deductions</div>{extraRows("extra_deductions")}</div>
                  </div>
                  <div className="flex justify-end"><Button size="sm" onClick={save} disabled={busy} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="payslip-save">Recalculate payslip</Button></div>
                </div>
              )}
              <p className="text-[11px] text-gray-400">PF wages {inr(s.pf_wage)} · EPS wages {inr(s.eps_wage)}{s.esi_applicable ? " · ESI applies" : ""}{s.uan_masked ? ` · UAN ${s.uan_masked}` : ""}</p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============================================================ run
function RunView({ runId, meta, onBack, onChanged }) {
  const [r, reload] = useLoad(`/hr/payroll/runs/${runId}`);
  const [tab, setTab] = useState("slips");
  const [st] = useLoad(tab === "statutory" ? `/hr/payroll/runs/${runId}/statutory` : null);
  const [slip, setSlip] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ paid_on: localISO(), post_to_ledger: true });
  const can = meta?.can_manage;
  const act = async (path, body) => {
    try { await api.post(`/hr/payroll/runs/${runId}/${path}`, body || {}); await reload(); onChanged(); toast.success({ finalise: "Payroll finalised — payslips are now visible to employees", reopen: "Re-opened as draft", recalculate: "Recalculated", pay: "Marked paid" }[path]); }
    catch (e) { toast.error(apiError(e)); }
  };
  if (!r) return <Spinner />;
  const t = r.totals || {};
  return (
    <div className="space-y-4" data-testid="payroll-run">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>← All months</Button>
        <h2 className="text-lg font-bold text-gray-900">{r.label}</h2>
        <Pill tone={RUN_TONE[r.status]} data-testid="run-status">{r.status}</Pill>
        {r.paid_on && <span className="text-xs text-gray-500">paid {fmtDate(r.paid_on)}{r.ledger_txn_id ? " · in ledger" : ""}</span>}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button variant="outline" size="sm" onClick={() => download(`/hr/payroll/runs/${runId}/export`, `payroll-${r.month}.xlsx`)} data-testid="run-export"><FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> Excel</Button>
          {can && r.status === "draft" && <Button variant="outline" size="sm" onClick={() => act("recalculate")} data-testid="run-recalc"><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Recalculate</Button>}
          {can && r.status === "draft" && <Button size="sm" onClick={() => act("finalise")} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="run-finalise"><Lock className="h-3.5 w-3.5 mr-1.5" /> Finalise</Button>}
          {can && r.status === "finalised" && <Button variant="outline" size="sm" onClick={() => act("reopen")} data-testid="run-reopen"><Unlock className="h-3.5 w-3.5 mr-1.5" /> Re-open</Button>}
          {can && r.status === "finalised" && <Button size="sm" onClick={() => setPayOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="run-pay"><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Mark paid</Button>}
        </div>
      </div>
      {r.missing_structure?.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" data-testid="run-missing"><AlertTriangle className="inline h-4 w-4 mr-1" /> No salary structure yet, so not in this payroll: {r.missing_structure.map((m) => m.name).join(", ")}.</div>}
      {r.pending_items > 0 && r.status === "draft" && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900">{r.pending_items} incentive / bonus item{r.pending_items > 1 ? "s are" : " is"} waiting for approval for this month — approve them in Incentives, then Recalculate.</div>}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Stat icon={Users} label="Employees" value={t.count || 0} />
        <Stat icon={IndianRupee} label="Gross" value={inr(t.gross)} tone="blue" />
        <Stat icon={Wallet} label="Net pay" value={inr(t.net)} tone="green" testid="run-net" />
        <Stat icon={Landmark} label="Cost to company" value={inr(t.employer_cost)} tone="violet" />
        <Stat icon={ShieldCheck} label="PF challan" value={inr((t.ee_pf || 0) + (t.eps || 0) + (t.er_epf || 0) + (t.edli || 0) + (t.pf_admin || 0))} sub={`EE ${inr(t.ee_pf)}`} tone="orange" />
        <Stat icon={ShieldCheck} label="ESI · PT · TDS" value={inr((t.ee_esi || 0) + (t.er_esi || 0) + (t.pt || 0) + (t.tds || 0))} tone="gray" />
      </div>
      <PillTabs tabs={[["slips", "Payslips"], ["statutory", "PF & ESI"]]} value={tab} onChange={setTab} testid="run-tab" />
      {tab === "slips" ? (
        <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-0 overflow-x-auto">
          <CardTable><table className="w-full text-sm" data-testid="payslips-table">
            <thead><tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 bg-gray-50/60">
              <th className="text-left font-semibold py-2.5 px-4">Employee</th><th className="text-right font-semibold py-2.5 px-2">Days</th><th className="text-right font-semibold py-2.5 px-2">Gross</th>
              <th className="text-right font-semibold py-2.5 px-2">PF</th><th className="text-right font-semibold py-2.5 px-2">ESI</th><th className="text-right font-semibold py-2.5 px-2">PT</th>
              <th className="text-right font-semibold py-2.5 px-2">TDS</th><th className="text-right font-semibold py-2.5 px-2">Deductions</th><th className="text-right font-semibold py-2.5 px-4">Net</th></tr></thead>
            <tbody>{r.payslips.map((p) => (
              <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-orange-50/40 cursor-pointer" onClick={() => setSlip(p.id)} data-testid={`payslip-row-${p.user_id}`}>
                <td className="py-2.5 px-4"><div className="font-medium text-gray-900">{p.user_name}</div><div className="text-xs text-gray-500">{[p.employee_code, p.designation].filter(Boolean).join(" · ")}</div></td>
                <td className="py-2.5 px-2 text-right font-mono text-gray-600">{p.paid_days}{p.lop_days ? <span className="text-red-500"> −{p.lop_days}</span> : ""}</td>
                <td className="py-2.5 px-2 text-right font-mono">{inr(p.gross)}</td><td className="py-2.5 px-2 text-right font-mono text-gray-600">{inr(p.ee_pf)}</td>
                <td className="py-2.5 px-2 text-right font-mono text-gray-600">{p.ee_esi ? inr(p.ee_esi) : "—"}</td><td className="py-2.5 px-2 text-right font-mono text-gray-600">{inr(p.pt)}</td>
                <td className="py-2.5 px-2 text-right font-mono text-gray-600">{inr(p.tds)}</td><td className="py-2.5 px-2 text-right font-mono text-gray-600">{inr(p.total_deductions)}</td>
                <td className="py-2.5 px-4 text-right font-mono font-semibold">{inr(p.net)}</td></tr>))}</tbody>
          </table></CardTable>
          {!r.payslips.length && <Empty icon={Users} title="No payslips" sub="Add salary structures, then Recalculate." />}
        </CardContent></Card>
      ) : !st ? <Spinner /> : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="border-gray-200/80 shadow-sm lg:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">PF (ECR summary)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto pt-0"><table className="w-full text-xs" data-testid="pf-table"><thead><tr className="text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left py-2">UAN</th><th className="text-left py-2">Member</th><th className="text-right py-2">EPF wages</th><th className="text-right py-2">EPS wages</th><th className="text-right py-2">EE 12%</th><th className="text-right py-2">EPS</th><th className="text-right py-2">ER EPF</th><th className="text-right py-2">NCP</th></tr></thead>
              <tbody>{st.pf.map((x, i) => <tr key={i} className="border-b border-gray-50"><td className="py-1.5 font-mono">{x.uan}</td><td className="py-1.5">{x.name}</td><td className="py-1.5 text-right font-mono">{inr(x.epf_wages)}</td><td className="py-1.5 text-right font-mono">{inr(x.eps_wages)}</td><td className="py-1.5 text-right font-mono">{inr(x.ee_pf)}</td><td className="py-1.5 text-right font-mono">{inr(x.eps)}</td><td className="py-1.5 text-right font-mono">{inr(x.er_epf)}</td><td className="py-1.5 text-right font-mono">{x.ncp_days}</td></tr>)}</tbody></table></CardContent></Card>
          <div className="space-y-4">
            <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-4 space-y-1.5 text-sm" data-testid="statutory-totals">
              {[["PF — employee share", st.totals.ee_pf], ["PF — employer EPF", st.totals.er_epf], ["Pension (EPS)", st.totals.eps], ["EDLI", st.totals.edli], ["PF admin", st.totals.pf_admin]].map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-gray-600">{k}</span><span className="font-mono">{inr(v)}</span></div>)}
              <div className="flex justify-between font-semibold border-t border-gray-100 pt-1.5"><span>PF challan</span><span className="font-mono">{inr(st.totals.pf_challan)}</span></div>
              <div className="flex justify-between pt-2"><span className="text-gray-600">ESI (employee + employer)</span><span className="font-mono">{inr(st.totals.esi_challan)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Professional tax</span><span className="font-mono">{inr(st.totals.pt)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">TDS</span><span className="font-mono">{inr(st.totals.tds)}</span></div>
            </CardContent></Card>
            {st.esi.length > 0 && <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">ESI</CardTitle></CardHeader><CardContent className="pt-0 text-xs">
              {st.esi.map((x, i) => <div key={i} className="flex justify-between py-1 border-b border-gray-50 last:border-0"><span>{x.name}</span><span className="font-mono">{inr(x.ee_esi)} + {inr(x.er_esi)}</span></div>)}</CardContent></Card>}
            <p className="text-[11px] text-gray-400">Rates come from Payroll settings. Check them with your accountant before filing.</p>
          </div>
        </div>
      )}
      <PayslipSheet id={slip} editable={can && r.status === "draft"} onClose={() => setSlip(null)} onChanged={reload} />
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-sm" data-testid="pay-dialog"><DialogHeader><DialogTitle>Mark {r.label} as paid</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Paid on"><Input type="date" value={pay.paid_on} onChange={(e) => setPay((p) => ({ ...p, paid_on: e.target.value }))} /></Field>
            <label className="flex items-start gap-2 text-sm"><Checkbox checked={pay.post_to_ledger} onCheckedChange={(v) => setPay((p) => ({ ...p, post_to_ledger: !!v }))} className="mt-0.5" />
              <span>Add the payroll cost ({inr(t.employer_cost)}) to the ledger as a salaries expense</span></label>
            <p className="text-xs text-gray-500">Approved incentives in this run are marked paid and employee advances record their repayment.</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button><Button onClick={() => { setPayOpen(false); act("pay", pay); }} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="pay-confirm">Mark paid</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================ structures
function StructureDialog({ person, open, onClose, onSaved }) {
  const blank = { ctc_annual: "", effective_from: localISO(), monthly: { basic: "", hra: "", special: "", conveyance: "", other_allowances: [] }, pf_applicable: true, esi_applicable: "auto", pt_monthly: "", tds_monthly: "", reason: "" };
  const [f, setF] = useState(blank);
  const [est, setEst] = useState(null);
  const [hist, setHist] = useState([]);
  useEffect(() => {
    if (!open || !person) return;
    setEst(null);
    api.get(`/hr/payroll/structures/${person.user_id}`).then((r) => {
      const s = r.data.structure;
      setHist(s?.revisions || []);
      setF(s ? { ctc_annual: String(s.ctc_annual || ""), effective_from: localISO(), monthly: { ...blank.monthly, ...s.monthly }, pf_applicable: s.pf_applicable !== false,
        esi_applicable: s.esi_applicable || "auto", pt_monthly: s.pt_monthly ?? "", tds_monthly: s.tds_monthly ?? "", reason: "" } : blank);
      if (r.data.preview) setEst({ gross: r.data.preview.gross, net: r.data.preview.net, employer_cost: r.data.preview.employer_cost });
    }).catch(() => {});
  }, [open, person]); // eslint-disable-line react-hooks/exhaustive-deps
  const setM = (k, v) => setF((x) => ({ ...x, monthly: { ...x.monthly, [k]: v } }));
  const split = async () => {
    try {
      const { data } = await api.post("/hr/payroll/structures/preview", { ctc_annual: num(f.ctc_annual), pf_applicable: f.pf_applicable });
      setF((x) => ({ ...x, monthly: { ...x.monthly, basic: data.monthly.basic, hra: data.monthly.hra, special: data.monthly.special, conveyance: 0 } }));
      setEst(data.estimate);
    } catch (e) { toast.error(apiError(e)); }
  };
  const save = async () => {
    try {
      const m = f.monthly;
      await api.put("/hr/payroll/structures", { user_id: person.user_id, effective_from: f.effective_from, ctc_annual: num(f.ctc_annual),
        monthly: { basic: num(m.basic), hra: num(m.hra), special: num(m.special), conveyance: num(m.conveyance), other_allowances: (m.other_allowances || []).map((o) => ({ name: o.name, amount: num(o.amount) })).filter((o) => o.amount) },
        pf_applicable: f.pf_applicable, esi_applicable: f.esi_applicable, pt_monthly: f.pt_monthly === "" ? null : num(f.pt_monthly), tds_monthly: num(f.tds_monthly), reason: f.reason });
      toast.success(`Salary saved for ${person.name}`); onSaved(); onClose();
    } catch (e) { toast.error(apiError(e)); }
  };
  const gross = ["basic", "hra", "special", "conveyance"].reduce((a, k) => a + num(f.monthly[k]), 0) + (f.monthly.other_allowances || []).reduce((a, o) => a + num(o.amount), 0);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="structure-dialog">
        <DialogHeader><DialogTitle>Salary — {person?.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <Field label="Annual CTC (₹)"><Input type="number" value={f.ctc_annual} onChange={(e) => setF((x) => ({ ...x, ctc_annual: e.target.value }))} data-testid="st-ctc" /></Field>
            <Button variant="outline" onClick={split} disabled={!num(f.ctc_annual)} data-testid="st-split"><Calculator className="h-3.5 w-3.5 mr-1.5" /> Split into components</Button>
            <Field label="Effective from"><Input type="date" value={f.effective_from} onChange={(e) => setF((x) => ({ ...x, effective_from: e.target.value }))} /></Field>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[["basic", "Basic"], ["hra", "HRA"], ["special", "Special allowance"], ["conveyance", "Conveyance"]].map(([k, l]) => (
              <Field key={k} label={`${l} / month`}><Input type="number" value={f.monthly[k]} onChange={(e) => setM(k, e.target.value)} data-testid={`st-${k}`} /></Field>))}
          </div>
          <div className="space-y-1.5">
            {(f.monthly.other_allowances || []).map((o, i) => (
              <div key={i} className="flex gap-2"><Input value={o.name} onChange={(e) => setM("other_allowances", f.monthly.other_allowances.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Allowance" />
                <Input type="number" className="w-32" value={o.amount} onChange={(e) => setM("other_allowances", f.monthly.other_allowances.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                <Button size="icon" variant="ghost" onClick={() => setM("other_allowances", f.monthly.other_allowances.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button></div>))}
            <Button size="sm" variant="ghost" onClick={() => setM("other_allowances", [...(f.monthly.other_allowances || []), { name: "", amount: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Other allowance</Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="PF"><label className="flex items-center gap-2 h-9 text-sm"><Switch checked={f.pf_applicable} onCheckedChange={(v) => setF((x) => ({ ...x, pf_applicable: v }))} /> {f.pf_applicable ? "Yes" : "No"}</label></Field>
            <Field label="ESI"><Select value={f.esi_applicable} onValueChange={(v) => setF((x) => ({ ...x, esi_applicable: v }))}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="auto">Auto (≤ ₹21k)</SelectItem><SelectItem value="yes">Always</SelectItem><SelectItem value="no">Never</SelectItem></SelectContent></Select></Field>
            <Field label="Prof. tax / month" hint="Blank = default"><Input type="number" value={f.pt_monthly} onChange={(e) => setF((x) => ({ ...x, pt_monthly: e.target.value }))} /></Field>
            <Field label="TDS / month"><Input type="number" value={f.tds_monthly} onChange={(e) => setF((x) => ({ ...x, tds_monthly: e.target.value }))} /></Field>
          </div>
          <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm flex flex-wrap gap-x-6 gap-y-1" data-testid="st-estimate">
            <span>Gross / month <b className="font-mono">{inr(gross)}</b></span>
            {est && <><span>Take-home ≈ <b className="font-mono">{inr(est.net)}</b></span><span>Cost / month <b className="font-mono">{inr(est.employer_cost)}</b></span></>}
          </div>
          <Field label="Reason for change"><Input value={f.reason} onChange={(e) => setF((x) => ({ ...x, reason: e.target.value }))} placeholder="Appraisal, promotion, correction…" /></Field>
          {hist.length > 0 && <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">History</div>
            {hist.slice().reverse().map((h, i) => <div key={i} className="text-xs text-gray-600 py-0.5">{fmtDate(h.effective_from)} · CTC {inr(h.ctc_annual)} · {h.reason} · {h.by}</div>)}</div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!gross} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="st-save">Save salary</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsForm({ meta, onSaved }) {
  const [v, setV] = useState(meta.settings);
  const save = async () => { try { await api.put("/hr/payroll/settings", { values: v }); toast.success("Payroll settings saved"); onSaved(); } catch (e) { toast.error(apiError(e)); } };
  const n = (k, label, hint) => <Field key={k} label={label} hint={hint}><Input type="number" step="0.01" value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} disabled={!meta.can_manage} data-testid={`ps-${k}`} /></Field>;
  const b = (k, label, hint) => <Field key={k} label={label} hint={hint}><label className="flex items-center gap-2 h-9"><Switch checked={!!v[k]} onCheckedChange={(x) => setV((y) => ({ ...y, [k]: x }))} disabled={!meta.can_manage} /> <span className="text-sm">{v[k] ? "On" : "Off"}</span></label></Field>;
  return (
    <Card className="border-gray-200/80 shadow-sm" data-testid="payroll-settings"><CardContent className="p-5 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Company name on payslips"><Input value={v.company_name} onChange={(e) => setV((x) => ({ ...x, company_name: e.target.value }))} disabled={!meta.can_manage} /></Field>
        <Field label="Address on payslips"><Input value={v.company_address} onChange={(e) => setV((x) => ({ ...x, company_address: e.target.value }))} disabled={!meta.can_manage} /></Field>
      </div>
      <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Provident fund</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{n("pf_employee_rate", "Employee PF %")}{n("pf_employer_rate", "Employer PF %")}{n("eps_rate", "EPS (pension) %")}{n("pf_wage_ceiling", "PF wage ceiling ₹")}
          {n("edli_rate", "EDLI %")}{n("pf_admin_rate", "PF admin %")}{b("employee_pf_on_ceiling", "Cap employee PF at ceiling")}{b("employer_pf_on_ceiling", "Cap employer PF at ceiling")}</div>
        <div className="mt-3">{b("labour_code_wages", "Labour Code wage rule", "PF wages = at least 50% of fixed pay")}</div></div>
      <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">ESI & professional tax</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{n("esi_wage_limit", "ESI gross limit ₹")}{n("esi_employee_rate", "ESI employee %")}{n("esi_employer_rate", "ESI employer %")}{n("default_pt", "Default PT / month ₹", "Set per your state")}</div></div>
      <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Calculation</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{n("basic_percent_of_gross", "Basic % of gross (CTC split)")}{n("hra_percent_of_basic", "HRA % of basic (CTC split)")}
          {b("lop_from_attendance", "Loss of pay from attendance", "Absent = 1 day, half day = ½")}{b("post_to_ledger", "Post paid payroll to ledger")}</div></div>
      <p className="text-xs text-gray-400">Defaults follow common Indian rules (PF 12% with 8.33% to EPS on wages up to ₹25,000 — the EPF ceiling since 17 Sep 2026; ESI 0.75% / 3.25% up to ₹21,000 gross). Confirm with your accountant — rates and your state's professional tax can differ.</p>
      {meta.can_manage && <div className="flex justify-end"><Button onClick={save} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="ps-save">Save settings</Button></div>}
    </CardContent></Card>
  );
}

export function PayrollPage() {
  const [sp, setSp] = useSearchParams();
  const [meta, reloadMeta] = useLoad("/hr/payroll/meta");
  const [tab, setTab] = useState(sp.get("tab") || "runs");
  const [runs, reloadRuns] = useLoad("/hr/payroll/runs");
  const [structs, reloadStructs] = useLoad(tab === "structures" ? "/hr/payroll/structures" : null);
  const [month, setMonth] = useState(thisMonth());
  const [edit, setEdit] = useState(null);
  const runId = sp.get("run");
  const delRuns = useRecordDelete({ coll: "payroll_runs", permKey: "payroll.delete", rows: runs?.runs || [], onDeleted: reloadRuns, labelOf: (r) => `Payroll ${r.label}` });
  const openRun = (id) => setSp((p) => { const n = new URLSearchParams(p); if (id) n.set("run", id); else n.delete("run"); return n; });
  const create = async () => {
    try { const { data } = await api.post("/hr/payroll/runs", { month }); reloadRuns(); openRun(data.id); toast.success(`Payroll for ${data.label} drafted`); } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <HRLayout title="Payroll" subtitle="Salaries, PF / EPF, ESI, professional tax and TDS — draft, finalise, pay, and payslips for everyone.">
      {!meta ? <Spinner /> : runId ? <RunView runId={runId} meta={meta} onBack={() => openRun(null)} onChanged={reloadRuns} /> : (
        <>
          <PillTabs tabs={[["runs", "Monthly payroll"], ["structures", "Salary structures"], ["settings", "Settings"]]} value={tab} onChange={setTab} testid="payroll-tab" />
          {tab === "runs" && (
            <>
              {meta.can_manage && (
                <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-4 flex flex-wrap items-end gap-3">
                  <Field label="Run payroll for"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" data-testid="new-run-month" /></Field>
                  <Button onClick={create} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="new-run-btn"><Plus className="h-3.5 w-3.5 mr-1.5" /> Draft payroll</Button>
                  {runs?.pending_items > 0 && <span className="text-xs text-amber-700 sm:ml-auto">{runs.pending_items} incentive / bonus items waiting for approval</span>}
                </CardContent></Card>
              )}
              {!runs ? <Spinner /> : runs.runs.length === 0 ? <Card><Empty icon={IndianRupee} title="No payroll yet" sub="Add salary structures, then draft this month's payroll." /></Card> : (
                <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-0">
                  {delRuns.dialog}
                  <ul className="divide-y divide-gray-100" data-testid="runs-list">{runs.runs.map((r) => (
                    <li key={r.id} className="px-4 py-3 flex items-center gap-3 hover:bg-orange-50/40 cursor-pointer" onClick={() => openRun(r.id)} data-testid={`run-${r.month}`}>
                      <RowDeleteControls kit={delRuns} row={r} />
                      <div className="min-w-0 flex-1"><div className="font-semibold text-gray-900">{r.label}</div><div className="text-xs text-gray-500">{r.totals?.count || 0} employees{r.paid_on ? ` · paid ${fmtDate(r.paid_on)}` : ""}</div></div>
                      <div className="text-right"><div className="font-mono font-semibold">{inr(r.totals?.net)}</div><div className="text-[11px] text-gray-400">net · cost {inr(r.totals?.employer_cost)}</div></div>
                      <Pill tone={RUN_TONE[r.status]}>{r.status}</Pill>
                    </li>))}</ul>
                </CardContent></Card>
              )}
            </>
          )}
          {tab === "structures" && (!structs ? <Spinner /> : (
            <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-0 overflow-x-auto">
              <CardTable><table className="w-full text-sm" data-testid="structures-table">
                <thead><tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left font-semibold py-2.5 px-4">Employee</th><th className="text-right font-semibold py-2.5 px-2">Annual CTC</th><th className="text-right font-semibold py-2.5 px-2">Gross / month</th>
                  <th className="text-right font-semibold py-2.5 px-2">Take-home</th><th className="text-left font-semibold py-2.5 px-2">PF / ESI</th><th className="text-left font-semibold py-2.5 px-4">Since</th></tr></thead>
                <tbody>{structs.map((s) => (
                  <tr key={s.user_id} className="border-b border-gray-50 last:border-0 hover:bg-orange-50/40 cursor-pointer" onClick={() => meta.can_manage && setEdit(s)} data-testid={`structure-${s.user_id}`}>
                    <td className="py-2.5 px-4"><div className="font-medium text-gray-900">{s.name}</div><div className="text-xs text-gray-500">{[s.employee_code, s.designation].filter(Boolean).join(" · ")}</div></td>
                    {s.has_structure ? (<>
                      <td className="py-2.5 px-2 text-right font-mono">{inr(s.ctc_annual)}</td><td className="py-2.5 px-2 text-right font-mono">{inr(s.gross_monthly)}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-gray-600">{inr(s.net_monthly)}</td>
                      <td className="py-2.5 px-2"><span className="flex gap-1">{s.pf_applicable && <Pill tone="blue">PF</Pill>}{s.esi && <Pill tone="violet">ESI</Pill>}</span></td>
                      <td className="py-2.5 px-4 text-gray-500 whitespace-nowrap">{fmtDate(s.effective_from)}{s.revisions > 1 ? ` · ${s.revisions - 1} revision${s.revisions > 2 ? "s" : ""}` : ""}</td></>
                    ) : <td colSpan={5} className="py-2.5 px-2 text-xs text-amber-700">No salary yet — {meta.can_manage ? "tap to add" : "ask payroll"}</td>}
                  </tr>))}</tbody>
              </table></CardTable>
            </CardContent></Card>
          ))}
          {tab === "settings" && <SettingsForm meta={meta} onSaved={reloadMeta} />}
        </>
      )}
      <StructureDialog person={edit} open={!!edit} onClose={() => setEdit(null)} onSaved={reloadStructs} />
    </HRLayout>
  );
}

// ============================================================ incentives
function ItemDialog({ open, onClose, meta, people, onSaved }) {
  const [f, setF] = useState({});
  useEffect(() => { if (open) setF({ user_id: "", month: thisMonth(), kind: "bonus", title: "", amount: "", note: "" }); }, [open]);
  const save = async () => {
    try { await api.post("/hr/payroll/items", { ...f, amount: num(f.amount) }); toast.success("Added — approve it to include it in payroll"); onSaved(); onClose(); } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="item-dialog"><DialogHeader><DialogTitle>Add incentive, bonus or commission</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Employee"><Select value={f.user_id || "none"} onValueChange={(v) => setF((x) => ({ ...x, user_id: v }))}><SelectTrigger data-testid="item-person"><SelectValue placeholder="Pick a person" /></SelectTrigger>
            <SelectContent><SelectItem value="none" disabled>Pick a person</SelectItem>{people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type"><Select value={f.kind} onValueChange={(v) => setF((x) => ({ ...x, kind: v }))}><SelectTrigger data-testid="item-kind"><SelectValue /></SelectTrigger>
              <SelectContent>{meta.item_kinds.filter((k) => k.value !== "increment").map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Pay in"><Input type="month" value={f.month} onChange={(e) => setF((x) => ({ ...x, month: e.target.value }))} /></Field>
          </div>
          <Field label="Title"><Input value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} placeholder="e.g. Diwali bonus" /></Field>
          <Field label="Amount (₹)"><Input type="number" value={f.amount} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))} data-testid="item-amount" /></Field>
          <Field label="Note"><Textarea rows={2} value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!f.user_id || f.user_id === "none" || !num(f.amount)} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="item-save">Add</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanDialog({ open, onClose, meta, plan, people, branches, onSaved }) {
  const [f, setF] = useState({});
  useEffect(() => { if (open) setF(plan ? { ...plan, target: String(plan.target ?? ""), payout_value: String(plan.payout_value ?? ""), cap: plan.cap ?? "" } : { name: "", kind: "monthly_incentive", metric: "branch_revenue", branch_id: "", target: "", payout_type: "percent_above_target", payout_value: "", cap: "", user_ids: [], active: true, notes: "" }); }, [open, plan]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const body = { ...f, target: num(f.target), payout_value: num(f.payout_value), cap: f.cap === "" ? null : num(f.cap), branch_id: f.branch_id || null };
    try { if (plan) await api.put(`/hr/payroll/plans/${plan.id}`, body); else await api.post("/hr/payroll/plans", body); toast.success("Plan saved"); onSaved(); onClose(); } catch (e) { toast.error(apiError(e)); }
  };
  const toggle = (id) => set("user_ids", (f.user_ids || []).includes(id) ? f.user_ids.filter((x) => x !== id) : [...(f.user_ids || []), id]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" data-testid="incentive-plan-dialog"><DialogHeader><DialogTitle>{plan ? "Edit plan" : "New incentive plan"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Name"><Input value={f.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Location CEO — monthly incentive" data-testid="ip-name" /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="What it pays"><Select value={f.kind} onValueChange={(v) => setF((x) => ({ ...x, kind: v, ...(v === "increment" ? { payout_type: "percent_of_ctc" } : {}) }))}><SelectTrigger data-testid="ip-kind"><SelectValue /></SelectTrigger>
              <SelectContent>{meta.plan_kinds.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Measured on"><Select value={f.metric} onValueChange={(v) => set("metric", v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{meta.metrics.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent></Select></Field>
            {f.metric === "branch_revenue" && <Field label="Branch" hint="Blank = each person's own branch"><Select value={f.branch_id || "own"} onValueChange={(v) => set("branch_id", v === "own" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="own">Their own branch</SelectItem>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></Field>}
            <Field label="Target (₹)" hint="0 = no target"><Input type="number" value={f.target} onChange={(e) => set("target", e.target.value)} data-testid="ip-target" /></Field>
            <Field label="Payout"><Select value={f.payout_type} onValueChange={(v) => set("payout_type", v)} disabled={f.kind === "increment"}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{meta.payouts.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent></Select></Field>
            <Field label={f.payout_type === "fixed" ? "Amount (₹)" : "Percent (%)"}><Input type="number" value={f.payout_value} onChange={(e) => set("payout_value", e.target.value)} data-testid="ip-value" /></Field>
            {f.kind !== "increment" && <Field label="Cap (₹)" hint="Optional"><Input type="number" value={f.cap} onChange={(e) => set("cap", e.target.value)} /></Field>}
          </div>
          <Field label="Who's on this plan"><div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto rounded-lg border border-gray-200 p-2">{people.map((p) => (
            <button key={p.id} type="button" onClick={() => toggle(p.id)} className={`rounded-full border px-2.5 py-1 text-xs ${(f.user_ids || []).includes(p.id) ? "bg-[#FFF7ED] border-orange-300 text-[#C2410C] font-semibold" : "border-gray-200 text-gray-600"}`}>{p.name}</button>))}</div></Field>
          <Field label="Notes"><Textarea rows={2} value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!f.name?.trim() || !num(f.payout_value) || !(f.user_ids || []).length} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="ip-save">Save plan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function fyRange() {
  const n = new Date();
  const y = n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1;
  return [`${y}-04-01`, localISO()];
}
function lastMonthRange() {
  const n = new Date();
  const s = new Date(n.getFullYear(), n.getMonth() - 1, 1);
  const e = new Date(n.getFullYear(), n.getMonth(), 0);
  return [localISO(s), localISO(e)];
}

function CalcDialog({ plan, open, onClose, onDone }) {
  const [f, setF] = useState({});
  const [res, setRes] = useState(null);
  useEffect(() => {
    if (!open || !plan) return;
    const [s, e] = plan.kind === "monthly_incentive" || plan.kind === "commission" ? lastMonthRange() : fyRange();
    setF({ start: s, end: e, pay_month: thisMonth(), manual: {} }); setRes(null);
  }, [open, plan]);
  const run = async () => {
    try {
      const { data } = await api.post(`/hr/payroll/plans/${plan.id}/calculate`, { start: f.start, end: f.end, pay_month: f.pay_month,
        manual_values: plan.metric === "manual" ? Object.fromEntries(Object.entries(f.manual).map(([k, v]) => [k, num(v)])) : null });
      setRes(data); onDone();
    } catch (e) { toast.error(apiError(e)); }
  };
  if (!plan) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="calc-dialog"><DialogHeader><DialogTitle>Calculate — {plan.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="From"><Input type="date" value={f.start || ""} onChange={(e) => setF((x) => ({ ...x, start: e.target.value }))} /></Field>
            <Field label="To"><Input type="date" value={f.end || ""} onChange={(e) => setF((x) => ({ ...x, end: e.target.value }))} /></Field>
            <Field label="Pay in"><Input type="month" value={f.pay_month || ""} onChange={(e) => setF((x) => ({ ...x, pay_month: e.target.value }))} /></Field>
          </div>
          {plan.metric === "manual" && plan.people.map((p) => (
            <Field key={p.id} label={`${p.name} — achieved (₹)`}><Input type="number" value={f.manual?.[p.id] || ""} onChange={(e) => setF((x) => ({ ...x, manual: { ...x.manual, [p.id]: e.target.value } }))} /></Field>))}
          {res && (
            <div className="rounded-xl border border-gray-200 overflow-hidden" data-testid="calc-results">
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[420px]"><thead><tr className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400"><th className="text-left py-2 px-3">Person</th><th className="text-right py-2 px-2">Actual</th><th className="text-right py-2 px-2">Target</th><th className="text-right py-2 px-3">Payout</th></tr></thead>
                <tbody>{res.results.map((r) => (
                  <tr key={r.user_id} className="border-t border-gray-100"><td className="py-2 px-3">{r.name}</td><td className="py-2 px-2 text-right font-mono">{inr(r.metric_value)}</td>
                    <td className="py-2 px-2 text-right font-mono text-gray-500">{r.target ? inr(r.target) : "—"}</td>
                    <td className="py-2 px-3 text-right font-mono font-semibold">{r.already_approved ? <span className="text-xs text-gray-400">already approved</span> : r.amount ? inr(r.amount) : <span className="text-xs text-gray-400">{r.met ? "0" : "target missed"}</span>}</td></tr>))}</tbody></table></div>
              <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50">{res.proposed} item{res.proposed === 1 ? "" : "s"} proposed for approval{plan.kind === "increment" ? " — approving applies the raise to the salary structure" : ""}.</div>
            </div>
          )}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>{res ? "Done" : "Cancel"}</Button><Button onClick={run} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="calc-run"><Calculator className="h-3.5 w-3.5 mr-1.5" /> Calculate</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function IncentivesPage() {
  const [meta] = useLoad("/hr/payroll/meta");
  const [tab, setTab] = useState("items");
  const [status, setStatus] = useState("pending");
  const [month, setMonth] = useState("");
  const [items, reloadItems] = useLoad("/hr/payroll/items", { status: status === "all" ? undefined : status, month: month || undefined });
  const [plans, reloadPlans] = useLoad("/hr/payroll/plans");
  const [structs] = useLoad("/hr/payroll/structures");
  const [branches] = useLoad("/locations/branch-options");
  const [itemOpen, setItemOpen] = useState(false);
  const [planEdit, setPlanEdit] = useState(undefined);
  const [calc, setCalc] = useState(null);
  const people = useMemo(() => (structs || []).map((s) => ({ id: s.user_id, name: s.name })), [structs]);
  const delItems = useRecordDelete({ coll: "pay_items", permKey: "payroll.delete", rows: items || [], onDeleted: reloadItems, labelOf: (r) => `${r.user_name} · ${r.title}` });
  const delPlans = useRecordDelete({ coll: "incentive_plans", permKey: "payroll.delete", rows: plans || [], onDeleted: reloadPlans, labelOf: (r) => r.name });
  const act = async (it, what) => { try { await api.post(`/hr/payroll/items/${it.id}/${what}`); reloadItems(); toast.success(what === "approve" ? (it.kind === "increment" ? "Raise applied to the salary" : "Approved — it'll be in that month's payroll") : "Rejected"); } catch (e) { toast.error(apiError(e)); } };
  const can = meta?.can_manage;
  const totals = useMemo(() => { const t = {}; (items || []).forEach((i) => { t[i.kind] = (t[i.kind] || 0) + Number(i.amount || 0); }); return t; }, [items]);
  return (
    <HRLayout title="Incentives & bonus" subtitle="Incentives, bonuses and commissions — proposed, approved, then paid with payroll. Plans calculate them from real numbers."
      actions={can && <>
        <Button variant="outline" size="sm" onClick={() => setPlanEdit(null)} data-testid="new-incentive-plan"><Trophy className="h-3.5 w-3.5 mr-1.5" /> New plan</Button>
        <Button size="sm" onClick={() => setItemOpen(true)} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="new-pay-item"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add item</Button></>}>
      {!meta ? <Spinner /> : (
        <>
          <PillTabs tabs={[["items", "Items"], ["plans", "Plans", (plans || []).length]]} value={tab} onChange={setTab} testid="incentives-tab" />
          {tab === "items" ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <PillTabs tabs={[["pending", "To approve"], ["approved", "Approved"], ["paid", "Paid"], ["all", "All"]]} value={status} onChange={setStatus} testid="items-status" />
                <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40 bg-white" />
                {month && <Button variant="ghost" size="sm" onClick={() => setMonth("")}>All months</Button>}
                <span className="sm:ml-auto">{delItems.dialog}<BulkDeleteBar kit={delItems} /></span>
              </div>
              {items && items.length > 0 && <div className="flex flex-wrap gap-2 text-xs">{Object.entries(totals).map(([k, v]) => <Pill key={k} tone="gray">{meta.item_kinds.find((x) => x.value === k)?.label}: {inr(v)}</Pill>)}</div>}
              <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-0 overflow-x-auto">
                {!items ? <Spinner className="h-32" /> : items.length === 0 ? <Empty icon={Trophy} title="Nothing here" sub={status === "pending" ? "No incentives waiting for approval." : "No items match."} /> : (
                  <table className="w-full text-sm" data-testid="pay-items-table">
                    <thead><tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 bg-gray-50/60"><th className="w-14" />
                      <th className="text-left font-semibold py-2.5 px-2">Employee</th><th className="text-left font-semibold py-2.5 px-2">What</th><th className="text-left font-semibold py-2.5 px-2">Pay in</th>
                      <th className="text-right font-semibold py-2.5 px-2">Amount</th><th className="text-left font-semibold py-2.5 px-2">Status</th><th className="text-right font-semibold py-2.5 px-4" /></tr></thead>
                    <tbody>{items.map((it) => (
                      <tr key={it.id} className="border-b border-gray-50 last:border-0" data-testid={`pay-item-${it.id}`}>
                        <td className="py-2.5 pl-3"><RowDeleteControls kit={delItems} row={it} /></td>
                        <td className="py-2.5 px-2 font-medium text-gray-900">{it.user_name}</td>
                        <td className="py-2.5 px-2"><div className="text-gray-800">{it.title}</div><div className="text-xs text-gray-500">{it.kind_label}{it.basis ? ` · actual ${inr(it.basis.metric_value)}${it.basis.target ? ` vs target ${inr(it.basis.target)}` : ""}${it.basis.percent ? ` · +${it.basis.percent}%` : ""}` : ""}</div></td>
                        <td className="py-2.5 px-2 text-gray-600 whitespace-nowrap">{monthLabel(it.month)}</td>
                        <td className="py-2.5 px-2 text-right font-mono font-semibold">{it.kind === "increment" ? `+${inr(it.amount)}/mo` : inr(it.amount)}</td>
                        <td className="py-2.5 px-2"><Pill tone={ITEM_TONE[it.status]}>{it.status}</Pill></td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">{can && it.status === "pending" && <>
                          <Button size="sm" variant="ghost" onClick={() => act(it, "reject")}>Reject</Button>
                          <Button size="sm" onClick={() => act(it, "approve")} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid={`approve-${it.id}`}>Approve</Button></>}</td>
                      </tr>))}</tbody>
                  </table>
                )}
              </CardContent></Card>
            </>
          ) : !plans ? <Spinner /> : plans.length === 0 ? <Card><Empty icon={Trophy} title="No incentive plans yet" sub="e.g. 10% of branch revenue above ₹3L a month for the location CEO, or 5% commission on deals won." /></Card> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{delPlans.dialog}{plans.map((p) => (
              <Card key={p.id} className="border-gray-200/80 shadow-sm" data-testid={`incentive-plan-${p.id}`}><CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="font-semibold text-gray-900">{p.name}</div><div className="text-xs text-gray-500">{p.kind_label}</div></div>
                  <div className="flex items-center gap-1">{can && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPlanEdit(p)}><Pencil className="h-3.5 w-3.5 text-gray-500" /></Button>}<RowDeleteControls kit={delPlans} row={p} /></div></div>
                <div className="text-sm text-gray-700 flex items-center gap-1.5"><Percent className="h-3.5 w-3.5 text-[#F26B21]" />
                  {p.payout_type === "fixed" ? `${inr(p.payout_value)}` : `${p.payout_value}%`} · {p.payout_label?.toLowerCase()} · {p.metric_label?.split(" (")[0].toLowerCase()}{p.branch_name ? ` (${p.branch_name})` : ""}
                  {p.target ? ` · target ${inr(p.target)}` : ""}{p.cap ? ` · cap ${inr(p.cap)}` : ""}</div>
                <div className="flex flex-wrap gap-1">{p.people.map((x) => <Pill key={x.id} tone="orange">{x.name}</Pill>)}</div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-gray-500">{p.paid_total ? `${inr(p.paid_total)} approved so far` : "Nothing paid yet"}{p.last_calculated ? ` · last run ${fmtDate(p.last_calculated.at)}` : ""}</span>
                  {can && <Button size="sm" variant="outline" onClick={() => setCalc(p)} data-testid={`calc-${p.id}`}><Calculator className="h-3.5 w-3.5 mr-1.5" /> Calculate</Button>}
                </div>
              </CardContent></Card>))}</div>
          )}
          <ItemDialog open={itemOpen} onClose={() => setItemOpen(false)} meta={meta} people={people} onSaved={reloadItems} />
          <PlanDialog open={planEdit !== undefined} plan={planEdit} onClose={() => setPlanEdit(undefined)} meta={meta} people={people} branches={branches || []} onSaved={reloadPlans} />
          <CalcDialog plan={calc} open={!!calc} onClose={() => setCalc(null)} onDone={() => { reloadItems(); reloadPlans(); }} />
        </>
      )}
    </HRLayout>
  );
}
