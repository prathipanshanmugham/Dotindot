// v3.2 Billing — list of quotations, proforma, invoices and credit notes with a receivables summary.
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useLoad, Spinner, PageHead, PillTabs, Pill, Empty, Stat, fmtDate } from "@/components/kit";
import { money, moneyShort, STATUS_TONE, STATUS_LABEL, TYPE_LABEL } from "./billingKit";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Receipt, Plus, Wallet, AlertTriangle, FileText, Search, Building2, ChevronDown, Settings2 } from "lucide-react";

const TABS = [["all", "All"], ["quotation", "Quotations"], ["proforma", "Proforma"], ["invoice", "Invoices"], ["credit_note", "Credit notes"]];

export default function BillingPage() {
  const { hasPerm } = useAuth();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const type = sp.get("type") || "all";
  const status = sp.get("status") || "";
  const [q, setQ] = useState("");
  const [meta] = useLoad("/billing/meta");
  const [summary] = useLoad("/billing/summary");
  const [rows] = useLoad("/billing/docs", { type: type === "all" ? undefined : type, status: status || undefined, q: q || undefined });
  const canManage = !!meta?.can_manage;
  const setType = (t) => setSp((p) => { const n = new URLSearchParams(p); t === "all" ? n.delete("type") : n.set("type", t); return n; });
  const setStatus = (s) => setSp((p) => { const n = new URLSearchParams(p); s && s !== "any" ? n.set("status", s) : n.delete("status"); return n; });
  const statuses = useMemo(() => (type === "all" ? ["draft", "sent", "accepted", "part_paid", "paid", "overdue", "converted", "expired", "cancelled"] : meta?.statuses?.[type] || []), [type, meta]);
  if (!meta) return <Spinner />;
  const s = summary;
  return (
    <div className="space-y-5" data-testid="billing-page">
      <PageHead kicker="Finance" title="Quotations & Invoices" sub="Quotes, proforma and tax invoices in INR or foreign currency, with GST, terms, UPI QR and payments."
        actions={<>
          {hasPerm("billing.manage") && <Button size="sm" variant="ghost" onClick={() => navigate("/settings/company")} data-testid="billing-settings-btn"><Settings2 className="h-4 w-4 mr-1.5" /> Company & terms</Button>}
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="sm" className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="billing-new-btn"><Plus className="h-4 w-4 mr-1.5" /> New <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-70" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {Object.entries(TYPE_LABEL).filter(([k]) => k !== "credit_note").map(([k, l]) => (
                  <DropdownMenuItem key={k} className="cursor-pointer" onClick={() => navigate(`/finance/billing/new?type=${k}`)} data-testid={`billing-new-${k}`}>{l}</DropdownMenuItem>))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>} />
      {!meta.company_ready && canManage && (
        <Link to="/settings/company" className="block rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="billing-company-nudge">
          <Building2 className="h-4 w-4 inline -mt-0.5 mr-1.5" /> Add your company details (address, GSTIN/PAN, bank, UPI id) before sending documents — <span className="font-semibold underline underline-offset-2">open Company profile</span>
        </Link>
      )}
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="billing-kpis">
          <Stat icon={Wallet} label="Outstanding" value={moneyShort(s.outstanding_inr)} sub={Object.entries(s.by_currency).filter(([c]) => c !== "INR").map(([c, v]) => `${money(v, c, 0)}`).join(" · ") || "all in INR"} testid="billing-kpi-outstanding" />
          <Stat icon={AlertTriangle} tone={s.overdue_inr ? "red" : "gray"} label="Overdue" value={moneyShort(s.overdue_inr)} sub={`${s.overdue_docs.length} invoice${s.overdue_docs.length === 1 ? "" : "s"}`} testid="billing-kpi-overdue" />
          <Stat icon={Receipt} tone="blue" label="Invoiced this month" value={moneyShort(s.invoiced_this_month_inr)} />
          <Stat icon={Wallet} tone="green" label="Collected this month" value={moneyShort(s.collected_this_month_inr)} />
          <Stat icon={FileText} tone="violet" label="Open quotations" value={s.open_quotes} sub={moneyShort(s.open_quotes_inr)} className="col-span-2 lg:col-span-1" />
        </div>
      )}
      {s && s.overdue_inr > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-600 flex flex-wrap gap-x-5 gap-y-1" data-testid="billing-ageing">
          <span className="font-semibold text-gray-800">Ageing</span>
          {Object.entries(s.ageing).map(([k, v]) => <span key={k}>{k} days <span className="font-mono font-semibold text-gray-900">{moneyShort(v)}</span></span>)}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <PillTabs tabs={TABS} value={type} onChange={setType} testid="billing-type" />
        <div className="flex items-center gap-2 sm:ml-auto">
          <Select value={status || "any"} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-36 text-xs bg-white" data-testid="billing-status-select"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="any">Any status</SelectItem>{statuses.map((x) => <SelectItem key={x} value={x}>{STATUS_LABEL[x] || x}</SelectItem>)}</SelectContent>
          </Select>
          <div className="relative"><Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-gray-400" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number, client, PO…" className="h-8 pl-8 w-52 text-xs" data-testid="billing-search" /></div>
        </div>
      </div>
      <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-0 overflow-x-auto">
        {!rows ? <Spinner className="h-40" /> : rows.length === 0 ? <Empty icon={Receipt} title="Nothing here yet" sub={canManage ? "Create a quotation to get started." : "Documents will appear here."} /> : (
          <table className="w-full text-sm min-w-[760px]" data-testid="billing-table">
            <thead><tr className="text-xs text-gray-500 bg-gray-50/60 border-b border-gray-100">
              <th className="text-left font-semibold py-2.5 px-4">Number</th><th className="text-left font-semibold py-2.5 px-3">Client</th><th className="text-left font-semibold py-2.5 px-3">Date</th>
              <th className="text-left font-semibold py-2.5 px-3">Due / valid</th><th className="text-right font-semibold py-2.5 px-3">Total</th><th className="text-right font-semibold py-2.5 px-3">Balance</th><th className="text-left font-semibold py-2.5 px-3">Status</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} onClick={() => navigate(`/finance/billing/${r.id}`)} className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-orange-50/40" data-testid={`billing-row-${r.id}`}>
                <td className="py-2.5 px-4"><div className="font-mono font-semibold text-gray-900">{r.number}</div><div className="text-[11px] text-gray-400">{TYPE_LABEL[r.type]}{r.title ? ` · ${r.title}` : ""}</div></td>
                <td className="py-2.5 px-3 text-gray-800">{r.client_name || r.bill_to?.company || r.bill_to?.name}<div className="text-[11px] text-gray-400">{r.bill_to?.country && r.bill_to.country !== "India" ? r.bill_to.country : ""}</div></td>
                <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">{fmtDate(r.date)}</td>
                <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">{fmtDate(r.due_date || r.valid_until)}{r.days_overdue > 0 && <span className="block text-[11px] text-red-600">{r.days_overdue} days overdue</span>}</td>
                <td className="py-2.5 px-3 text-right font-mono">{money(r.total, r.currency)}</td>
                <td className="py-2.5 px-3 text-right font-mono">{r.balance != null ? money(r.balance, r.currency) : "—"}</td>
                <td className="py-2.5 px-3"><Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status] || r.status}</Pill></td>
              </tr>))}</tbody>
          </table>
        )}
      </CardContent></Card>
    </div>
  );
}
