import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import api, { formatINR, apiError } from "@/lib/api";
import { labelize } from "@/components/Badges";
import ExportMenu from "@/components/ExportMenu";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Handshake, CalendarClock, IndianRupee, Gift, Plus, Pencil, Trash2,
  ExternalLink, CheckCircle2, Circle, AlertTriangle,
} from "lucide-react";

const TYPE_STYLES = {
  platform: "bg-blue-50 text-blue-700 border-blue-200",
  program: "bg-violet-50 text-violet-700 border-violet-200",
  membership: "bg-emerald-50 text-emerald-700 border-emerald-200",
  vendor: "bg-amber-50 text-amber-700 border-amber-200",
};

const EMPTY_FORM = {
  name: "", partner_type: "platform", category: "", cost: "", billing_cycle: "yearly",
  renewal_date: "", contact_name: "", contact_email: "", website: "", notes: "", benefits: [],
};

const StatCard = ({ icon: Icon, label, value, sub, accent, testid }) => (
  <Card className="border-gray-200/80 shadow-sm" data-testid={testid}>
    <CardContent className="p-4 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${accent ? "bg-amber-50" : "bg-[#FFF7ED]"}`}>
        <Icon style={{ height: 18, width: 18 }} className={accent ? "text-amber-600" : "text-[#F26B21]"} />
      </div>
      <div>
        <div className="text-lg font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{label}{sub && <span className="text-gray-400"> · {sub}</span>}</div>
      </div>
    </CardContent>
  </Card>
);

export default function PartnershipsPage() {
  const { user } = useAuth();
  const [partners, setPartners] = useState(null);
  const [stats, setStats] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const canWrite = ["admin", "finance"].includes(user?.role);

  const load = useCallback(() => {
    api.get("/partnerships").then((r) => setPartners(r.data)).catch(() => setPartners([]));
    api.get("/partnerships/stats").then((r) => setStats(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setOpen(true); };
  const openEdit = (p) => {
    setEditing(p.id);
    setForm({
      name: p.name, partner_type: p.partner_type, category: p.category || "", cost: String(p.cost ?? ""),
      billing_cycle: p.billing_cycle, renewal_date: p.renewal_date || "", contact_name: p.contact_name || "",
      contact_email: p.contact_email || "", website: p.website || "", notes: p.notes || "",
      benefits: (p.benefits || []).map((b) => ({ ...b })),
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    const body = {
      ...form,
      cost: Number(form.cost) || 0,
      renewal_date: form.renewal_date || null,
      benefits: form.benefits
        .filter((b) => b.title.trim())
        .map((b) => ({ ...b, credit_value: Number(b.credit_value) || 0 })),
    };
    try {
      if (editing) {
        await api.put(`/partnerships/${editing}`, body);
        toast.success("Partnership updated");
      } else {
        await api.post("/partnerships", body);
        toast.success("Partnership added");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (p) => {
    try {
      await api.delete(`/partnerships/${p.id}`);
      toast.success(`${p.name} removed`);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const toggleBenefit = async (pid, bid) => {
    try {
      await api.post(`/partnerships/${pid}/benefits/${bid}/toggle`);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const setBenefit = (i, k, v) => {
    setForm((f) => {
      const benefits = [...f.benefits];
      benefits[i] = { ...benefits[i], [k]: v };
      return { ...f, benefits };
    });
  };

  if (!partners)
    return <div className="h-64 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-7xl" data-testid="partnerships-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Partnerships & Memberships</h1>
          <p className="text-sm text-gray-500 mt-1">Vendor programs, platform partnerships and industry memberships.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu dataset="partnerships" />
          {canWrite && (
            <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" onClick={openCreate} data-testid="add-partnership-btn">
              <Plus className="h-4 w-4 mr-2" /> Add partnership
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Handshake} label="Active partnerships" value={stats.active} sub={`${stats.total} total`} testid="partner-stat-active" />
          <StatCard icon={CalendarClock} label="Renewing within 60 days" value={stats.renewing_soon.length} accent testid="partner-stat-renewing" />
          <StatCard icon={IndianRupee} label="Annual cost" value={formatINR(stats.annual_cost)} testid="partner-stat-cost" />
          <StatCard icon={Gift} label="Unused benefit value" value={formatINR(stats.unused_benefits_value)} sub={`${stats.unused_benefits_count} benefits`} testid="partner-stat-unused" />
        </div>
      )}

      {stats?.renewing_soon?.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40 shadow-sm" data-testid="renewal-alert-strip">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 mb-2">
              <AlertTriangle className="h-4 w-4" /> Renewals due within 60 days
            </div>
            <div className="flex flex-wrap gap-2">
              {stats.renewing_soon.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-lg bg-white border border-amber-200/70 px-3 py-1.5 text-sm" data-testid={`renewal-alert-${r.id}`}>
                  <span className="font-semibold text-gray-800">{r.name}</span>
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">
                    {r.days_to_renewal}d left · {r.renewal_date}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {partners.map((p) => (
          <Card key={p.id} className="border-gray-200/80 shadow-sm" data-testid={`partnership-card-${p.id}`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{p.name}</span>
                    <Badge variant="outline" className={`${TYPE_STYLES[p.partner_type] || ""} font-medium text-[10px]`}>{labelize(p.partner_type)}</Badge>
                    {p.status !== "active" && <Badge variant="outline" className="bg-gray-100 text-gray-500 text-[10px]">{labelize(p.status)}</Badge>}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {p.category}{p.contact_email ? ` · ${p.contact_email}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {p.website && (
                    <a href={p.website} target="_blank" rel="noreferrer" className="p-1.5 text-gray-400 hover:text-[#F26B21]" data-testid={`partner-website-${p.id}`}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {canWrite && (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-700" onClick={() => openEdit(p)} data-testid={`edit-partnership-${p.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-600" onClick={() => remove(p)} data-testid={`delete-partnership-${p.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
                <span>Cost: <span className="font-semibold text-gray-700 font-mono">{formatINR(p.cost)}</span> / {p.billing_cycle}</span>
                {p.renewal_date && (
                  <span className="flex items-center gap-1.5">
                    Renews {p.renewal_date}
                    {p.renewing_soon && (
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[9px]" data-testid={`renewing-badge-${p.id}`}>
                        {p.days_to_renewal}d left
                      </Badge>
                    )}
                  </span>
                )}
              </div>

              {p.benefits?.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Benefits</div>
                  {p.benefits.map((b) => (
                    <div key={b.id} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${b.used ? "border-gray-100 bg-gray-50/60" : "border-orange-200/70 bg-[#FFF7ED]/60"}`} data-testid={`benefit-row-${b.id}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        {b.used ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <Circle className="h-4 w-4 text-orange-400 shrink-0" />}
                        <div className="min-w-0">
                          <div className={`text-xs font-medium truncate ${b.used ? "text-gray-400 line-through" : "text-gray-700"}`}>{b.title}</div>
                          {b.note && <div className="text-[10px] text-gray-400 truncate">{b.note}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {b.credit_value > 0 && (
                          <span className={`font-mono text-xs font-semibold ${b.used ? "text-gray-400" : "text-[#F26B21]"}`}>{formatINR(b.credit_value)}</span>
                        )}
                        {canWrite && (
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => toggleBenefit(p.id, b.id)} data-testid={`toggle-benefit-${b.id}`}>
                            {b.used ? "Mark unused" : "Mark used"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {p.notes && <p className="mt-3 text-xs text-gray-400 italic">{p.notes}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
      {partners.length === 0 && <div className="text-center text-sm text-gray-400 py-16">No partnerships yet.</div>}

      {/* Create / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit partnership" : "Add partnership"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name *</Label>
              <Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} data-testid="partnership-form-name" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.partner_type} onValueChange={(v) => setForm((f) => ({ ...f, partner_type: v }))}>
                <SelectTrigger className="mt-1" data-testid="partnership-form-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["platform", "program", "membership", "vendor"].map((t) => <SelectItem key={t} value={t}>{labelize(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Input className="mt-1" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Advertising, Cloud..." />
            </div>
            <div>
              <Label>Cost (₹)</Label>
              <Input type="number" className="mt-1" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} data-testid="partnership-form-cost" />
            </div>
            <div>
              <Label>Billing cycle</Label>
              <Select value={form.billing_cycle} onValueChange={(v) => setForm((f) => ({ ...f, billing_cycle: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["monthly", "quarterly", "yearly"].map((c) => <SelectItem key={c} value={c}>{labelize(c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Renewal date</Label>
              <Input type="date" className="mt-1" value={form.renewal_date} onChange={(e) => setForm((f) => ({ ...f, renewal_date: e.target.value }))} data-testid="partnership-form-renewal" />
            </div>
            <div>
              <Label>Contact name</Label>
              <Input className="mt-1" value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} />
            </div>
            <div>
              <Label>Contact email</Label>
              <Input className="mt-1" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Website</Label>
              <Input className="mt-1" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://..." />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea className="mt-1" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label>Benefits</Label>
                <Button
                  type="button" variant="outline" size="sm" className="h-7 text-xs"
                  onClick={() => setForm((f) => ({ ...f, benefits: [...f.benefits, { id: `bn-${Date.now()}`, title: "", credit_value: "", used: false, used_at: null, note: "" }] }))}
                  data-testid="add-benefit-row-btn"
                >
                  <Plus className="h-3 w-3 mr-1" /> Add benefit
                </Button>
              </div>
              {form.benefits.map((b, i) => (
                <div key={b.id} className="grid grid-cols-[1fr_110px_1fr_32px] gap-2 items-center">
                  <Input placeholder="Benefit title" value={b.title} onChange={(e) => setBenefit(i, "title", e.target.value)} data-testid={`benefit-title-${i}`} />
                  <Input type="number" placeholder="₹ value" value={b.credit_value} onChange={(e) => setBenefit(i, "credit_value", e.target.value)} data-testid={`benefit-value-${i}`} />
                  <Input placeholder="Note" value={b.note} onChange={(e) => setBenefit(i, "note", e.target.value)} />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600"
                    onClick={() => setForm((f) => ({ ...f, benefits: f.benefits.filter((_, j) => j !== i) }))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <Button className="w-full bg-[#F26B21] hover:bg-[#d95b16] text-white" onClick={save} data-testid="partnership-form-save">
            {editing ? "Save changes" : "Add partnership"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
