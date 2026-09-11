import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatINR, apiError } from "@/lib/api";
import { QUOTE_STATUS_STYLES } from "@/components/SalesLayout";
import { labelize } from "@/components/Badges";
import { DotindotLogo } from "@/components/DotindotLogo";
import { saveBlobResponse } from "@/components/ExportMenu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Pencil, Printer, Send, Check, X, FileDown } from "lucide-react";
import { toast } from "sonner";

export default function QuoteViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [quote, setQuote] = useState(null);

  const canWrite = ["super_admin", "admin", "sales"].includes(user.role);

  const load = useCallback(() => {
    api.get(`/sales/quotes/${id}`).then((r) => setQuote(r.data)).catch((e) => toast.error(apiError(e)));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!quote)
    return <div className="h-64 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  const setStatus = async (status) => {
    try {
      await api.post(`/sales/quotes/${id}/status`, { status });
      toast.success(`Quote marked ${status}`);
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const downloadPdf = async () => {
    try {
      const res = await api.get(`/exports/quote/${id}`, { responseType: "blob" });
      saveBlobResponse(res, `dotindot-quote-${quote.number}.pdf`);
      toast.success("Quote PDF downloaded");
    } catch (e) { toast.error("Download failed"); }
  };

  return (
    <div className="max-w-3xl space-y-5" data-testid="quote-view-page">
      {/* Toolbar (hidden on print) */}
      <div className="flex flex-wrap items-center justify-between gap-3 print-hide">
        <button onClick={() => navigate("/sales/quotes")} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#F26B21] transition-colors" data-testid="quote-back-btn">
          <ArrowLeft className="h-4 w-4" /> Back to quotes
        </button>
        <div className="flex items-center gap-2">
          {canWrite && quote.status === "draft" && (
            <Button size="sm" variant="outline" onClick={() => setStatus("sent")} data-testid="quote-mark-sent-btn">
              <Send className="h-3.5 w-3.5 mr-1.5" /> Mark sent
            </Button>
          )}
          {canWrite && quote.status === "sent" && (
            <>
              <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => setStatus("accepted")} data-testid="quote-mark-accepted-btn">
                <Check className="h-3.5 w-3.5 mr-1.5" /> Accepted
              </Button>
              <Button size="sm" variant="outline" className="text-red-500 border-red-200 hover:bg-red-50" onClick={() => setStatus("rejected")} data-testid="quote-mark-rejected-btn">
                <X className="h-3.5 w-3.5 mr-1.5" /> Rejected
              </Button>
            </>
          )}
          {canWrite && (
            <Button size="sm" variant="outline" onClick={() => navigate(`/sales/quotes/${id}/edit`)} data-testid="quote-edit-btn">
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={downloadPdf} data-testid="quote-download-pdf-btn">
            <FileDown className="h-3.5 w-3.5 mr-1.5 text-[#F26B21]" /> Download PDF
          </Button>
          <Button size="sm" onClick={() => window.print()} data-testid="quote-print-btn" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
            <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
          </Button>
        </div>
      </div>

      {/* Printable document */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 sm:p-10 print:border-0 print:shadow-none" data-testid="quote-document">
        <div className="flex items-start justify-between pb-6 border-b-2 border-[#F26B21]">
          <div>
            <DotindotLogo size={34} textClass="text-xl" />
            <div className="text-[11px] text-gray-400 mt-2 leading-relaxed">
              Dotindot Creative · AI-first digital agency<br />Mumbai, India · hello@dotindot.com
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-extrabold tracking-tight text-gray-900">QUOTATION</div>
            <div className="font-mono text-sm font-bold text-[#F26B21] mt-1" data-testid="quote-number">{quote.number}</div>
            <Badge variant="outline" className={`${QUOTE_STATUS_STYLES[quote.status]} mt-2`} data-testid="quote-view-status">{labelize(quote.status)}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 py-6 text-sm">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Prepared for</div>
            <div className="font-semibold text-gray-900">{quote.lead_name || quote.client_name || "—"}</div>
            <div className="text-gray-500">{quote.title}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Validity</div>
            <div className="font-semibold text-gray-900">{quote.validity_date || "—"}</div>
            <div className="text-gray-500">Prepared by {quote.created_by_name}</div>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              <th className="text-left py-2">Description</th>
              <th className="text-right py-2 w-16">Qty</th>
              <th className="text-right py-2 w-28">Unit ₹</th>
              <th className="text-right py-2 w-32">Total ₹</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((it, i) => (
              <tr key={i} className="border-b border-gray-100" data-testid={`quote-view-item-${i}`}>
                <td className="py-2.5 text-gray-800">{it.description}</td>
                <td className="py-2.5 text-right font-mono">{it.qty}</td>
                <td className="py-2.5 text-right font-mono">{Number(it.unit_price).toLocaleString("en-IN")}</td>
                <td className="py-2.5 text-right font-mono font-semibold">{Number(it.total).toLocaleString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end pt-4">
          <div className="w-64 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-mono" data-testid="quote-view-subtotal">{formatINR(quote.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">GST (18%)</span><span className="font-mono" data-testid="quote-view-gst">{quote.gst_enabled ? formatINR(quote.gst_amount) : "—"}</span></div>
            <div className="flex justify-between border-t-2 border-[#F26B21] pt-2 mt-2">
              <span className="font-bold text-gray-900">Total</span>
              <span className="font-mono font-bold text-lg text-[#F26B21]" data-testid="quote-view-total">{formatINR(quote.total)}</span>
            </div>
          </div>
        </div>

        {quote.notes && (
          <div className="mt-8 pt-4 border-t border-gray-100 text-xs text-gray-500">
            <span className="font-bold uppercase tracking-widest text-gray-400">Notes & terms: </span>{quote.notes}
          </div>
        )}
        <div className="mt-8 text-center text-[10px] text-gray-300">dotindot. — one platform, every operation. This quotation is valid until {quote.validity_date || "further notice"}.</div>
      </div>

      {quote.lead_id && (
        <div className="print-hide">
          <Link to={`/sales/leads/${quote.lead_id}`} className="text-sm text-[#F26B21] hover:underline" data-testid="quote-lead-link">
            View linked lead: {quote.lead_name} →
          </Link>
        </div>
      )}
    </div>
  );
}
