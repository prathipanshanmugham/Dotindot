import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import FinanceLayout from "@/components/FinanceLayout";
import { useLoad, Spinner, Stat, PillTabs, Pill, Field, Empty, inr, fmtDate, localISO } from "@/components/kit";
import { useRecordDelete, RowDeleteControls, SubItemDeleteButton } from "@/components/RecordDelete";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Landmark, HandCoins, CalendarClock, AlertTriangle, Plus, Pencil, Percent, Calculator } from "lucide-react";

const num = (v) => (v === "" || v == null ? 0 : Number(v));
const BLANK = { name: "", direction: "borrowed", kind: "term_loan", counterparty: "", employee_id: "", principal: "", rate_annual: "", method: "reducing", tenure_months: "12",
  disbursed_on: localISO(), first_emi_date: "", emi_override: "", processing_fee: "", account_ref: "", collateral: "", recover_via_payroll: false, notes: "", status: "active" };

function LoanDialog({ open, onClose, loan, meta, onSaved }) {
  const [f, setF] = useState(BLANK);
  const [team, setTeam] = useState([]);
  const [pv, setPv] = useState(null);
  useEffect(() => {
    if (!open) return;
    setF(loan ? { ...BLANK, ...Object.fromEntries(Object.entries(loan).map(([k, v]) => [k, v == null ? "" : typeof v === "number" ? String(v) : v])), recover_via_payroll: !!loan.recover_via_payroll } : BLANK);
    setPv(null);
    api.get("/users/team").then((r) => setTeam(r.data)).catch(() => {});
  }, [open, loan]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    if (!open || !num(f.principal) || !num(f.tenure_months)) { setPv(null); return; }
    const t = setTimeout(() => api.post("/finance/loans/preview", { principal: num(f.principal), rate_annual: num(f.rate_annual), tenure_months: num(f.tenure_months), method: f.method, first_emi_date: f.first_emi_date || null })
      .then((r) => setPv(r.data)).catch(() => {}), 350);
    return () => clearTimeout(t);
  }, [open, f.principal, f.rate_annual, f.tenure_months, f.method, f.first_emi_date]);
  const save = async () => {
    const body = { ...f, principal: num(f.principal), rate_annual: num(f.rate_annual), tenure_months: num(f.tenure_months), emi_override: f.emi_override === "" ? null : num(f.emi_override),
      processing_fee: num(f.processing_fee), employee_id: f.employee_id || null, disbursed_on: f.disbursed_on || null };
    try { if (loan) await api.put(`/finance/loans/${loan.id}`, body); else await api.post("/finance/loans", body); toast.success("Loan saved"); onSaved(); onClose(); }
    catch (e) { toast.error(apiError(e)); }
  };
  const lent = f.direction === "lent";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="loan-dialog">
        <DialogHeader><DialogTitle>{loan ? "Edit loan" : "Add a loan"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <PillTabs tabs={[["borrowed", "We borrowed"], ["lent", "We lent / advanced"]]} value={f.direction} onChange={(v) => setF((x) => ({ ...x, direction: v, kind: v === "lent" ? "employee_advance" : "term_loan" }))} testid="loan-direction" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={lent ? "e.g. Salary advance — Karan" : "e.g. HDFC business loan"} data-testid="loan-name" /></Field>
            <Field label="Type"><Select value={f.kind} onValueChange={(v) => set("kind", v)}><SelectTrigger data-testid="loan-kind"><SelectValue /></SelectTrigger>
              <SelectContent>{meta.kinds.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent></Select></Field>
            {lent && f.kind === "employee_advance" ? (
              <Field label="Employee"><Select value={f.employee_id || "none"} onValueChange={(v) => setF((x) => ({ ...x, employee_id: v === "none" ? "" : v, counterparty: team.find((u) => u.id === v)?.name || x.counterparty }))}>
                <SelectTrigger data-testid="loan-employee"><SelectValue placeholder="Pick" /></SelectTrigger><SelectContent><SelectItem value="none" disabled>Pick an employee</SelectItem>{team.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></Field>
            ) : <Field label={lent ? "Borrower" : "Lender"}><Input value={f.counterparty} onChange={(e) => set("counterparty", e.target.value)} placeholder={lent ? "Who owes us" : "Bank / NBFC / person"} /></Field>}
            <Field label="Principal (₹)"><Input type="number" value={f.principal} onChange={(e) => set("principal", e.target.value)} data-testid="loan-principal" /></Field>
            <Field label="Interest % a year"><Input type="number" step="0.01" value={f.rate_annual} onChange={(e) => set("rate_annual", e.target.value)} data-testid="loan-rate" /></Field>
            <Field label="Repayment"><Select value={f.method} onValueChange={(v) => set("method", v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{meta.methods.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Tenure (months)"><Input type="number" value={f.tenure_months} onChange={(e) => set("tenure_months", e.target.value)} data-testid="loan-tenure" /></Field>
            <Field label="Disbursed on"><Input type="date" value={f.disbursed_on || ""} onChange={(e) => set("disbursed_on", e.target.value)} /></Field>
            <Field label="First EMI date"><Input type="date" value={f.first_emi_date || ""} onChange={(e) => set("first_emi_date", e.target.value)} data-testid="loan-first-emi" /></Field>
            <Field label="EMI override (₹)" hint="Only if the bank's EMI differs"><Input type="number" value={f.emi_override} onChange={(e) => set("emi_override", e.target.value)} /></Field>
            {!lent && <Field label="Processing fee (₹)"><Input type="number" value={f.processing_fee} onChange={(e) => set("processing_fee", e.target.value)} /></Field>}
            {!lent && <Field label="Loan account (last 4)"><Input value={f.account_ref} onChange={(e) => set("account_ref", e.target.value)} placeholder="…1234" /></Field>}
            {!lent && <Field label="Collateral"><Input value={f.collateral} onChange={(e) => set("collateral", e.target.value)} /></Field>}
            {loan && <Field label="Status"><Select value={f.status} onValueChange={(v) => set("status", v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="closed">Closed</SelectItem><SelectItem value="defaulted">Defaulted</SelectItem></SelectContent></Select></Field>}
          </div>
          {lent && f.employee_id && <label className="flex items-center gap-2 text-sm"><Switch checked={f.recover_via_payroll} onCheckedChange={(v) => set("recover_via_payroll", v)} data-testid="loan-payroll" /> Recover the EMI from their salary each month</label>}
          <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
          {pv && <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm flex flex-wrap gap-x-6 gap-y-1" data-testid="loan-preview">
            <span>EMI <b className="font-mono">{inr(f.emi_override ? num(f.emi_override) : pv.emi)}</b></span><span>Total interest <b className="font-mono">{inr(pv.total_interest)}</b></span><span>Total payable <b className="font-mono">{inr(pv.total_payable)}</b></span></div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!f.name.trim() || !num(f.principal) || !f.first_emi_date} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="loan-save">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoanSheet({ id, meta, onClose, onChanged, onEdit }) {
  const [l, setL] = useState(null);
  const [pay, setPay] = useState(null);
  const [split, setSplit] = useState(false);
  const load = () => api.get(`/finance/loans/${id}`).then((r) => setL(r.data)).catch((e) => { toast.error(apiError(e)); onClose(); });
  useEffect(() => { setL(null); setPay(null); if (id) load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const record = async () => {
    try {
      const body = { date: pay.date, amount: num(pay.amount), note: pay.note, mode: pay.mode, post_to_ledger: pay.ledger, ...(split ? { principal: num(pay.principal), interest: num(pay.interest) } : {}) };
      const { data } = await api.post(`/finance/loans/${id}/payments`, body);
      setL(data); setPay(null); onChanged(); toast.success("Repayment recorded");
    } catch (e) { toast.error(apiError(e)); }
  };
  const lent = l?.direction === "lent";
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col" data-testid="loan-sheet">
        {!l ? <Spinner /> : (
          <>
            <SheetHeader className="p-5 pb-3 border-b border-gray-100 text-left">
              <div className="flex items-center gap-2 text-xs"><Pill tone={lent ? "green" : "orange"}>{lent ? "Lent" : "Borrowed"}</Pill><span className="text-gray-500">{l.kind_label}</span>
                <Pill tone={l.status === "active" ? "blue" : l.status === "closed" ? "green" : "red"}>{l.status}</Pill>
                {meta.can_write && <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => onEdit(l)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>}</div>
              <SheetTitle className="text-lg">{l.name}</SheetTitle>
              <div className="text-xs text-gray-500">{l.counterparty || l.employee_name}{l.account_ref ? ` · ${l.account_ref}` : ""} · {inr(l.principal)} at {l.rate_annual}% · {l.tenure_months} months · {l.method_label}</div>
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div><div className="text-[11px] text-gray-500">Outstanding</div><div className="font-bold font-mono text-gray-900" data-testid="loan-outstanding">{inr(l.outstanding_principal)}</div></div>
                <div><div className="text-[11px] text-gray-500">EMI</div><div className="font-bold font-mono text-gray-900">{inr(l.emi)}</div></div>
                <div><div className="text-[11px] text-gray-500">{l.overdue_amount ? "Overdue" : "Next due"}</div><div className={`font-bold font-mono ${l.overdue_amount ? "text-red-600" : "text-gray-900"}`}>{l.overdue_amount ? inr(l.overdue_amount) : l.next_due ? fmtDate(l.next_due.date, { day: "numeric", month: "short" }) : "—"}</div></div>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden mt-1"><div className="h-full bg-emerald-500" style={{ width: `${l.progress}%` }} /></div>
              <div className="text-[11px] text-gray-500">{l.progress}% of principal repaid · interest paid {inr(l.interest_paid)} of {inr(l.total_interest)}{l.recover_via_payroll ? " · recovered through payroll" : ""}</div>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {meta.can_write && l.status === "active" && (!pay ? (
                <Button onClick={() => setPay({ date: localISO(), amount: String(l.next_due?.amount || l.emi), principal: "", interest: "", note: "", mode: "bank_transfer", ledger: false })} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="loan-pay-btn">
                  <HandCoins className="h-4 w-4 mr-1.5" /> {lent ? "Record repayment received" : "Record EMI paid"}</Button>
              ) : (
                <div className="rounded-xl border border-orange-100 bg-[#FFFBF7] p-4 space-y-3" data-testid="loan-pay-form">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Field label="Date"><Input type="date" value={pay.date} onChange={(e) => setPay((p) => ({ ...p, date: e.target.value }))} /></Field>
                    <Field label="Amount (₹)"><Input type="number" value={pay.amount} onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))} data-testid="loan-pay-amount" /></Field>
                    <Field label="Mode"><Select value={pay.mode} onValueChange={(v) => setPay((p) => ({ ...p, mode: v }))}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["bank_transfer", "auto_debit", "upi", "cheque", "cash"].map((m) => <SelectItem key={m} value={m}>{m.replace("_", " ")}</SelectItem>)}</SelectContent></Select></Field>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-600"><Checkbox checked={split} onCheckedChange={(v) => setSplit(!!v)} /> Enter the interest / principal split myself (default: worked out from the schedule)</label>
                  {split && <div className="grid grid-cols-2 gap-3"><Field label="Principal"><Input type="number" value={pay.principal} onChange={(e) => setPay((p) => ({ ...p, principal: e.target.value }))} /></Field>
                    <Field label="Interest"><Input type="number" value={pay.interest} onChange={(e) => setPay((p) => ({ ...p, interest: e.target.value }))} /></Field></div>}
                  <Field label="Note"><Input value={pay.note} onChange={(e) => setPay((p) => ({ ...p, note: e.target.value }))} /></Field>
                  <label className="flex items-center gap-2 text-xs text-gray-600"><Checkbox checked={pay.ledger} onCheckedChange={(v) => setPay((p) => ({ ...p, ledger: !!v }))} /> Also add to the ledger</label>
                  <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setPay(null)}>Cancel</Button><Button onClick={record} disabled={!num(pay.amount)} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="loan-pay-save">Record</Button></div>
                </div>
              ))}
              <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">Repayments</div>
                {l.payments.length === 0 ? <p className="text-xs text-gray-400">None yet.</p> : (
                  <table className="w-full text-sm"><thead><tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100"><th className="text-left py-1.5">Date</th><th className="text-right py-1.5">Amount</th><th className="text-right py-1.5">Principal</th><th className="text-right py-1.5">Interest</th><th className="text-left py-1.5 pl-3">Via</th><th /></tr></thead>
                    <tbody>{l.payments.map((p) => (
                      <tr key={p.id} className="border-b border-gray-50"><td className="py-1.5">{fmtDate(p.date)}</td><td className="py-1.5 text-right font-mono">{inr(p.amount)}</td><td className="py-1.5 text-right font-mono text-gray-600">{inr(p.principal)}</td>
                        <td className="py-1.5 text-right font-mono text-gray-600">{inr(p.interest)}</td><td className="py-1.5 pl-3 text-xs text-gray-500">{p.via === "payroll" ? "Payroll" : p.mode?.replace("_", " ")}{p.txn_id ? " · ledger" : ""}</td>
                        <td className="py-1.5 text-right"><SubItemDeleteButton coll="loans" rid={l.id} field="payments" itemId={p.id} permKey="finance.delete" label="repayment" onDeleted={() => { load(); onChanged(); }} /></td></tr>))}</tbody></table>
                )}</div>
              <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">Schedule</div>
                <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-100">
                  <table className="w-full text-xs" data-testid="loan-schedule"><thead className="sticky top-0 bg-gray-50"><tr className="text-gray-400 uppercase tracking-wide"><th className="text-left py-1.5 px-2">#</th><th className="text-left py-1.5">Due</th><th className="text-right py-1.5">EMI</th><th className="text-right py-1.5">Interest</th><th className="text-right py-1.5">Principal</th><th className="text-right py-1.5 px-2">Balance</th></tr></thead>
                    <tbody>{l.schedule.map((r) => (
                      <tr key={r.n} className={`border-t border-gray-50 ${r.state === "paid" ? "text-gray-400" : r.state === "overdue" ? "bg-red-50 text-red-700" : ""}`}>
                        <td className="py-1 px-2">{r.n}</td><td className="py-1">{fmtDate(r.due_date, { day: "numeric", month: "short", year: "2-digit" })}</td><td className="py-1 text-right font-mono">{inr(r.emi)}</td>
                        <td className="py-1 text-right font-mono">{inr(r.interest)}</td><td className="py-1 text-right font-mono">{inr(r.principal)}</td><td className="py-1 px-2 text-right font-mono">{inr(r.closing)}</td></tr>))}</tbody></table>
                </div></div>
              {l.notes && <p className="text-sm text-gray-600">{l.notes}</p>}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function LoansPage() {
  const [sp, setSp] = useSearchParams();
  const [dir, setDir] = useState("all");
  const [d, reload] = useLoad("/finance/loans");
  const [edit, setEdit] = useState(undefined);
  const del = useRecordDelete({ coll: "loans", permKey: "finance.delete", rows: d?.loans || [], onDeleted: reload, labelOf: (r) => r.name });
  const openId = sp.get("open");
  const setOpen = (id) => setSp((p) => { const n = new URLSearchParams(p); if (id) n.set("open", id); else n.delete("open"); return n; });
  const rows = (d?.loans || []).filter((l) => dir === "all" || l.direction === dir || (dir === "closed" && l.status !== "active"));
  const s = d?.summary;
  return (
    <FinanceLayout title="Loans" subtitle="Money we owe and money owed to us — EMIs, interest, what's left and what's due next."
      actions={d?.can_write && <Button size="sm" onClick={() => setEdit(null)} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="add-loan-btn"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add loan</Button>}>
      {!d ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat icon={Landmark} label="We owe" value={inr(s.borrowed_outstanding)} tone="orange" testid="loans-borrowed" />
            <Stat icon={HandCoins} label="Owed to us" value={inr(s.lent_outstanding)} tone="green" />
            <Stat icon={CalendarClock} label="EMIs this month" value={inr(s.emi_out_this_month)} sub={s.emi_in_this_month ? `${inr(s.emi_in_this_month)} coming in` : null} tone="blue" />
            <Stat icon={AlertTriangle} label="Overdue" value={inr(s.overdue)} sub={s.overdue_count ? `${s.overdue_count} loan${s.overdue_count > 1 ? "s" : ""}` : null} tone={s.overdue ? "red" : "gray"} />
            <Stat icon={Percent} label="Interest paid this FY" value={inr(s.interest_paid_fy)} tone="violet" className="col-span-2 lg:col-span-1" />
          </div>
          {d.upcoming.length > 0 && (
            <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">Coming up</CardTitle></CardHeader>
              <CardContent className="pt-0 flex flex-wrap gap-2" data-testid="loans-upcoming">{d.upcoming.map((u) => (
                <button key={u.loan_id} type="button" onClick={() => setOpen(u.loan_id)} className={`rounded-lg border px-3 py-2 text-left text-xs ${u.date < localISO() ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"} hover:border-orange-300`}>
                  <div className="font-semibold text-gray-800">{u.name}</div><div className="text-gray-500">{fmtDate(u.date, { day: "numeric", month: "short" })} · <span className="font-mono">{inr(u.amount)}</span> {u.direction === "lent" ? "in" : "out"}</div></button>))}</CardContent></Card>
          )}
          <div className="flex items-center gap-2"><PillTabs tabs={[["all", "All"], ["borrowed", "Borrowed"], ["lent", "Lent"], ["closed", "Closed"]]} value={dir} onChange={setDir} testid="loans-filter" /><span className="ml-auto">{del.dialog}</span></div>
          <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-0 overflow-x-auto">
            {rows.length === 0 ? <Empty icon={Landmark} title="No loans here" sub="Add bank loans, vehicle loans, OD limits, and advances you've given to employees or partners." /> : (
              <table className="w-full text-sm" data-testid="loans-table">
                <thead><tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 bg-gray-50/60"><th className="w-14" />
                  <th className="text-left font-semibold py-2.5 px-2">Loan</th><th className="text-right font-semibold py-2.5 px-2">Principal</th><th className="text-right font-semibold py-2.5 px-2">Rate</th>
                  <th className="text-right font-semibold py-2.5 px-2">EMI</th><th className="text-right font-semibold py-2.5 px-2">Outstanding</th><th className="text-left font-semibold py-2.5 px-2">Next</th><th className="text-left font-semibold py-2.5 px-4">Repaid</th></tr></thead>
                <tbody>{rows.map((l) => (
                  <tr key={l.id} className="border-b border-gray-50 last:border-0 hover:bg-orange-50/40 cursor-pointer" onClick={() => setOpen(l.id)} data-testid={`loan-${l.id}`}>
                    <td className="py-2.5 pl-3"><RowDeleteControls kit={del} row={l} /></td>
                    <td className="py-2.5 px-2"><div className="font-medium text-gray-900 flex items-center gap-1.5">{l.name}{l.status !== "active" && <Pill tone={l.status === "closed" ? "green" : "red"}>{l.status}</Pill>}</div>
                      <div className="text-xs text-gray-500"><span className={l.direction === "lent" ? "text-emerald-700" : "text-[#C2410C]"}>{l.direction === "lent" ? "Lent" : "Borrowed"}</span> · {l.kind_label} · {l.counterparty || l.employee_name}</div></td>
                    <td className="py-2.5 px-2 text-right font-mono">{inr(l.principal)}</td><td className="py-2.5 px-2 text-right font-mono text-gray-600">{l.rate_annual}%</td>
                    <td className="py-2.5 px-2 text-right font-mono">{inr(l.emi)}</td><td className="py-2.5 px-2 text-right font-mono font-semibold">{inr(l.outstanding_principal)}</td>
                    <td className="py-2.5 px-2 text-xs whitespace-nowrap">{l.overdue_amount > 0.5 ? <span className="text-red-600 font-semibold">{inr(l.overdue_amount)} overdue</span> : l.next_due ? fmtDate(l.next_due.date, { day: "numeric", month: "short" }) : "—"}</td>
                    <td className="py-2.5 px-4"><div className="flex items-center gap-2"><div className="h-1.5 w-20 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${l.progress}%` }} /></div><span className="text-xs font-mono text-gray-500">{Math.round(l.progress)}%</span></div></td>
                  </tr>))}</tbody>
              </table>
            )}
          </CardContent></Card>
          <p className="text-xs text-gray-400 flex items-center gap-1"><Calculator className="h-3.5 w-3.5" /> Interest and principal are worked out from the schedule; edit the split when recording if your bank statement differs.</p>
        </>
      )}
      {d && <LoanDialog open={edit !== undefined} loan={edit} meta={d} onClose={() => setEdit(undefined)} onSaved={() => { reload(); if (openId) setOpen(openId); }} />}
      {d && <LoanSheet id={openId} meta={d} onClose={() => setOpen(null)} onChanged={reload} onEdit={(l) => setEdit(l)} />}
    </FinanceLayout>
  );
}
