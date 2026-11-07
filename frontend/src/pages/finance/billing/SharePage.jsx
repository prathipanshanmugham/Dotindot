// v3.2 — public view of a quotation / invoice via its share link (no login). Clients can accept a quotation here.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { DotindotWordmark } from "@/components/DotindotLogo";
import { money, STATUS_LABEL, STATUS_TONE, TYPE_LABEL } from "./billingKit";
import { Pill, fmtDate } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Download, CheckCircle2 } from "lucide-react";
import { API_ROOT } from "@/lib/base";

const API = API_ROOT;

export default function SharePage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [acc, setAcc] = useState({ name: "", email: "", note: "" });
  const [busy, setBusy] = useState(false);
  const load = () => axios.get(`${API}/share/billing/${token}`).then((r) => setData(r.data)).catch((e) => setErr(e.response?.data?.detail || "This link isn't valid"));
  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const pdf = async () => {
    try { const r = await axios.get(`${API}/share/billing/${token}/pdf`, { responseType: "blob" }); const u = URL.createObjectURL(r.data); const a = document.createElement("a"); a.href = u; a.download = `${data.doc.number.replace(/\//g, "-")}.pdf`; a.click(); URL.revokeObjectURL(u); } catch { toast.error("Couldn't download the PDF"); }
  };
  const accept = async () => {
    setBusy(true);
    try { await axios.post(`${API}/share/billing/${token}/accept`, acc); toast.success("Thank you — the quotation is accepted"); load(); } catch (e) { toast.error(e.response?.data?.detail || "Couldn't accept"); } finally { setBusy(false); }
  };
  if (err) return <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm" data-testid="share-error">{err}</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center"><div className="h-8 w-8 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;
  const { doc: d, company: co } = data;
  const isGst = d.tax_mode === "gst_intra" || d.tax_mode === "gst_inter";
  return (
    <div className="min-h-screen bg-[#F7F7F8] py-8 px-4" data-testid="share-page">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">{co.logo ? <img src={co.logo} alt={co.legal_name} className="h-10 object-contain" /> : <DotindotWordmark className="h-7" />}
          <Button size="sm" variant="outline" onClick={pdf} data-testid="share-pdf"><Download className="h-3.5 w-3.5 mr-1.5" /> PDF</Button></div>
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400">{TYPE_LABEL[d.type]}</div><h1 className="text-2xl font-bold font-mono text-gray-900">{d.number}</h1>{d.title && <p className="text-gray-700 mt-1">{d.title}</p>}</div>
            <div className="text-right text-sm text-gray-600"><Pill tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Pill><div className="mt-2">Dated {fmtDate(d.date)}</div>{d.valid_until && <div>Valid until {fmtDate(d.valid_until)}</div>}{d.due_date && <div>Due {fmtDate(d.due_date)}</div>}</div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm"><div><div className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">From</div><div className="font-semibold">{co.legal_name}</div>{co.gstin && <div className="text-xs text-gray-500 font-mono">GSTIN {co.gstin}</div>}<div className="text-xs text-gray-500">{co.email}{co.phone ? ` · ${co.phone}` : ""}</div></div>
            <div><div className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">To</div><div className="font-semibold">{d.bill_to.company || d.bill_to.name}</div>{d.bill_to.company && d.bill_to.name && <div>{d.bill_to.name}</div>}{d.bill_to.gstin && <div className="text-xs text-gray-500 font-mono">GSTIN {d.bill_to.gstin}</div>}</div></div>
          <table className="w-full text-sm" data-testid="share-lines"><thead><tr className="text-[11px] text-gray-500 border-b border-gray-200"><th className="text-left font-semibold py-2">Description</th><th className="text-right font-semibold py-2">Qty</th><th className="text-right font-semibold py-2">Rate</th><th className="text-right font-semibold py-2">Amount</th></tr></thead>
            <tbody>{d.items.map((it) => <tr key={it.id} className="border-b border-gray-100 align-top"><td className="py-2"><div className="font-medium text-gray-900">{it.description}</div>{it.details && <div className="text-xs text-gray-500">{it.details}</div>}</td><td className="py-2 text-right font-mono">{it.qty} <span className="text-xs text-gray-400">{it.unit}</span></td><td className="py-2 text-right font-mono">{money(it.unit_price, d.currency)}</td><td className="py-2 text-right font-mono">{money(it.net, d.currency)}</td></tr>)}</tbody></table>
          <div className="flex justify-end"><div className="w-72 text-sm space-y-1">
            <R l="Subtotal" v={money(d.subtotal, d.currency)} />{d.discount_total > 0 && <R l="Discount" v={`− ${money(d.discount_total, d.currency)}`} />}{isGst && <R l="Taxable" v={money(d.taxable, d.currency)} />}
            {d.cgst > 0 && <><R l="CGST" v={money(d.cgst, d.currency)} /><R l="SGST" v={money(d.sgst, d.currency)} /></>}{d.igst > 0 && <R l="IGST" v={money(d.igst, d.currency)} />}{d.round_off_amount !== 0 && <R l="Round off" v={money(d.round_off_amount, d.currency)} />}
            <div className="flex justify-between border-t border-gray-200 pt-2 text-lg font-bold"><span>Total</span><span className="font-mono" data-testid="share-total">{money(d.total, d.currency)}</span></div>
            {d.balance != null && d.paid > 0 && <div className="flex justify-between font-semibold"><span>Balance due</span><span className="font-mono">{money(d.balance, d.currency)}</span></div>}
            <div className="text-xs text-gray-400 text-right">{d.amount_words}</div></div></div>
          {d.terms?.length > 0 && <div><div className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">Terms & conditions</div><ol className="list-decimal pl-5 text-xs text-gray-600 space-y-1">{d.terms.map((t, i) => <li key={i}>{t.title ? <b>{t.title}. </b> : null}{t.text}</li>)}</ol></div>}
          {d.notes && <p className="text-sm text-gray-600">{d.notes}</p>}
        </div>
        {d.type === "quotation" && d.status === "sent" && (
          <div className="rounded-2xl bg-white border border-[#F26B21]/40 shadow-sm p-6 space-y-3" data-testid="share-accept">
            <h2 className="font-semibold text-gray-900">Accept this quotation</h2><p className="text-sm text-gray-600">Type your name to accept the quotation and its terms. We'll get started right away.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Input placeholder="Your name" value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} data-testid="share-accept-name" /><Input placeholder="Email (optional)" value={acc.email} onChange={(e) => setAcc({ ...acc, email: e.target.value })} /></div>
            <Textarea rows={2} placeholder="Anything to add? (optional)" value={acc.note} onChange={(e) => setAcc({ ...acc, note: e.target.value })} />
            <Button className="bg-[#F26B21] hover:bg-[#E05A10] text-white" disabled={busy || !acc.name.trim()} onClick={accept} data-testid="share-accept-btn"><CheckCircle2 className="h-4 w-4 mr-1.5" /> Accept quotation</Button>
          </div>
        )}
        {d.status === "accepted" && <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 flex items-center gap-2" data-testid="share-accepted"><CheckCircle2 className="h-4 w-4" /> Accepted by {d.accepted_by} on {fmtDate(d.accepted_at)}. Thank you!</div>}
        <p className="text-center text-xs text-gray-400">{co.legal_name} · {co.website}</p>
      </div>
    </div>
  );
}
const R = ({ l, v }) => <div className="flex justify-between text-gray-600"><span>{l}</span><span className="font-mono text-gray-900">{v}</span></div>;
