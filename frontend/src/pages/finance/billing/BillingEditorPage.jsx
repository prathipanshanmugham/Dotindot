// v3.2 Billing — create / edit a quotation, proforma or invoice.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useLoad, Spinner, PageHead, Field, Pill, PhoneActionBar } from "@/components/kit";
import { money, computeTotals, TYPE_LABEL } from "./billingKit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Trash2, GripVertical, ListChecks, X, ChevronUp, ChevronDown, Sparkles } from "lucide-react";

const blankLine = (sac) => ({ key: Math.random().toString(36).slice(2), description: "", details: "", sac: sac || "", qty: 1, unit: "service", unit_price: "", discount_pct: "", tax_rate: "" });
const EMPTY_PARTY = { name: "", company: "", email: "", phone: "", address: "", city: "", state_code: "", country: "India", gstin: "", tax_id: "" };

export default function BillingEditorPage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const [meta] = useLoad("/billing/meta");
  const [terms] = useLoad("/billing/terms");
  const [existing] = useLoad(id ? `/billing/docs/${id}` : null);
  const [f, setF] = useState(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setBill = (k, v) => setF((x) => ({ ...x, bill_to: { ...x.bill_to, [k]: v } }));

  useEffect(() => {
    if (!meta || f) return;
    const dft = meta.company.defaults;
    if (id) {
      if (!existing) return;
      setF({ ...existing, items: existing.items.map((it) => ({ ...it, key: it.id, tax_rate: it.tax_rate ?? "", discount_pct: it.discount_pct || "", unit_price: it.unit_price })),
        term_ids: existing.terms.filter((t) => t.id).map((t) => t.id), custom_terms: existing.terms.filter((t) => !t.id).map((t) => t.text),
        discount_pct: existing.discount_pct || "", discount_amount: existing.discount_amount || "", fx_rate: existing.fx_rate && existing.currency !== "INR" ? existing.fx_rate : "" });
      return;
    }
    const type = ["quotation", "proforma", "invoice"].includes(sp.get("type")) ? sp.get("type") : "quotation";
    const cid = sp.get("client") || "";
    const c = meta.clients.find((x) => x.id === cid);
    const defaultTerms = (terms || []).filter((t) => t.active && (t.default_for || []).includes(type) && (t.tags || []).includes("all")).map((t) => t.id);
    setF({ type, client_id: cid, lead_id: sp.get("lead") || null, project_id: null, title: "", bill_to: partyFromClient(c, meta), date: meta.today, valid_until: "", due_date: "",
      currency: c?.currency && meta.currencies[c.currency] ? c.currency : dft.currency, fx_rate: "", tax_mode: guessTaxMode(c, meta), place_of_supply: "",
      items: [blankLine(dft.sac)], discount_pct: "", discount_amount: "", round_off: true, term_ids: defaultTerms, custom_terms: [], notes: dft.notes, po_number: "", reference: "",
      service_tags: [], show_qr: dft.show_qr, show_certs: dft.show_certs });
  }, [meta, existing, terms, id, sp, f]);

  const totals = useMemo(() => f && meta ? computeTotals(f.items, f.currency, f.tax_mode, f.discount_pct, f.discount_amount, f.round_off, Number(meta.company.defaults.tax_rate)) : null, [f, meta]);
  if (!meta || !f || (id && !existing)) return <Spinner />;
  const isGst = f.tax_mode === "gst_intra" || f.tax_mode === "gst_inter";
  const foreign = f.currency !== "INR";
  const editing = !!id;

  const pickClient = (cid) => {
    const c = meta.clients.find((x) => x.id === cid);
    setF((x) => ({ ...x, client_id: cid === "none" ? "" : cid, bill_to: c ? partyFromClient(c, meta) : x.bill_to, tax_mode: c ? guessTaxMode(c, meta) : x.tax_mode,
      currency: c?.currency && meta.currencies[c.currency] ? c.currency : x.currency }));
  };
  const setCurrency = (cur) => setF((x) => ({ ...x, currency: cur, tax_mode: cur !== "INR" && (x.tax_mode === "gst_intra" || x.tax_mode === "gst_inter") ? "zero_rated" : x.tax_mode, round_off: cur === "INR" ? x.round_off : false }));
  const updLine = (k, key, v) => set("items", f.items.map((it) => (it.key === key ? { ...it, [k]: v } : it)));
  const moveLine = (key, dir) => { const i = f.items.findIndex((x) => x.key === key); const j = i + dir; if (j < 0 || j >= f.items.length) return; const a = [...f.items]; [a[i], a[j]] = [a[j], a[i]]; set("items", a); };

  const save = async (andSend = false) => {
    setBusy(true);
    try {
      const body = { ...f, items: f.items.map(({ key, ...it }) => ({ ...it, qty: Number(it.qty) || 0, unit_price: Number(String(it.unit_price).replace(/,/g, "")) || 0,
        discount_pct: Number(it.discount_pct) || 0, tax_rate: it.tax_rate === "" || it.tax_rate == null ? null : Number(it.tax_rate) })),
        discount_pct: Number(f.discount_pct) || 0, discount_amount: Number(f.discount_amount) || 0, fx_rate: foreign ? Number(f.fx_rate) || null : null,
        client_id: f.client_id || null, valid_until: f.valid_until || null, due_date: f.due_date || null };
      delete body.terms; delete body.history; delete body.payments;
      const { data } = editing ? await api.put(`/billing/docs/${id}`, body) : await api.post("/billing/docs", body);
      if (andSend) await api.post(`/billing/docs/${data.id}/status`, { status: "sent" });
      toast.success(`${TYPE_LABEL[data.type]} ${data.number} ${editing ? "updated" : "created"}${andSend ? " and marked sent" : ""}`);
      navigate(`/finance/billing/${data.id}`);
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const chosenTerms = (terms || []).filter((t) => f.term_ids.includes(t.id)).sort((a, b) => f.term_ids.indexOf(a.id) - f.term_ids.indexOf(b.id));
  return (
    <div className="space-y-5 max-w-6xl" data-testid="billing-editor">
      <PageHead kicker="Finance · Billing" title={editing ? `Edit ${f.number}` : `New ${TYPE_LABEL[f.type].toLowerCase()}`}
        sub={editing ? "" : "Fill in the client, lines and terms. Totals, tax and the amount in words are worked out for you."}
        actions={<>
          <Button variant="outline" size="sm" onClick={() => navigate(editing ? `/finance/billing/${id}` : "/finance/billing")}>Cancel</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => save(false)} data-testid="billing-save" className="max-md:hidden">{busy ? "Saving…" : "Save draft"}</Button>
          <Button size="sm" disabled={busy} className="bg-[#F26B21] hover:bg-[#E05A10] text-white max-md:hidden" onClick={() => save(true)} data-testid="billing-save-send">Save & mark sent</Button>
        </>} />
      <PhoneActionBar testid="billing-phone-actions">
        <Button variant="outline" disabled={busy} onClick={() => save(false)} data-testid="billing-save-m">{busy ? "Saving…" : "Save draft"}</Button>
        <Button disabled={busy} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" onClick={() => save(true)} data-testid="billing-save-send-m">Save & mark sent</Button>
      </PhoneActionBar>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* who */}
        <Card className="border-gray-200/80 shadow-sm lg:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Bill to</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Client" className="sm:col-span-2">
              <Select value={f.client_id || "none"} onValueChange={pickClient} disabled={editing}>
                <SelectTrigger data-testid="billing-client"><SelectValue placeholder="Pick a client or bill a new contact" /></SelectTrigger>
                <SelectContent><SelectItem value="none">New contact (not a client yet)</SelectItem><SelectSeparator />{meta.clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.company && c.company !== c.name ? ` · ${c.company}` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Company"><Input value={f.bill_to.company} onChange={(e) => setBill("company", e.target.value)} data-testid="billing-bt-company" /></Field>
            <Field label="Contact name"><Input value={f.bill_to.name} onChange={(e) => setBill("name", e.target.value)} data-testid="billing-bt-name" /></Field>
            <Field label="Email"><Input value={f.bill_to.email} onChange={(e) => setBill("email", e.target.value)} /></Field>
            <Field label="Phone"><Input value={f.bill_to.phone} onChange={(e) => setBill("phone", e.target.value)} /></Field>
            <Field label="Address" className="sm:col-span-2"><Input value={f.bill_to.address} onChange={(e) => setBill("address", e.target.value)} placeholder="Street, area" /></Field>
            <Field label="City"><Input value={f.bill_to.city} onChange={(e) => setBill("city", e.target.value)} /></Field>
            <Field label="Country"><Input value={f.bill_to.country} onChange={(e) => setBill("country", e.target.value)} data-testid="billing-bt-country" /></Field>
            {f.bill_to.country === "India" ? <>
              <Field label="State (place of supply)">
                <Select value={f.bill_to.state_code || "none"} onValueChange={(v) => setBill("state_code", v === "none" ? "" : v)}>
                  <SelectTrigger data-testid="billing-bt-state"><SelectValue placeholder="State" /></SelectTrigger>
                  <SelectContent className="max-h-72"><SelectItem value="none">—</SelectItem>{Object.entries(meta.states).map(([k, v]) => <SelectItem key={k} value={k}>{v} ({k})</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Client GSTIN" hint="Leave empty for unregistered (B2C)"><Input value={f.bill_to.gstin} onChange={(e) => setBill("gstin", e.target.value.toUpperCase())} className="font-mono" data-testid="billing-bt-gstin" /></Field>
            </> : <Field label="Tax ID (VAT / TRN / EIN)"><Input value={f.bill_to.tax_id} onChange={(e) => setBill("tax_id", e.target.value)} /></Field>}
          </CardContent></Card>
        {/* document facts */}
        <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Document</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Field label="Title / subject" className="col-span-2"><Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Website redesign & SEO retainer" data-testid="billing-title" /></Field>
            <Field label="Date"><Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
            {f.type === "quotation" ? <Field label="Valid until" hint={`Blank = ${meta.company.defaults.validity_days} days`}><Input type="date" value={f.valid_until || ""} onChange={(e) => set("valid_until", e.target.value)} /></Field>
              : <Field label="Due date" hint={`Blank = ${meta.company.defaults.due_days} days`}><Input type="date" value={f.due_date || ""} onChange={(e) => set("due_date", e.target.value)} /></Field>}
            <Field label="Currency">
              <Select value={f.currency} onValueChange={setCurrency}><SelectTrigger data-testid="billing-currency"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(meta.currencies).map(([k, v]) => <SelectItem key={k} value={k}>{k} — {v.name}</SelectItem>)}</SelectContent></Select>
            </Field>
            {foreign ? <Field label={`1 ${f.currency} = ₹`} hint="Rate on the document date"><Input inputMode="decimal" value={f.fx_rate} onChange={(e) => set("fx_rate", e.target.value)} placeholder="83.40" data-testid="billing-fx" /></Field>
              : <Field label="PO / reference"><Input value={f.po_number} onChange={(e) => set("po_number", e.target.value)} /></Field>}
            <Field label="Tax" className="col-span-2">
              <Select value={f.tax_mode} onValueChange={(v) => set("tax_mode", v)}><SelectTrigger data-testid="billing-tax-mode"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(meta.tax_modes).filter(([k, v]) => !(foreign && v.india)).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select>
            </Field>
            {foreign && <Field label="PO / reference" className="col-span-2"><Input value={f.po_number} onChange={(e) => set("po_number", e.target.value)} /></Field>}
            <Field label="Service type" hint="Suggests matching terms" className="col-span-2">
              <div className="flex flex-wrap gap-1.5">{meta.service_tags.filter((t) => t !== "all").map((t) => {
                const on = f.service_tags.includes(t);
                return <button key={t} type="button" onClick={() => set("service_tags", on ? f.service_tags.filter((x) => x !== t) : [...f.service_tags, t])}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${on ? "bg-[#FFF7ED] border-[#F26B21] text-[#F26B21]" : "border-gray-200 text-gray-600"}`} data-testid={`billing-tag-${t}`}>{t}</button>;
              })}</div>
            </Field>
          </CardContent></Card>
      </div>

      {/* lines */}
      <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-2 flex-row flex-wrap items-center justify-between gap-2 space-y-0"><CardTitle className="text-sm font-semibold">Line items</CardTitle>
        <Button size="sm" variant="outline" onClick={() => set("items", [...f.items, blankLine(meta.company.defaults.sac)])} data-testid="billing-add-line"><Plus className="h-3.5 w-3.5 mr-1" /> Add line</Button></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {/* phones: one card per line, every field full size */}
          <div className="md:hidden divide-y divide-gray-100 border-t border-gray-100" data-testid="billing-lines-mobile">{f.items.map((it, i) => {
            const ln = totals.lines[i];
            return (
              <div key={it.key} className="p-4 space-y-2.5" data-testid={`billing-mline-${i}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-500">Line {i + 1}</span>
                  <div className="flex items-center">
                    <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0} onClick={() => moveLine(it.key, -1)} aria-label="Move up"><ChevronUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === f.items.length - 1} onClick={() => moveLine(it.key, 1)} aria-label="Move down"><ChevronDown className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-red-600" disabled={f.items.length === 1} onClick={() => set("items", f.items.filter((x) => x.key !== it.key))} aria-label="Remove line"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <Input value={it.description} onChange={(e) => updLine("description", it.key, e.target.value)} placeholder="What you're delivering" />
                <Input value={it.details} onChange={(e) => updLine("details", it.key, e.target.value)} placeholder="Details shown under the line (optional)" className="text-xs border-dashed" />
                {isGst && <Field label="SAC"><Select value={it.sac || "none"} onValueChange={(v) => updLine("sac", it.key, v === "none" ? "" : v)}><SelectTrigger className="text-xs font-mono"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72"><SelectItem value="none">—</SelectItem>{meta.sac.map(([c, l]) => <SelectItem key={c} value={c}><span className="font-mono">{c}</span> <span className="text-gray-500 text-xs">{l}</span></SelectItem>)}</SelectContent></Select></Field>}
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="Qty"><Input inputMode="decimal" value={it.qty} onChange={(e) => updLine("qty", it.key, e.target.value)} className="text-right font-mono" /></Field>
                  <Field label="Unit"><Select value={it.unit || "service"} onValueChange={(v) => updLine("unit", it.key, v)}><SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{meta.units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></Field>
                  <Field label="Rate"><Input inputMode="decimal" value={it.unit_price} onChange={(e) => updLine("unit_price", it.key, e.target.value)} className="text-right font-mono" placeholder="0.00" /></Field>
                  <Field label="Disc %"><Input inputMode="decimal" value={it.discount_pct} onChange={(e) => updLine("discount_pct", it.key, e.target.value)} className="text-right font-mono" placeholder="0" /></Field>
                  {isGst && <Field label="Tax %"><Input inputMode="decimal" value={it.tax_rate} onChange={(e) => updLine("tax_rate", it.key, e.target.value)} className="text-right font-mono" placeholder={String(meta.company.defaults.tax_rate)} /></Field>}
                  <div className={`flex flex-col justify-end ${isGst ? "" : "col-span-2"}`}><div className="text-xs text-gray-500">Amount</div><div className="font-mono font-semibold text-right py-2">{money(ln?.net || 0, f.currency)}</div></div>
                </div>
              </div>);
          })}</div>
          <table className="hidden md:table w-full text-sm min-w-[820px]" data-testid="billing-lines">
            <thead><tr className="text-[11px] text-gray-500 border-b border-gray-100"><th className="w-8" /><th className="text-left font-semibold py-2 px-2 min-w-[200px]">Description</th>{isGst && <th className="text-left font-semibold py-2 px-2 w-28">SAC</th>}
              <th className="text-right font-semibold py-2 px-2 w-20">Qty</th><th className="text-left font-semibold py-2 px-2 w-24">Unit</th><th className="text-right font-semibold py-2 px-2 w-32">Rate</th>
              <th className="text-right font-semibold py-2 px-2 w-20">Disc %</th>{isGst && <th className="text-right font-semibold py-2 px-2 w-20">Tax %</th>}<th className="text-right font-semibold py-2 px-2 w-32">Amount</th><th className="w-20" /></tr></thead>
            <tbody>{f.items.map((it, i) => {
              const ln = totals.lines[i];
              return (
                <tr key={it.key} className="border-b border-gray-50 align-top" data-testid={`billing-line-${i}`}>
                  <td className="py-2 pl-2 text-gray-300"><GripVertical className="h-4 w-4 mt-2" /></td>
                  <td className="py-2 px-2"><Input value={it.description} onChange={(e) => updLine("description", it.key, e.target.value)} placeholder="What you're delivering" className="h-8" data-testid={`billing-line-desc-${i}`} />
                    <Input value={it.details} onChange={(e) => updLine("details", it.key, e.target.value)} placeholder="Details shown under the line (optional)" className="h-7 mt-1 text-xs border-dashed" /></td>
                  {isGst && <td className="py-2 px-2">
                    <Select value={it.sac || "none"} onValueChange={(v) => updLine("sac", it.key, v === "none" ? "" : v)}><SelectTrigger className="h-8 w-28 text-xs font-mono"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-72"><SelectItem value="none">—</SelectItem>{meta.sac.map(([c, l]) => <SelectItem key={c} value={c}><span className="font-mono">{c}</span> <span className="text-gray-500 text-xs">{l}</span></SelectItem>)}</SelectContent></Select></td>}
                  <td className="py-2 px-2"><Input inputMode="decimal" value={it.qty} onChange={(e) => updLine("qty", it.key, e.target.value)} className="h-8 text-right font-mono" data-testid={`billing-line-qty-${i}`} /></td>
                  <td className="py-2 px-2"><Select value={it.unit || "service"} onValueChange={(v) => updLine("unit", it.key, v)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{meta.units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></td>
                  <td className="py-2 px-2"><Input inputMode="decimal" value={it.unit_price} onChange={(e) => updLine("unit_price", it.key, e.target.value)} className="h-8 text-right font-mono" placeholder="0.00" data-testid={`billing-line-rate-${i}`} /></td>
                  <td className="py-2 px-2"><Input inputMode="decimal" value={it.discount_pct} onChange={(e) => updLine("discount_pct", it.key, e.target.value)} className="h-8 text-right font-mono" placeholder="0" /></td>
                  {isGst && <td className="py-2 px-2"><Input inputMode="decimal" value={it.tax_rate} onChange={(e) => updLine("tax_rate", it.key, e.target.value)} className="h-8 text-right font-mono" placeholder={String(meta.company.defaults.tax_rate)} /></td>}
                  <td className="py-2 px-2 text-right font-mono pt-3.5" data-testid={`billing-line-amount-${i}`}>{money(ln?.net || 0, f.currency)}</td>
                  <td className="py-2 px-1 whitespace-nowrap"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveLine(it.key, -1)}><ChevronUp className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveLine(it.key, 1)}><ChevronDown className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-red-600" disabled={f.items.length === 1} onClick={() => set("items", f.items.filter((x) => x.key !== it.key))}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                </tr>);
            })}</tbody>
          </table>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border-t border-gray-100">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Overall discount %"><Input inputMode="decimal" value={f.discount_pct} onChange={(e) => set("discount_pct", e.target.value)} placeholder="0" className="h-8 font-mono" /></Field>
                <Field label="…or discount amount"><Input inputMode="decimal" value={f.discount_amount} onChange={(e) => set("discount_amount", e.target.value)} placeholder="0" className="h-8 font-mono" /></Field>
              </div>
              {!foreign && <label className="flex items-center gap-2 text-sm text-gray-700"><Switch checked={f.round_off} onCheckedChange={(v) => set("round_off", v)} /> Round off to the rupee</label>}
              <label className="flex items-center gap-2 text-sm text-gray-700"><Switch checked={f.show_qr} onCheckedChange={(v) => set("show_qr", v)} /> UPI QR code on the PDF (INR only)</label>
              <label className="flex items-center gap-2 text-sm text-gray-700"><Switch checked={f.show_certs} onCheckedChange={(v) => set("show_certs", v)} /> Certifications strip on the PDF</label>
            </div>
            <div className="text-sm space-y-1 md:justify-self-end md:w-80" data-testid="billing-totals">
              <Row l="Subtotal" v={money(totals.subtotal, f.currency)} />
              {totals.discount > 0 && <Row l="Discount" v={`− ${money(totals.discount, f.currency)}`} />}
              {isGst && <Row l="Taxable value" v={money(totals.taxable, f.currency)} />}
              {f.tax_mode === "gst_intra" && <><Row l="CGST" v={money(totals.cgst, f.currency)} /><Row l="SGST" v={money(totals.sgst, f.currency)} /></>}
              {f.tax_mode === "gst_inter" && <Row l="IGST" v={money(totals.igst, f.currency)} />}
              {f.tax_mode === "zero_rated" && <Row l="IGST (zero-rated under LUT)" v={money(0, f.currency)} />}
              {totals.roundOff !== 0 && <Row l="Round off" v={money(totals.roundOff, f.currency)} />}
              <div className="flex justify-between border-t border-gray-200 pt-2 mt-1 text-base font-bold"><span>Total</span><span className="font-mono" data-testid="billing-total">{money(totals.total, f.currency)}</span></div>
              {foreign && Number(f.fx_rate) > 0 && <div className="text-xs text-gray-400 text-right">≈ {money(totals.total * Number(f.fx_rate), "INR")}</div>}
            </div>
          </div>
        </CardContent></Card>

      {/* terms + notes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-gray-200/80 shadow-sm lg:col-span-2"><CardHeader className="pb-2 flex-row flex-wrap items-center justify-between gap-2 space-y-0"><CardTitle className="text-sm font-semibold">Terms & conditions <span className="text-gray-400 font-normal">({chosenTerms.length + f.custom_terms.filter(Boolean).length})</span></CardTitle>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setTermsOpen(true)} data-testid="billing-pick-terms"><ListChecks className="h-3.5 w-3.5 mr-1" /> Choose from library</Button>
            <Button size="sm" variant="ghost" onClick={() => set("custom_terms", [...f.custom_terms, ""])}><Plus className="h-3.5 w-3.5 mr-1" /> Custom clause</Button></div></CardHeader>
          <CardContent className="space-y-2">
            {chosenTerms.length === 0 && f.custom_terms.length === 0 && <p className="text-sm text-gray-400">No terms yet — pick the ones that fit this job.</p>}
            {chosenTerms.map((t, i) => (
              <div key={t.id} className="flex items-start gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm" data-testid={`billing-term-${t.id}`}>
                <span className="text-xs text-gray-400 font-mono mt-0.5 w-5">{i + 1}.</span>
                <div className="flex-1 min-w-0"><span className="font-semibold text-gray-800">{t.title}.</span> <span className="text-gray-600">{t.text}</span></div>
                <button type="button" className="text-gray-300 hover:text-red-600" onClick={() => set("term_ids", f.term_ids.filter((x) => x !== t.id))}><X className="h-4 w-4" /></button>
              </div>))}
            {f.custom_terms.map((ct, i) => (
              <div key={i} className="flex items-start gap-2"><span className="text-xs text-gray-400 font-mono mt-2.5 w-5">{chosenTerms.length + i + 1}.</span>
                <Textarea rows={2} value={ct} onChange={(e) => set("custom_terms", f.custom_terms.map((x, j) => (j === i ? e.target.value : x)))} placeholder="One-off clause for this document" className="text-sm" data-testid={`billing-custom-term-${i}`} />
                <button type="button" className="text-gray-300 hover:text-red-600 mt-2" onClick={() => set("custom_terms", f.custom_terms.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button></div>))}
          </CardContent></Card>
        <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Notes on the document</CardTitle></CardHeader>
          <CardContent><Textarea rows={5} value={f.notes} onChange={(e) => set("notes", e.target.value)} data-testid="billing-notes" /></CardContent></Card>
      </div>

      {termsOpen && <TermsPicker terms={terms || []} selected={f.term_ids} type={f.type} tags={f.service_tags} meta={meta} onClose={() => setTermsOpen(false)} onChange={(ids) => set("term_ids", ids)} />}
    </div>
  );
}

const Row = ({ l, v }) => <div className="flex justify-between text-gray-600"><span>{l}</span><span className="font-mono text-gray-900">{v}</span></div>;

function partyFromClient(c, meta) {
  if (!c) return { ...EMPTY_PARTY, state_code: "" };
  const b = c.billing || {};
  const stateCode = b.state_code || Object.entries(meta.states).find(([, v]) => v.toLowerCase() === String(c.state || "").toLowerCase())?.[0] || "";
  return { ...EMPTY_PARTY, name: b.name || "", company: b.company || c.company || c.name, email: b.email || c.email || "", phone: b.phone || c.phone || "", address: b.address || "",
    city: b.city || c.city || "", state_code: stateCode, country: b.country || "India", gstin: b.gstin || "", tax_id: b.tax_id || "" };
}
function guessTaxMode(c, meta) {
  if (!c) return "gst_intra";
  const p = partyFromClient(c, meta);
  if (p.country && p.country !== "India") return "zero_rated";
  if (p.state_code && meta.company.state_code && p.state_code !== meta.company.state_code) return "gst_inter";
  return "gst_intra";
}

function TermsPicker({ terms, selected, type, tags, meta, onClose, onChange }) {
  const [cat, setCat] = useState("all");
  const [sel, setSel] = useState(selected);
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const fits = (t) => (t.tags || []).includes("all") || tags.some((x) => (t.tags || []).includes(x));
  const suggested = terms.filter((t) => t.active && fits(t) && (t.default_for || []).includes(type)).map((t) => t.id);
  const list = terms.filter((t) => t.active && (cat === "all" || t.category === cat));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="billing-terms-dialog">
        <DialogHeader><DialogTitle>Terms library</DialogTitle><DialogDescription>Tick the clauses for this {TYPE_LABEL[type].toLowerCase()}. Clauses tagged for the chosen service types are marked.</DialogDescription></DialogHeader>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setCat("all")} className={`rounded-full border px-2.5 py-0.5 text-xs ${cat === "all" ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600"}`}>All</button>
          {meta.term_categories.map(([k, l]) => <button key={k} type="button" onClick={() => setCat(k)} className={`rounded-full border px-2.5 py-0.5 text-xs ${cat === k ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600"}`}>{l}</button>)}
          <Button size="sm" variant="ghost" className="ml-auto text-[#F26B21]" onClick={() => setSel(Array.from(new Set([...sel, ...suggested])))} data-testid="billing-terms-suggested"><Sparkles className="h-3.5 w-3.5 mr-1" /> Add all suggested</Button>
        </div>
        <div className="space-y-1.5">
          {list.map((t) => (
            <label key={t.id} className={`flex items-start gap-3 rounded-lg border px-3 py-2 cursor-pointer ${sel.includes(t.id) ? "border-[#F26B21] bg-[#FFF7ED]/40" : "border-gray-100 hover:border-gray-200"}`} data-testid={`billing-term-opt-${t.id}`}>
              <input type="checkbox" className="mt-1 accent-[#F26B21]" checked={sel.includes(t.id)} onChange={() => toggle(t.id)} />
              <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-gray-900 flex items-center gap-2">{t.title}{suggested.includes(t.id) && <Pill tone="orange">suggested</Pill>}<span className="text-[10px] text-gray-400 font-normal">{(t.tags || []).join(", ")}</span></div>
                <p className="text-xs text-gray-600 leading-relaxed">{t.text}</p></div>
            </label>))}
        </div>
        <DialogFooter><span className="text-xs text-gray-500 mr-auto">Manage the library in <Link to="/settings/company" className="text-[#F26B21] font-semibold">Settings → Company & billing</Link></span>
          <Button variant="outline" onClick={onClose}>Cancel</Button><Button className="bg-[#F26B21] hover:bg-[#E05A10] text-white" onClick={() => { onChange(sel); onClose(); }} data-testid="billing-terms-apply">Use {sel.length} clause{sel.length === 1 ? "" : "s"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
