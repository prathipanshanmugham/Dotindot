import { useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { PasswordInput } from "@/components/PasswordInput";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye } from "lucide-react";

export const RevealDialog = ({ entry, onClose, onRevealed }) => {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!pw) return toast.error("Enter your login password");
    setBusy(true);
    try {
      const { data } = await api.post(`/passwords/${entry.id}/reveal`, { login_password: pw });
      onRevealed(entry.id, data.password);
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" data-testid="pw-reveal-dialog">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Eye className="h-4 w-4 text-[#F26B21]" /> Reveal {entry.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-gray-500">Confirm it's you. The password will be shown for 30 seconds and this reveal is logged.</p>
        <div className="space-y-1">
          <Label>Your login password</Label>
          <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus data-testid="pw-reveal-login-password" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="pw-reveal-submit">{busy ? "Checking…" : "Reveal"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
