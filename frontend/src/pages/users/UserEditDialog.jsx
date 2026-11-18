import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ROLE_LABELS } from "@/components/Badges";
import { PasswordInput } from "@/components/PasswordInput";
import { LocationFields } from "@/components/LocationFields";
import { LocationSelect } from "@/components/BranchFilter";
import { Combo, useLookups } from "@/components/Combo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const F = ({ label, children, className = "" }) => (
  <div className={`space-y-1 ${className}`}><Label>{label}</Label>{children}</div>
);

/** Everything about one person, in one place. Super admins can edit anyone; admins can edit everyone except admins. */
export default function UserEditDialog({ person, roles, onClose, onSaved }) {
  const { user: me, hasPerm } = useAuth();
  const lookups = useLookups();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const self = person?.id === me?.id;

  useEffect(() => {
    if (!person) return setF(null);
    setF({
      name: person.name || "", email: person.email || "", phone: person.phone || "", role: person.role,
      branch_id: person.branch_id || null, designation: person.designation || "", department: person.department || "",
      join_date: (person.join_date || "").slice(0, 10), country: person.country || "India", state: person.state || "", city: person.city || "",
      bio: person.bio || "", skills: (person.skills || []).join(", "), is_active: person.is_active !== false, password: "",
    });
  }, [person]);

  if (!person || !f) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const superRow = f.role === "super_admin";

  const save = async () => {
    if (!f.name.trim()) return toast.error("Name is required");
    if (!f.email.trim()) return toast.error("Email is required");
    if (f.password && f.password.length < 8) return toast.error("A new password needs at least 8 characters");
    setBusy(true);
    try {
      const body = {
        name: f.name, email: f.email, phone: f.phone, branch_id: f.branch_id || "", designation: f.designation, department: f.department,
        join_date: f.join_date || "", country: f.country, state: f.state, city: f.city, bio: f.bio,
        skills: f.skills.split(",").map((s) => s.trim()).filter(Boolean),
      };
      if (!self && f.role !== person.role) body.role = f.role;
      if (!superRow && !self && f.is_active !== (person.is_active !== false)) body.is_active = f.is_active;
      if (f.password) body.password = f.password;
      await api.put(`/users/${person.id}`, body);
      toast.success(`${f.name.trim()} saved`);
      onSaved?.();
      onClose();
    } catch (e) { toast.error(apiError(e)); }
    setBusy(false);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="user-edit-dialog">
        <DialogHeader>
          <DialogTitle>Edit {person.name}</DialogTitle>
          <DialogDescription>Login, role, location and profile. Salary, bank and documents are in HR.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <F label="Full name *"><Input value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={80} data-testid="user-edit-name" /></F>
            <F label="Email (used to log in) *"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} data-testid="user-edit-email" /></F>
            <F label="Phone"><Input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} maxLength={30} data-testid="user-edit-phone" /></F>
            <F label="Role">
              <Select value={f.role} onValueChange={(v) => set("role", v)} disabled={self}>
                <SelectTrigger data-testid="user-edit-role"><SelectValue /></SelectTrigger>
                <SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
              </Select>
              {self && <p className="text-xs text-gray-400">You can't change your own role.</p>}
            </F>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <F label="Designation"><Combo value={f.designation} onChange={(v) => set("designation", v)} options={lookups.designations || []} allowCustom clearable placeholder="e.g. Designer" testid="user-edit-designation" /></F>
            <F label="Department"><Combo value={f.department} onChange={(v) => set("department", v)} options={lookups.departments || []} allowCustom clearable placeholder="Pick a team" testid="user-edit-department" /></F>
            <F label="Location"><LocationSelect value={f.branch_id} onChange={(v) => set("branch_id", v)} none="No location" testid="user-edit-branch" /></F>
            <F label="Joined on"><Input type="date" value={f.join_date} onChange={(e) => set("join_date", e.target.value)} data-testid="user-edit-join" /></F>
            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <LocationFields country={f.country} state={f.state} city={f.city} prefix="user-edit" compact
                onChange={(v) => setF((x) => ({ ...x, country: v.country, state: v.state, city: v.city }))} />
            </div>
            <F label="Skills (comma separated)" className="sm:col-span-2"><Input value={f.skills} onChange={(e) => set("skills", e.target.value)} placeholder="e.g. Figma, Meta ads, Reels" data-testid="user-edit-skills" /></F>
            <F label="Bio" className="sm:col-span-2"><Textarea rows={2} value={f.bio} onChange={(e) => set("bio", e.target.value)} maxLength={1000} /></F>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-gray-200 p-3">
            <F label="New password"><PasswordInput value={f.password} onChange={(e) => set("password", e.target.value)} placeholder="Leave blank to keep" data-testid="user-edit-password" /></F>
            <div className="space-y-1">
              <Label>Login</Label>
              {superRow ? (
                <p className="text-sm text-gray-700 flex items-center gap-1.5 h-10" data-testid="user-edit-always-active"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Super admins are always active</p>
              ) : self ? (
                <p className="text-sm text-gray-500 h-10 flex items-center">You can't switch off your own login</p>
              ) : (
                <label className="flex items-center gap-2 h-10 text-sm text-gray-700">
                  <Switch checked={f.is_active} onCheckedChange={(v) => set("is_active", v)} data-testid="user-edit-active" /> {f.is_active ? "Active — can log in" : "Off — can't log in"}
                </label>
              )}
            </div>
          </section>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {hasPerm?.("hr") && <Link to={`/hr/people?open=${person.id}`} className="font-semibold text-[#F26B21] inline-flex items-center gap-1">HR details, salary and documents <ArrowRight className="h-3 w-3" /></Link>}
            {hasPerm?.("access_control") && <Link to="/access" className="font-semibold text-[#F26B21] inline-flex items-center gap-1">Permissions and location access <ArrowRight className="h-3 w-3" /></Link>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="user-edit-save">{busy ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
