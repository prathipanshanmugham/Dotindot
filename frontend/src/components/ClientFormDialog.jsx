import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { labelize, CLIENT_STATUSES, INDUSTRIES, SERVICE_TYPES, SIZES } from "@/components/Badges";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { LocationFields } from "@/components/LocationFields";

const EMPTY = {
  name: "", company: "", industry: "other", service_type: "web_dev", size: "small",
  status: "active", retainer: false, region: "India", state: "", city: "", google_drive_link: "",
  contacts: [], contracts: [], credentials: [],
  domain_hosting: { registrar: "", domain_expiry: "", host: "", hosting_expiry: "" },
  notes: "",
};

const SectionTitle = ({ children }) => (
  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 pt-2">{children}</div>
);

export default function ClientFormDialog({ open, onOpenChange, client, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const isEdit = !!client;

  useEffect(() => {
    if (open) {
      if (client) {
        setForm({
          ...EMPTY,
          ...client,
          domain_hosting: client.domain_hosting || EMPTY.domain_hosting,
          contacts: client.contacts || [],
          contracts: client.contracts || [],
          credentials: [],
        });
      } else {
        setForm(EMPTY);
      }
    }
  }, [open, client]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const setDH = (k, v) => setForm((p) => ({ ...p, domain_hosting: { ...p.domain_hosting, [k]: v } }));

  const addRow = (key, row) => set(key, [...form[key], row]);
  const removeRow = (key, idx) => set(key, form[key].filter((_, i) => i !== idx));
  const setRow = (key, idx, field, val) =>
    set(key, form[key].map((r, i) => (i === idx ? { ...r, [field]: val } : r)));

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Client name is required");
      return;
    }
    setBusy(true);
    try {
      const dh = { ...form.domain_hosting };
      if (!dh.domain_expiry) dh.domain_expiry = null;
      if (!dh.hosting_expiry) dh.hosting_expiry = null;
      const payload = { ...form, domain_hosting: dh };
      if (isEdit) {
        delete payload.credentials;
        delete payload.projects;
        delete payload.health;
        delete payload.id;
        delete payload.created_at;
        delete payload.updated_at;
        delete payload.created_by;
        delete payload.currency;
        delete payload.project_count;
        delete payload.active_projects;
        await api.put(`/clients/${client.id}`, payload);
        toast.success("Client updated");
      } else {
        await api.post("/clients", payload);
        toast.success("Client created");
      }
      onOpenChange(false);
      onSaved && onSaved();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${client?.name}` : "Add Client"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <SectionTitle>Basics</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Name *</Label><Input data-testid="client-form-name" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="space-y-1"><Label>Company</Label><Input data-testid="client-form-company" value={form.company} onChange={(e) => set("company", e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Industry</Label>
              <Select value={form.industry} onValueChange={(v) => set("industry", v)}>
                <SelectTrigger data-testid="client-form-industry"><SelectValue /></SelectTrigger>
                <SelectContent>{INDUSTRIES.map((o) => <SelectItem key={o} value={o}>{labelize(o)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Service type</Label>
              <Select value={form.service_type} onValueChange={(v) => set("service_type", v)}>
                <SelectTrigger data-testid="client-form-service"><SelectValue /></SelectTrigger>
                <SelectContent>{SERVICE_TYPES.map((o) => <SelectItem key={o} value={o}>{labelize(o)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Size</Label>
              <Select value={form.size} onValueChange={(v) => set("size", v)}>
                <SelectTrigger data-testid="client-form-size"><SelectValue /></SelectTrigger>
                <SelectContent>{SIZES.map((o) => <SelectItem key={o} value={o}>{labelize(o)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger data-testid="client-form-status"><SelectValue /></SelectTrigger>
                <SelectContent>{CLIENT_STATUSES.map((o) => <SelectItem key={o} value={o}>{labelize(o)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <LocationFields country={form.region} state={form.state} city={form.city} prefix="client-form" compact
                onChange={(v) => setForm((p) => ({ ...p, region: v.country, state: v.state, city: v.city }))} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.retainer} onCheckedChange={(v) => set("retainer", v)} data-testid="client-form-retainer" />
            <Label className="text-sm">Retainer client</Label>
          </div>
          <div className="space-y-1"><Label>Google Drive link</Label><Input data-testid="client-form-drive" value={form.google_drive_link} onChange={(e) => set("google_drive_link", e.target.value)} placeholder="https://drive.google.com/..." /></div>

          <SectionTitle>Key contacts</SectionTitle>
          {form.contacts.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-center">
              <Input placeholder="Name" value={c.name} onChange={(e) => setRow("contacts", i, "name", e.target.value)} />
              <Input placeholder="Email" value={c.email} onChange={(e) => setRow("contacts", i, "email", e.target.value)} />
              <Input placeholder="Phone" value={c.phone} onChange={(e) => setRow("contacts", i, "phone", e.target.value)} />
              <Input placeholder="Role" value={c.role} onChange={(e) => setRow("contacts", i, "role", e.target.value)} />
              <Button variant="ghost" size="icon" onClick={() => removeRow("contacts", i)}><Trash2 className="h-4 w-4 text-gray-400" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" data-testid="add-contact-row" onClick={() => addRow("contacts", { name: "", email: "", phone: "", role: "" })}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add contact
          </Button>

          <SectionTitle>Contracts</SectionTitle>
          {form.contracts.map((c, i) => (
            <div key={i} className="grid grid-cols-[1.4fr_0.8fr_1fr_1fr_auto] gap-2 items-end">
              <div className="space-y-1"><Label className="text-xs">Title</Label><Input value={c.title} onChange={(e) => setRow("contracts", i, "title", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Value ₹</Label><Input type="number" value={c.value} onChange={(e) => setRow("contracts", i, "value", Number(e.target.value))} /></div>
              <div className="space-y-1"><Label className="text-xs">Start</Label><Input type="date" value={c.start_date || ""} onChange={(e) => setRow("contracts", i, "start_date", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Expiry</Label><Input type="date" value={c.expiry_date || ""} onChange={(e) => setRow("contracts", i, "expiry_date", e.target.value)} /></div>
              <Button variant="ghost" size="icon" onClick={() => removeRow("contracts", i)}><Trash2 className="h-4 w-4 text-gray-400" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" data-testid="add-contract-row" onClick={() => addRow("contracts", { title: "", value: 0, start_date: "", expiry_date: "", file_link: "", note: "" })}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add contract
          </Button>

          {!isEdit && (
            <>
              <SectionTitle>Credential references (stored encrypted)</SectionTitle>
              {form.credentials.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                  <Input placeholder="Label (e.g. WordPress)" value={c.label} onChange={(e) => setRow("credentials", i, "label", e.target.value)} />
                  <Input placeholder="Username" value={c.username} onChange={(e) => setRow("credentials", i, "username", e.target.value)} />
                  <Input placeholder="Secret" type="password" value={c.secret} onChange={(e) => setRow("credentials", i, "secret", e.target.value)} />
                  <Button variant="ghost" size="icon" onClick={() => removeRow("credentials", i)}><Trash2 className="h-4 w-4 text-gray-400" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" data-testid="add-credential-row" onClick={() => addRow("credentials", { label: "", username: "", secret: "" })}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add credential
              </Button>
            </>
          )}

          <SectionTitle>Domain & hosting</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Registrar</Label><Input value={form.domain_hosting.registrar} onChange={(e) => setDH("registrar", e.target.value)} /></div>
            <div className="space-y-1"><Label>Domain expiry</Label><Input type="date" value={form.domain_hosting.domain_expiry || ""} onChange={(e) => setDH("domain_expiry", e.target.value)} /></div>
            <div className="space-y-1"><Label>Host</Label><Input value={form.domain_hosting.host} onChange={(e) => setDH("host", e.target.value)} /></div>
            <div className="space-y-1"><Label>Hosting expiry</Label><Input type="date" value={form.domain_hosting.hosting_expiry || ""} onChange={(e) => setDH("hosting_expiry", e.target.value)} /></div>
          </div>

          <SectionTitle>Notes</SectionTitle>
          <Textarea data-testid="client-form-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Internal notes about this client..." />
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy} data-testid="client-form-submit" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
            {busy ? "Saving..." : isEdit ? "Save changes" : "Create client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
