// v3.2 Settings → Company & billing: legal details, bank + UPI, logo/signature, certifications, numbering, terms library.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLoad, Spinner, PageHead, PillTabs, Field, Pill, Empty } from "@/components/kit";
import { fileToDataUrl } from "@/pages/finance/billing/billingKit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, Landmark, Award, Plus, Trash2, Upload, ListChecks, Pencil, QrCode } from "lucide-react";

export default function CompanyPage() {
  const { hasPerm } = useAuth();
  const canManage = hasPerm("billing.manage");
  const [tab, setTab] = useState("company");
  const [co, reload] = useLoad("/billing/company");
  const [meta] = useLoad("/billing/meta");
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (co && !f) setF(co); }, [co, f]);
  if (!f || !meta) return <Spinner />;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setBank = (k, v) => setF((x) => ({ ...x, bank: { ...x.bank, [k]: v } }));
  const setDef = (k, v) => setF((x) => ({ ...x, defaults: { ...x.defaults, [k]: v } }));
  const save = async () => {
    setBusy(true);
    try { const { data } = await api.put("/billing/company", f); setF(data); toast.success("Company profile saved"); reload(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const pickImage = async (k, file) => { try { set(k, await fileToDataUrl(file)); } catch (e) { toast.error(e.message); } };
  const inp = (k, label, props = {}) => <Field key={k} label={label} hint={props.hint}><Input value={f[k] || ""} onChange={(e) => set(k, e.target.value)} disabled={!canManage} data-testid={`co-${k}`} {...props} /></Field>;
  return (
    <div className="space-y-5 max-w-5xl" data-testid="company-page">
      <PageHead kicker="Settings" title="Company & billing" sub="What prints on quotations and invoices: legal details, bank and UPI, logo, signature, certifications and your standard terms."
        actions={canManage && tab !== "terms" ? <Button size="sm" onClick={save} disabled={busy} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="co-save">{busy ? "Saving…" : "Save"}</Button> : null} />
      <PillTabs tabs={[["company", "Company"], ["bank", "Bank & UPI"], ["brand", "Logo, signature & certifications"], ["numbering", "Numbering & defaults"], ["terms", "Terms library"]]} value={tab} onChange={setTab} testid="co-tab" />
      {tab === "company" && (
        <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {inp("legal_name", "Legal name", { hint: "As on GST / PAN" })}{inp("trade_name", "Trade name")}{inp("tagline", "Tagline (under the logo)")}{inp("website", "Website")}
          {inp("address1", "Address line 1")}{inp("address2", "Address line 2")}{inp("city", "City")}
          <Field label="State"><Select value={f.state_code || "none"} onValueChange={(v) => set("state_code", v === "none" ? "" : v)} disabled={!canManage}><SelectTrigger data-testid="co-state"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72"><SelectItem value="none">—</SelectItem>{Object.entries(meta.states).map(([k, v]) => <SelectItem key={k} value={k}>{v} ({k})</SelectItem>)}</SelectContent></Select></Field>
          {inp("pincode", "PIN code")}{inp("country", "Country")}{inp("email", "Billing email")}{inp("phone", "Phone")}
          <div className="sm:col-span-2 text-xs font-bold uppercase tracking-widest text-gray-400 pt-2">Registrations</div>
          {inp("gstin", "GSTIN", { className: "font-mono uppercase" })}{inp("pan", "PAN", { className: "font-mono uppercase" })}{inp("cin", "CIN / LLPIN (if any)", { className: "font-mono" })}
          {inp("udyam", "Udyam (MSME) number", { className: "font-mono" })}{inp("lut", "LUT number (exports without IGST)", { className: "font-mono", hint: "Printed on export invoices" })}
        </CardContent></Card>
      )}
      {tab === "bank" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Landmark className="h-4 w-4 text-[#F26B21]" /> Bank account</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[["account_name", "Account name"], ["account_no", "Account number"], ["ifsc", "IFSC"], ["bank_name", "Bank"], ["branch", "Branch"], ["swift", "SWIFT / BIC (foreign payments)"]].map(([k, l]) => (
                <Field key={k} label={l}><Input value={f.bank?.[k] || ""} onChange={(e) => setBank(k, e.target.value)} disabled={!canManage} className={["ifsc", "swift", "account_no"].includes(k) ? "font-mono" : ""} data-testid={`co-bank-${k}`} /></Field>))}
              <Field label="Bank address (for SWIFT)" className="sm:col-span-2"><Input value={f.bank?.bank_address || ""} onChange={(e) => setBank("bank_address", e.target.value)} disabled={!canManage} /></Field>
            </CardContent></Card>
          <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><QrCode className="h-4 w-4 text-[#F26B21]" /> UPI</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {inp("upi_id", "UPI id", { className: "font-mono", placeholder: "name@bank", hint: "INR invoices get a scan-to-pay QR with the exact balance" })}{inp("upi_name", "Payee name shown in UPI apps")}
              <p className="text-xs text-gray-500">The QR is a standard UPI link (<span className="font-mono">upi://pay</span>) with the invoice number as the note — works with GPay, PhonePe, Paytm and bank apps.</p>
            </CardContent></Card>
        </div>
      )}
      {tab === "brand" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Logo & signature</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <ImagePick label="Logo on documents" hint="PNG with transparent background works best. Leave empty to use the dotindot wordmark." value={f.logo} onPick={(file) => pickImage("logo", file)} onClear={() => set("logo", null)} disabled={!canManage} testid="co-logo" h="h-14" />
              <ImagePick label="Signature" hint="Scanned signature (PNG). Printed above the signatory's name." value={f.signature} onPick={(file) => pickImage("signature", file)} onClear={() => set("signature", null)} disabled={!canManage} testid="co-signature" h="h-16" />
              <div className="grid grid-cols-2 gap-3">{inp("signatory_name", "Signatory name")}{inp("signatory_title", "Designation")}</div>
            </CardContent></Card>
          <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-2 flex-row items-center justify-between space-y-0"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Award className="h-4 w-4 text-[#F26B21]" /> Certifications & partnerships</CardTitle>
            {canManage && <Button size="sm" variant="outline" onClick={() => set("certifications", [...(f.certifications || []), { id: Math.random().toString(36).slice(2), name: "", issuer: "", number: "", valid_till: "", image: null, show_on_docs: true }])} data-testid="co-add-cert"><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>}</CardHeader>
            <CardContent className="space-y-3">
              {(f.certifications || []).length === 0 && <p className="text-xs text-gray-400">ISO 9001, Google Partner, Meta Business Partner, MSME, Startup India… add the badges and they print in a strip at the bottom of every document.</p>}
              {(f.certifications || []).map((c, i) => (
                <div key={c.id} className="rounded-xl border border-gray-200 p-3 space-y-2" data-testid={`co-cert-${i}`}>
                  <div className="flex items-start gap-3">
                    <ImagePick compact value={c.image} onPick={async (file) => { try { const v = await fileToDataUrl(file); set("certifications", f.certifications.map((x, j) => (j === i ? { ...x, image: v } : x))); } catch (e) { toast.error(e.message); } }}
                      onClear={() => set("certifications", f.certifications.map((x, j) => (j === i ? { ...x, image: null } : x)))} disabled={!canManage} h="h-12" />
                    <div className="grid grid-cols-2 gap-2 flex-1">
                      <Input placeholder="Name (e.g. ISO 9001:2015)" value={c.name} onChange={(e) => set("certifications", f.certifications.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} disabled={!canManage} className="h-8" data-testid={`co-cert-name-${i}`} />
                      <Input placeholder="Issuer" value={c.issuer || ""} onChange={(e) => set("certifications", f.certifications.map((x, j) => (j === i ? { ...x, issuer: e.target.value } : x)))} disabled={!canManage} className="h-8" />
                      <Input placeholder="Certificate number" value={c.number || ""} onChange={(e) => set("certifications", f.certifications.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))} disabled={!canManage} className="h-8 font-mono" />
                      <Input type="date" value={c.valid_till || ""} onChange={(e) => set("certifications", f.certifications.map((x, j) => (j === i ? { ...x, valid_till: e.target.value } : x)))} disabled={!canManage} className="h-8" title="Valid till" />
                    </div>
                    {canManage && <button type="button" className="text-gray-300 hover:text-red-600" onClick={() => set("certifications", f.certifications.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-600"><Switch checked={c.show_on_docs !== false} onCheckedChange={(v) => set("certifications", f.certifications.map((x, j) => (j === i ? { ...x, show_on_docs: v } : x)))} disabled={!canManage} /> Show on documents</label>
                </div>))}
            </CardContent></Card>
        </div>
      )}
      {tab === "numbering" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Numbering</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-gray-500">Numbers run per type per financial year (April–March), e.g. <span className="font-mono">INV/26-27/0007</span>. Prefixes apply to new documents only.</p>
              <div className="grid grid-cols-2 gap-3">{Object.entries(meta.types).map(([k, l]) => <Field key={k} label={l}><Input value={f.numbering?.[k] || ""} onChange={(e) => set("numbering", { ...f.numbering, [k]: e.target.value.toUpperCase() })} disabled={!canManage} className="font-mono" data-testid={`co-num-${k}`} /></Field>)}</div>
            </CardContent></Card>
          <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Defaults for new documents</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Field label="Quotation validity (days)"><Input inputMode="numeric" value={f.defaults?.validity_days ?? ""} onChange={(e) => setDef("validity_days", e.target.value)} disabled={!canManage} /></Field>
              <Field label="Invoice due (days)"><Input inputMode="numeric" value={f.defaults?.due_days ?? ""} onChange={(e) => setDef("due_days", e.target.value)} disabled={!canManage} /></Field>
              <Field label="GST rate %"><Input inputMode="decimal" value={f.defaults?.tax_rate ?? ""} onChange={(e) => setDef("tax_rate", e.target.value)} disabled={!canManage} /></Field>
              <Field label="Default SAC"><Select value={f.defaults?.sac || "none"} onValueChange={(v) => setDef("sac", v === "none" ? "" : v)} disabled={!canManage}><SelectTrigger className="font-mono"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72"><SelectItem value="none">—</SelectItem>{meta.sac.map(([c, l]) => <SelectItem key={c} value={c}><span className="font-mono">{c}</span> <span className="text-xs text-gray-500">{l}</span></SelectItem>)}</SelectContent></Select></Field>
              <Field label="Default currency"><Select value={f.defaults?.currency || "INR"} onValueChange={(v) => setDef("currency", v)} disabled={!canManage}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(meta.currencies).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Footer note" className="col-span-2"><Textarea rows={2} value={f.defaults?.notes || ""} onChange={(e) => setDef("notes", e.target.value)} disabled={!canManage} /></Field>
              <label className="flex items-center gap-2 text-sm"><Switch checked={!!f.defaults?.show_qr} onCheckedChange={(v) => setDef("show_qr", v)} disabled={!canManage} /> UPI QR on INR documents</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={!!f.defaults?.show_certs} onCheckedChange={(v) => setDef("show_certs", v)} disabled={!canManage} /> Certifications strip</label>
            </CardContent></Card>
        </div>
      )}
      {tab === "terms" && <TermsLibrary meta={meta} canManage={canManage} />}
    </div>
  );
}

function ImagePick({ label, hint, value, onPick, onClear, disabled, testid, h = "h-14", compact = false }) {
  return (
    <div className={compact ? "" : "space-y-1.5"}>
      {label && <div className="text-xs font-semibold text-gray-700">{label}</div>}
      <div className="flex items-center gap-3">
        <div className={`${h} ${compact ? "w-20" : "w-40"} rounded-lg border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0`}>
          {value ? <img src={value} alt="" className="max-h-full max-w-full object-contain" /> : <Upload className="h-4 w-4 text-gray-300" />}
        </div>
        {!disabled && <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-[#F26B21] cursor-pointer">{value ? "Replace" : "Upload"}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} data-testid={testid} /></label>
          {value && <button type="button" className="text-xs text-gray-400 text-left" onClick={onClear}>Remove</button>}
        </div>}
      </div>
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

function TermsLibrary({ meta, canManage }) {
  const [terms, reload] = useLoad("/billing/terms");
  const [edit, setEdit] = useState(null);
  const [cat, setCat] = useState("all");
  if (!terms) return <Spinner />;
  const list = terms.filter((t) => cat === "all" || t.category === cat);
  const catLabel = Object.fromEntries(meta.term_categories);
  const save = async () => {
    try {
      if (edit.id) await api.put(`/billing/terms/${edit.id}`, edit); else await api.post("/billing/terms", edit);
      toast.success("Saved"); setEdit(null); reload();
    } catch (e) { toast.error(apiError(e)); }
  };
  const remove = async (t) => { try { await api.delete(`/billing/terms/${t.id}`); toast.success("Removed"); reload(); } catch (e) { toast.error(apiError(e)); } };
  return (
    <div className="space-y-3" data-testid="terms-library">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setCat("all")} className={`rounded-full border px-2.5 py-0.5 text-xs ${cat === "all" ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600"}`}>All ({terms.length})</button>
        {meta.term_categories.map(([k, l]) => <button key={k} type="button" onClick={() => setCat(k)} className={`rounded-full border px-2.5 py-0.5 text-xs ${cat === k ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600"}`}>{l}</button>)}
        {canManage && <Button size="sm" className="ml-auto bg-[#F26B21] hover:bg-[#E05A10] text-white" onClick={() => setEdit({ category: cat === "all" ? "general" : cat, title: "", text: "", tags: ["all"], default_for: ["quotation"], active: true })} data-testid="term-add"><Plus className="h-3.5 w-3.5 mr-1" /> New clause</Button>}
      </div>
      <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-0 divide-y divide-gray-50">
        {list.length === 0 && <Empty icon={ListChecks} title="No clauses in this category" />}
        {list.map((t) => (
          <div key={t.id} className={`flex items-start gap-3 px-4 py-3 ${t.active ? "" : "opacity-50"}`} data-testid={`term-row-${t.id}`}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900">{t.title}<Pill>{catLabel[t.category]}</Pill>{(t.tags || []).filter((x) => x !== "all").map((x) => <span key={x} className="text-[10px] text-gray-400">#{x}</span>)}
                {(t.default_for || []).length > 0 && <span className="text-[10px] text-[#F26B21]">default on {(t.default_for || []).join(", ")}</span>}{!t.active && <Pill tone="gray">off</Pill>}</div>
              <p className="text-xs text-gray-600 leading-relaxed mt-0.5">{t.text}</p>
            </div>
            {canManage && <div className="flex gap-1 shrink-0"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEdit({ ...t })} data-testid={`term-edit-${t.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-red-600" onClick={() => remove(t)}><Trash2 className="h-3.5 w-3.5" /></Button></div>}
          </div>))}
      </CardContent></Card>
      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent className="max-w-xl" data-testid="term-dialog">
            <DialogHeader><DialogTitle>{edit.id ? "Edit clause" : "New clause"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Title"><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} data-testid="term-title" /></Field>
              <Field label="Category"><Select value={edit.category} onValueChange={(v) => setEdit({ ...edit, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{meta.term_categories.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Clause" className="col-span-2"><Textarea rows={4} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} data-testid="term-text" /></Field>
              <Field label="Applies to service types" className="col-span-2"><div className="flex flex-wrap gap-1.5">{meta.service_tags.map((t) => {
                const on = (edit.tags || []).includes(t);
                return <button key={t} type="button" onClick={() => setEdit({ ...edit, tags: on ? edit.tags.filter((x) => x !== t) : [...edit.tags, t] })} className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? "bg-[#FFF7ED] border-[#F26B21] text-[#F26B21]" : "border-gray-200 text-gray-600"}`}>{t}</button>;
              })}</div></Field>
              <Field label="Pre-selected on" className="col-span-2"><div className="flex flex-wrap gap-1.5">{Object.entries(meta.types).map(([k, l]) => {
                const on = (edit.default_for || []).includes(k);
                return <button key={k} type="button" onClick={() => setEdit({ ...edit, default_for: on ? edit.default_for.filter((x) => x !== k) : [...edit.default_for, k] })} className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600"}`}>{l}</button>;
              })}</div></Field>
              <label className="flex items-center gap-2 text-sm col-span-2"><Switch checked={edit.active} onCheckedChange={(v) => setEdit({ ...edit, active: v })} /> Active (shows in the picker)</label>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button className="bg-[#F26B21] hover:bg-[#E05A10] text-white" onClick={save} data-testid="term-save">Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
