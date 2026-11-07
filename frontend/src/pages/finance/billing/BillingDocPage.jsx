// v3.2 Billing — one document: lines, totals, payments, status actions, PDF, share link, conversions.
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLoad, Spinner, PageHead, Field, Pill, fmtDate, fmtDateTime, download } from "@/components/kit";
import { useRecordDelete } from "@/components/RecordDelete";
import { money, STATUS_TONE, STATUS_LABEL, TYPE_LABEL } from "./billingKit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, Send, Pencil, Copy, Link2, MoreHorizontal, Wallet, FileText, ArrowRight, Trash2, CheckCircle2, XCircle, Ban, Undo2, Receipt } from "lucide-react";

export default function BillingDocPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  const [d, reload] = useLoad(`/billing/docs/${id}`);
  const [meta] = useLoad("/billing/meta");
  const [pay, setPay] = useState(null);
  const [convert, setConvert] = useState(null);
  const canManage = hasPerm("billing.manage");
  const kit = useRecordDelete({ coll: "billing_docs", permKey: "billing.delete", rows: d ? [d] : [], onDeleted: () => navigate("/finance/billing"), labelOf: (x) => x.number });
  if (!d || !meta) return <Spinner />;
  const isGst = d.tax_mode === "gst_intra" || d.tax_mode === "gst_inter";
  const cur = d.currency;
  const act = async (status, note) => {
    try { await api.post(`/billing/docs/${id}/status`, { status, note }); toast.success(`${d.number} marked ${STATUS_LABEL[status].toLowerCase()}`); reload(); } catch (e) { toast.error(apiError(e)); }
  };
  const copyShare = async () => {
    const full = window.location.hash.startsWith("#/") ? `${window.location.origin}${window.location.pathname}#${d.share_url_path}` : `${window.location.origin}${d.share_url_path}`;
    try { await navigator.clipboard.writeText(full); toast.success("Share link copied — anyone with it can view (and accept) this document"); } catch { toast(full); }
  };
  const duplicate = async () => { try { const { data } = await api.post(`/billing/docs/${id}/duplicate`); toast.success(`Copied as ${data.number}`); navigate(`/finance/billing/${data.id}`); } catch (e) { toast.error(apiError(e)); } };
  const editable = canManage && !["paid", "cancelled", "converted"].includes(d.status) && !(d.type === "invoice" && d.payments?.length);
  const conversions = { quotation: ["proforma", "invoice"], proforma: ["invoice"], invoice: ["credit_note"] }[d.type] || [];
  return (
    <div className="space-y-5 max-w-6xl" data-testid="billing-doc">
      <PageHead kicker={<Link to="/finance/billing" className="hover:text-[#F26B21]">Finance · Billing</Link>} title={<span className="font-mono">{d.number}</span>}
        sub={<span className="flex items-center gap-2 flex-wrap">{TYPE_LABEL[d.type]} · {d.client_name}{d.title ? ` · ${d.title}` : ""} <Pill tone={STATUS_TONE[d.status]} data-testid="billing-doc-status">{STATUS_LABEL[d.status]}</Pill>
          {d.source && <Link to={`/finance/billing/${d.source.id}`} className="text-xs text-[#F26B21]">from {d.source.number}</Link>}</span>}
        actions={<>
          <Button size="sm" variant="outline" onClick={() => download(`/billing/docs/${id}/pdf`, `${d.number.replace(/\//g, "-")}.pdf`)} data-testid="billing-pdf"><Download className="h-3.5 w-3.5 mr-1.5" /> PDF</Button>
          {canManage && d.status === "draft" && <Button size="sm" className="bg-[#F26B21] hover:bg-[#E05A10] text-white" onClick={() => act("sent")} data-testid="billing-mark-sent"><Send className="h-3.5 w-3.5 mr-1.5" /> Mark sent</Button>}
          {canManage && d.type === "invoice" && !["draft", "cancelled", "paid"].includes(d.status) && <Button size="sm" className="bg-[#F26B21] hover:bg-[#E05A10] text-white" onClick={() => setPay({ amount: d.balance, method: "bank", date: meta.today, reference: "", note: "" })} data-testid="billing-record-payment"><Wallet className="h-3.5 w-3.5 mr-1.5" /> Record payment</Button>}
          {canManage && d.type === "proforma" && d.status === "sent" && <Button size="sm" className="bg-[#F26B21] hover:bg-[#E05A10] text-white" onClick={() => setPay({ amount: d.balance, method: "bank", date: meta.today, reference: "", note: "" })} data-testid="billing-record-payment"><Wallet className="h-3.5 w-3.5 mr-1.5" /> Record payment</Button>}
          {canManage && conversions.length > 0 && (d.type === "invoice" ? !["draft", "cancelled"].includes(d.status) : ["sent", "accepted", "paid"].includes(d.status)) && conversions.map((t) => (
            <Button key={t} size="sm" variant="outline" onClick={() => setConvert({ to: t, reason: "" })} data-testid={`billing-convert-${t}`}><ArrowRight className="h-3.5 w-3.5 mr-1.5" /> {t === "credit_note" ? "Credit note" : `Make ${TYPE_LABEL[t].toLowerCase()}`}</Button>))}
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="icon" variant="outline" className="h-8 w-8" data-testid="billing-more"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {editable && <DropdownMenuItem className="cursor-pointer" onClick={() => navigate(`/finance/billing/${id}/edit`)} data-testid="billing-edit"><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>}
                <DropdownMenuItem className="cursor-pointer" onClick={duplicate}><Copy className="h-4 w-4 mr-2" /> Duplicate</DropdownMenuItem>
                {d.share_url_path && d.status !== "draft" && <DropdownMenuItem className="cursor-pointer" onClick={copyShare} data-testid="billing-copy-share"><Link2 className="h-4 w-4 mr-2" /> Copy share link</DropdownMenuItem>}
                <DropdownMenuSeparator />
                {d.type === "quotation" && d.status === "sent" && <><DropdownMenuItem className="cursor-pointer" onClick={() => act("accepted")} data-testid="billing-mark-accepted"><CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" /> Mark accepted</DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => act("rejected")}><XCircle className="h-4 w-4 mr-2 text-red-500" /> Mark rejected</DropdownMenuItem></>}
                {d.type === "credit_note" && d.status === "draft" && <DropdownMenuItem className="cursor-pointer" onClick={() => act("issued")} data-testid="billing-issue-cn"><CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" /> Issue credit note</DropdownMenuItem>}
                {d.status === "sent" && <DropdownMenuItem className="cursor-pointer" onClick={() => act("draft")}><Undo2 className="h-4 w-4 mr-2" /> Back to draft</DropdownMenuItem>}
                {!["cancelled", "paid", "converted"].includes(d.status) && !(d.type === "invoice" && d.payments?.length) && <DropdownMenuItem className="cursor-pointer text-red-600" onClick={() => act("cancelled")} data-testid="billing-cancel"><Ban className="h-4 w-4 mr-2" /> Cancel document</DropdownMenuItem>}
                {kit.canDelete && <DropdownMenuItem className="cursor-pointer text-red-600" onClick={() => kit.requestDelete(d)}><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>} />
      {d.days_overdue > 0 && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800" data-testid="billing-overdue-banner">Overdue by {d.days_overdue} day{d.days_overdue === 1 ? "" : "s"} — balance {money(d.balance, cur)}.</div>}
      {d.accepted_at && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800" data-testid="billing-accepted-banner"><CheckCircle2 className="h-4 w-4 inline -mt-0.5 mr-1.5" />Accepted by {d.accepted_by} on {fmtDateTime(d.accepted_at)}.</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-gray-200/80 shadow-sm lg:col-span-2"><CardContent className="p-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 border-b border-gray-100 text-sm">
            <div><div className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">Bill to</div>
              <div className="font-semibold text-gray-900">{d.bill_to.company || d.bill_to.name}</div>{d.bill_to.company && d.bill_to.name && <div className="text-gray-700">{d.bill_to.name}</div>}
              <div className="text-gray-500 text-xs mt-1 space-y-0.5">{d.bill_to.address && <div>{d.bill_to.address}</div>}<div>{[d.bill_to.city, d.bill_to.country === "India" ? meta.states[d.bill_to.state_code] : d.bill_to.country].filter(Boolean).join(", ")}</div>
                {d.bill_to.gstin && <div className="font-mono">GSTIN {d.bill_to.gstin}</div>}{d.bill_to.tax_id && <div className="font-mono">{d.bill_to.tax_id}</div>}{d.bill_to.email && <div>{d.bill_to.email}</div>}</div></div>
            <div className="text-xs space-y-1.5"><Fact l="Date" v={fmtDate(d.date)} />{d.valid_until && <Fact l="Valid until" v={fmtDate(d.valid_until)} />}{d.due_date && <Fact l="Due" v={fmtDate(d.due_date)} />}{d.po_number && <Fact l="PO / ref" v={d.po_number} />}</div>
            <div className="text-xs space-y-1.5"><Fact l="Currency" v={`${cur}${cur !== "INR" ? ` · 1 ${cur} = ₹${d.fx_rate}` : ""}`} /><Fact l="Tax" v={meta.tax_modes[d.tax_mode]?.label} />{isGst && <Fact l="Place of supply" v={`${meta.states[d.place_of_supply] || ""} (${d.place_of_supply})`} />}</div>
          </div>
          <table className="w-full text-sm" data-testid="billing-doc-lines">
            <thead><tr className="text-[11px] text-gray-500 border-b border-gray-100"><th className="text-left font-semibold py-2 px-5">Description</th>{isGst && <th className="text-left font-semibold py-2 px-2">SAC</th>}<th className="text-right font-semibold py-2 px-2">Qty</th><th className="text-right font-semibold py-2 px-2">Rate</th>{isGst && <th className="text-right font-semibold py-2 px-2">Tax</th>}<th className="text-right font-semibold py-2 px-5">Amount</th></tr></thead>
            <tbody>{d.items.map((it) => (
              <tr key={it.id} className="border-b border-gray-50 align-top"><td className="py-2.5 px-5"><div className="font-medium text-gray-900">{it.description}</div>{it.details && <div className="text-xs text-gray-500">{it.details}</div>}{it.discount_pct > 0 && <div className="text-[11px] text-emerald-700">{it.discount_pct}% off</div>}</td>
                {isGst && <td className="py-2.5 px-2 font-mono text-xs text-gray-600">{it.sac}</td>}<td className="py-2.5 px-2 text-right font-mono">{it.qty} <span className="text-xs text-gray-400">{it.unit}</span></td><td className="py-2.5 px-2 text-right font-mono">{money(it.unit_price, cur)}</td>
                {isGst && <td className="py-2.5 px-2 text-right font-mono text-xs">{it.tax_rate}%</td>}<td className="py-2.5 px-5 text-right font-mono">{money(it.net, cur)}</td></tr>))}</tbody>
          </table>
          <div className="flex flex-col sm:flex-row justify-between gap-4 p-5">
            <div className="text-xs text-gray-500 max-w-xs"><div className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">Amount in words</div><div className="text-gray-700">{d.amount_words}</div>
              {d.terms?.length > 0 && <div className="mt-3"><div className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">Terms</div><ol className="list-decimal pl-4 space-y-0.5">{d.terms.map((t, i) => <li key={i}>{t.title ? <b>{t.title}. </b> : null}{t.text}</li>)}</ol></div>}
              {d.notes && <div className="mt-3 text-gray-600">{d.notes}</div>}</div>
            <div className="text-sm space-y-1 sm:w-72" data-testid="billing-doc-totals">
              <Row l="Subtotal" v={money(d.subtotal, cur)} />{d.discount_total > 0 && <Row l="Discount" v={`− ${money(d.discount_total, cur)}`} />}
              {isGst && <Row l="Taxable" v={money(d.taxable, cur)} />}{d.cgst > 0 && <><Row l="CGST" v={money(d.cgst, cur)} /><Row l="SGST" v={money(d.sgst, cur)} /></>}{d.igst > 0 && <Row l="IGST" v={money(d.igst, cur)} />}
              {d.round_off_amount !== 0 && <Row l="Round off" v={money(d.round_off_amount, cur)} />}
              <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold"><span>Total</span><span className="font-mono">{money(d.total, cur)}</span></div>
              {d.balance != null && d.paid > 0 && <><Row l="Paid" v={money(d.paid, cur)} /><div className="flex justify-between font-bold"><span>Balance</span><span className="font-mono">{money(d.balance, cur)}</span></div></>}
              {cur !== "INR" && <div className="text-xs text-gray-400 text-right">≈ {money(d.inr_total, "INR")}</div>}
            </div>
          </div>
        </CardContent></Card>
        <div className="space-y-4">
          {(d.type === "invoice" || d.type === "proforma") && (
            <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Wallet className="h-4 w-4 text-emerald-600" /> Payments</CardTitle></CardHeader>
              <CardContent className="pt-0 space-y-2" data-testid="billing-payments">
                {(d.payments || []).length === 0 && <p className="text-xs text-gray-400">No payments recorded.</p>}
                {(d.payments || []).map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm border-b border-gray-50 last:border-0 py-1.5">
                    <div><div className="font-mono font-semibold">{money(p.amount, cur)}</div><div className="text-[11px] text-gray-400">{fmtDate(p.date)} · {p.method}{p.reference ? ` · ${p.reference}` : ""}</div></div>
                    {canManage && <button type="button" className="text-gray-300 hover:text-red-600" onClick={async () => { try { await api.delete(`/billing/docs/${id}/payments/${p.id}`); reload(); } catch (e) { toast.error(apiError(e)); } }} title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </div>))}
              </CardContent></Card>
          )}
          {d.children?.length > 0 && (
            <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Receipt className="h-4 w-4 text-[#F26B21]" /> Linked documents</CardTitle></CardHeader>
              <CardContent className="pt-0 space-y-1" data-testid="billing-children">{d.children.map((c) => <Link key={c.id} to={`/finance/billing/${c.id}`} className="flex items-center justify-between text-sm py-1 hover:text-[#F26B21]"><span className="font-mono">{c.number}</span><Pill tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Pill></Link>)}</CardContent></Card>
          )}
          <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-gray-400" /> History</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-1.5 text-xs text-gray-600" data-testid="billing-history">{(d.history || []).slice().reverse().map((h, i) => <div key={i}><span className="text-gray-400">{fmtDateTime(h.at)}</span> · {h.event}{h.by ? ` — ${h.by}` : ""}{h.note ? <span className="block text-gray-400 italic">{h.note}</span> : null}</div>)}</CardContent></Card>
        </div>
      </div>
      {kit.dialog}
      {pay && (
        <Dialog open onOpenChange={(o) => !o && setPay(null)}>
          <DialogContent className="max-w-md" data-testid="billing-payment-dialog">
            <DialogHeader><DialogTitle>Record a payment</DialogTitle><DialogDescription>Balance {money(d.balance, cur)}. Part payments are fine.</DialogDescription></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Amount (${cur})`}><Input inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} className="font-mono" data-testid="pay-amount" /></Field>
              <Field label="Date"><Input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></Field>
              <Field label="Method"><Select value={pay.method} onValueChange={(v) => setPay({ ...pay, method: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["bank", "upi", "card", "cash", "cheque", "paypal", "wise", "other"].map((m) => <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Reference"><Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="UTR / txn id" /></Field>
              {cur !== "INR" && <Field label="INR received (optional)" className="col-span-2"><Input inputMode="decimal" value={pay.inr_amount || ""} onChange={(e) => setPay({ ...pay, inr_amount: e.target.value })} className="font-mono" placeholder={`≈ ${money((Number(pay.amount) || 0) * d.fx_rate, "INR")}`} /></Field>}
              <Field label="Note" className="col-span-2"><Textarea rows={2} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></Field>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setPay(null)}>Cancel</Button>
              <Button className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="pay-save" onClick={async () => {
                try { await api.post(`/billing/docs/${id}/payments`, { ...pay, amount: Number(String(pay.amount).replace(/,/g, "")), inr_amount: pay.inr_amount ? Number(pay.inr_amount) : null }); toast.success("Payment recorded"); setPay(null); reload(); } catch (e) { toast.error(apiError(e)); }
              }}>Save payment</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {convert && (
        <Dialog open onOpenChange={(o) => !o && setConvert(null)}>
          <DialogContent className="max-w-md" data-testid="billing-convert-dialog">
            <DialogHeader><DialogTitle>{convert.to === "credit_note" ? `Credit note against ${d.number}` : `Create ${TYPE_LABEL[convert.to].toLowerCase()} from ${d.number}`}</DialogTitle>
              <DialogDescription>{convert.to === "credit_note" ? "Starts with the same lines — edit it down to what you're crediting." : "Lines, client and terms carry over; it starts as a draft you can edit."}</DialogDescription></DialogHeader>
            {convert.to === "credit_note" && <Field label="Reason"><Textarea rows={2} value={convert.reason} onChange={(e) => setConvert({ ...convert, reason: e.target.value })} placeholder="e.g. one deliverable not delivered" data-testid="cn-reason" /></Field>}
            <DialogFooter><Button variant="outline" onClick={() => setConvert(null)}>Cancel</Button>
              <Button className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="billing-convert-go" onClick={async () => {
                try { const { data } = await api.post(`/billing/docs/${id}/convert`, convert); toast.success(`${data.number} created`); setConvert(null); navigate(`/finance/billing/${data.id}${convert.to === "credit_note" ? "/edit" : ""}`); } catch (e) { toast.error(apiError(e)); }
              }}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

const Fact = ({ l, v }) => <div className="flex gap-2"><span className="text-gray-400 w-24 shrink-0">{l}</span><span className="text-gray-800">{v}</span></div>;
const Row = ({ l, v }) => <div className="flex justify-between text-gray-600"><span>{l}</span><span className="font-mono text-gray-900">{v}</span></div>;
