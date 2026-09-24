import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { PasswordInput } from "@/components/PasswordInput";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wand2 } from "lucide-react";

const EMPTY = { name: "", login_url: "", username: "", password: "", plan: "", renewal_date: "", cost: 0, owner_id: "", branch_id: "", twofa_enabled: false, twofa_method: "app", last_password_changed: "", change_interval_days: 90, notes: "" };

export const strength = (pw) => {
  if (!pw) return { score: 0, label: "", cls: "bg-gray-200" };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 2) return { score: s, label: "Weak", cls: "bg-red-500" };
  if (s <= 3) return { score: s, label: "Fair", cls: "bg-amber-500" };
  if (s === 4) return { score: s, label: "Strong", cls: "bg-emerald-500" };
  return { score: s, label: "Very strong", cls: "bg-emerald-600" };
};

export const PasswordEntryDialog = ({ entry, onClose, onSaved }) => {
  const isEdit = !!entry;
  const [form, setForm] = useState(EMPTY);
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(entry ? { ...EMPTY, ...entry, password: "", renewal_date: entry.renewal_date || "", last_password_changed: entry.last_password_changed || "", twofa_method: entry.twofa_method || "app", owner_id: entry.owner_id || "", branch_id: entry.branch_id || "" } : EMPTY);
    api.get("/users/team").then((r) => setUsers(r.data)).catch(() => {});
    api.get("/locations/branches").then((r) => setBranches(r.data)).catch(() => {});
  }, [entry]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const st = strength(form.password);

  const generate = async () => {
    try { const { data } = await api.get("/passwords/generate", { params: { length: 18 } }); set("password", data.password); toast.success("Strong password generated"); } catch (e) { toast.error(apiError(e)); }
  };

  const save = async () => {
    if (!form.name.trim() || !form.username.trim()) return toast.error("Tool name and username are required");
    setBusy(true);
    try {
      const body = { ...form, cost: Number(form.cost) || 0, change_interval_days: Number(form.change_interval_days) || 90,
        renewal_date: form.renewal_date || null, last_password_changed: form.last_password_changed || null,
        owner_id: form.owner_id || null, branch_id: form.branch_id || null, twofa_method: form.twofa_enabled ? form.twofa_method : null };
      if (!body.password) delete body.password;
      ["id", "has_password", "owner_name", "branch_name", "change_due_date", "change_status", "created_at", "created_by", "currency", "subscription_id"].forEach((k) => delete body[k]);
      if (isEdit) await api.put(`/passwords/${entry.id}`, body); else await api.post("/passwords", body);
      toast.success(isEdit ? "Entry updated" : "Entry added to vault");
      onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="password-entry-dialog">
        <DialogHeader><DialogTitle>{isEdit ? `Edit ${entry.name}` : "New vault entry"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Tool / service *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} data-testid="pw-form-name" /></div>
          <div className="space-y-1"><Label>Login URL</Label><Input value={form.login_url} onChange={(e) => set("login_url", e.target.value)} placeholder="https://" data-testid="pw-form-url" /></div>
          <div className="space-y-1"><Label>Username / email *</Label><Input value={form.username} onChange={(e) => set("username", e.target.value)} data-testid="pw-form-username" /></div>
          <div className="space-y-1">
            <Label>{isEdit ? "New password (leave blank to keep)" : "Password"}</Label>
            <div className="flex gap-2">
              <PasswordInput value={form.password} onChange={(e) => set("password", e.target.value)} data-testid="pw-form-password" />
              <Button type="button" variant="outline" size="icon" onClick={generate} title="Generate strong password" data-testid="pw-form-generate"><Wand2 className="h-4 w-4 text-[#F26B21]" /></Button>
            </div>
            {form.password && (
              <div className="flex items-center gap-2 pt-1" data-testid="pw-strength-meter">
                <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${st.cls} transition-all`} style={{ width: `${(st.score / 5) * 100}%` }} /></div>
                <span className="text-[11px] font-semibold text-gray-500">{st.label}</span>
              </div>
            )}
          </div>
          <div className="space-y-1"><Label>Plan</Label><Input value={form.plan} onChange={(e) => set("plan", e.target.value)} data-testid="pw-form-plan" /></div>
          <div className="space-y-1"><Label>Cost ₹ / year</Label><Input type="number" value={form.cost} onChange={(e) => set("cost", e.target.value)} data-testid="pw-form-cost" /></div>
          <div className="space-y-1"><Label>Renewal date</Label><Input type="date" value={form.renewal_date} onChange={(e) => set("renewal_date", e.target.value)} data-testid="pw-form-renewal" /></div>
          <div className="space-y-1"><Label>Last password change</Label><Input type="date" value={form.last_password_changed} onChange={(e) => set("last_password_changed", e.target.value)} data-testid="pw-form-lastchanged" /></div>
          <div className="space-y-1">
            <Label>Change every</Label>
            <Select value={String(form.change_interval_days)} onValueChange={(v) => set("change_interval_days", v)}>
              <SelectTrigger data-testid="pw-form-interval"><SelectValue /></SelectTrigger>
              <SelectContent>{[30, 60, 90, 180, 365].map((d) => <SelectItem key={d} value={String(d)}>{d} days</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Owner</Label>
            <Select value={form.owner_id || "none"} onValueChange={(v) => set("owner_id", v === "none" ? "" : v)}>
              <SelectTrigger data-testid="pw-form-owner"><SelectValue placeholder="Owner" /></SelectTrigger>
              <SelectContent><SelectItem value="none">— Me —</SelectItem>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Branch</Label>
            <Select value={form.branch_id || "none"} onValueChange={(v) => set("branch_id", v === "none" ? "" : v)}>
              <SelectTrigger data-testid="pw-form-branch"><SelectValue placeholder="Branch" /></SelectTrigger>
              <SelectContent><SelectItem value="none">— None —</SelectItem>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Two-factor auth</Label>
            <div className="flex items-center gap-3">
              <Switch checked={form.twofa_enabled} onCheckedChange={(v) => set("twofa_enabled", v)} data-testid="pw-form-2fa" />
              {form.twofa_enabled && (
                <Select value={form.twofa_method} onValueChange={(v) => set("twofa_method", v)}>
                  <SelectTrigger className="w-[140px]" data-testid="pw-form-2fa-method"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="app">Authenticator app</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="email">Email</SelectItem></SelectContent>
                </Select>
              )}
            </div>
          </div>
          <div className="sm:col-span-2 space-y-1"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} data-testid="pw-form-notes" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="pw-form-save">{busy ? "Saving…" : isEdit ? "Save changes" : "Add to vault"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
