import { useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordInput";
import { KeyRound } from "lucide-react";

export const ChangePasswordCard = () => {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (form.next !== form.confirm) return toast.error("New passwords do not match");
    if (form.next.length < 8) return toast.error("New password must be at least 8 characters");
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: form.current, new_password: form.next });
      toast.success("Password changed");
      setForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-gray-200/80 shadow-sm" data-testid="change-password-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-[#F26B21]" /> Change password
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Current password</Label>
            <PasswordInput data-testid="current-password-input" value={form.current} onChange={set("current")} required />
          </div>
          <div className="space-y-1">
            <Label>New password</Label>
            <PasswordInput data-testid="new-password-input" value={form.next} onChange={set("next")} required />
          </div>
          <div className="space-y-1">
            <Label>Confirm new password</Label>
            <PasswordInput data-testid="confirm-password-input" value={form.confirm} onChange={set("confirm")} required />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={busy} className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="change-password-submit">
              {busy ? "Saving…" : "Update password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
