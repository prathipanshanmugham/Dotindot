import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import api, { formatINR, apiError } from "@/lib/api";
import SalesLayout from "@/components/SalesLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const EMPTY_ITEM = { description: "", qty: 1, unit_price: 0 };

export default function QuoteBuilderPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "", lead_id: searchParams.get("lead") || "none", client_id: "none",
    items: [{ ...EMPTY_ITEM }], gst_enabled: true, validity_date: "", notes: "",
  });

  useEffect(() => {
    api.get("/sales/leads").then((r) => setLeads(r.data)).catch(() => {});
    api.get("/clients").then((r) => setClients(r.data)).catch(() => {});
    if (isEdit) {
      api.get(`/sales/quotes/${id}`).then((r) => {
        const q = r.data;
        setForm({
          title: q.title, lead_id: q.lead_id || "none", client_id: q.client_id || "none",
          items: q.items.length ? q.items : [{ ...EMPTY_ITEM }],
          gst_enabled: q.gst_enabled, validity_date: q.validity_date || "", notes: q.notes || "",
        });
      }).catch((e) => toast.error(apiError(e)));
    }
  }, [id, isEdit]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const setItem = (i, k, v) => set("items", form.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));

  const subtotal = form.items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);
  const gst = form.gst_enabled ? subtotal * 0.18 : 0;
  const total = subtotal + gst;

  const save = async () => {
    if (!form.title.trim()) { toast.error("Quote title required"); return; }
    if (!form.items.some((it) => it.description.trim())) { toast.error("Add at least one line item"); return; }
    setBusy(true);
    try {
      const payload = {
        title: form.title,
        lead_id: form.lead_id === "none" ? null : form.lead_id,
        client_id: form.client_id === "none" ? null : form.client_id,
        items: form.items.filter((it) => it.description.trim()).map((it) => ({
          description: it.description, qty: Number(it.qty) || 1, unit_price: Number(it.unit_price) || 0,
        })),
        gst_enabled: form.gst_enabled,
        validity_date: form.validity_date || null,
        notes: form.notes,
      };
      if (isEdit) {
        await api.put(`/sales/quotes/${id}`, payload);
        toast.success("Quote updated");
        navigate(`/sales/quotes/${id}`);
      } else {
        const { data } = await api.post("/sales/quotes", payload);
        toast.success(`Quote ${data.number} saved as draft`);
        navigate(`/sales/quotes/${data.id}`);
      }
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <SalesLayout title={isEdit ? "Edit Quote" : "Quote Builder"} subtitle="Line items with live totals · 18% GST toggle">
      <button onClick={() => navigate("/sales/quotes")} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#F26B21] transition-colors" data-testid="builder-back-btn">
        <ArrowLeft className="h-4 w-4" /> Back to quotes
      </button>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-gray-200/80 lg:col-span-2">
          <CardContent className="p-5 space-y-4">
            <div className="space-y-1"><Label>Title *</Label><Input data-testid="quote-form-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Website Revamp Proposal — Orchid Grand" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Linked lead</Label>
                <Select value={form.lead_id} onValueChange={(v) => set("lead_id", v)}>
                  <SelectTrigger data-testid="quote-form-lead"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {leads.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Linked client</Label>
                <Select value={form.client_id} onValueChange={(v) => set("client_id", v)}>
                  <SelectTrigger data-testid="quote-form-client"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold">Line items</Label>
              <div className="space-y-2 mt-2">
                <div className="grid grid-cols-[1.8fr_0.5fr_0.8fr_0.8fr_auto] gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 px-1">
                  <span>Description</span><span>Qty</span><span>Unit price ₹</span><span className="text-right">Total</span><span />
                </div>
                {form.items.map((it, i) => (
                  <div key={i} className="grid grid-cols-[1.8fr_0.5fr_0.8fr_0.8fr_auto] gap-2 items-center">
                    <Input data-testid={`quote-item-desc-${i}`} value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} placeholder="Service / deliverable" />
                    <Input data-testid={`quote-item-qty-${i}`} type="number" min="0" value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} />
                    <Input data-testid={`quote-item-price-${i}`} type="number" min="0" value={it.unit_price} onChange={(e) => setItem(i, "unit_price", e.target.value)} />
                    <div className="text-right font-mono text-sm font-semibold">{formatINR((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}</div>
                    <Button variant="ghost" size="icon" onClick={() => set("items", form.items.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-gray-300" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => set("items", [...form.items, { ...EMPTY_ITEM }])} data-testid="quote-add-item-btn">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add line item
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Valid until</Label><Input data-testid="quote-form-validity" type="date" value={form.validity_date} onChange={(e) => set("validity_date", e.target.value)} /></div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={form.gst_enabled} onCheckedChange={(v) => set("gst_enabled", v)} data-testid="quote-gst-toggle" />
                <Label className="text-sm">Apply 18% GST</Label>
              </div>
            </div>
            <div className="space-y-1"><Label>Notes / terms</Label><Textarea data-testid="quote-form-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
          </CardContent>
        </Card>

        {/* Live totals */}
        <Card className="border-gray-200/80 h-fit sticky top-24">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Totals (live)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="font-mono font-semibold" data-testid="quote-live-subtotal">{formatINR(subtotal)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">GST (18%)</span><span className="font-mono" data-testid="quote-live-gst">{formatINR(gst)}</span></div>
            <div className="h-px bg-gray-200" />
            <div className="flex justify-between"><span className="font-semibold text-gray-800">Total</span><span className="font-mono font-bold text-lg text-[#F26B21]" data-testid="quote-live-total">{formatINR(total)}</span></div>
            <Button onClick={save} disabled={busy} data-testid="quote-save-btn" className="w-full bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
              {busy ? "Saving..." : isEdit ? "Save changes" : "Save quote (draft)"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </SalesLayout>
  );
}
