import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle } from "lucide-react";

// Single or bulk permanent delete (24h recoverable via Settings → Recently deleted). Needs assets.delete.
export const AssetDeleteDialog = ({ target, onClose, onDeleted }) => {
  const [deps, setDeps] = useState(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const isBulk = Array.isArray(target);

  useEffect(() => {
    setConfirm("");
    setDeps(null);
    if (!target || isBulk) return;
    api.get(`/assets/${target.id}/dependents`).then((r) => setDeps(r.data)).catch(() => setDeps({}));
  }, [target, isBulk]);

  if (!target) return null;
  const linked = deps && (deps.assigned_to || deps.assigned_location || deps.maintenance_entries > 0 || deps.assignment_entries > 0);

  const run = async () => {
    setBusy(true);
    try {
      if (isBulk) {
        const { data } = await api.post("/assets/bulk-delete", { ids: target.map((a) => a.id) });
        toast.success(`${data.deleted} assets deleted — undo available for 24h in Settings`);
      } else {
        await api.delete(`/assets/${target.id}`);
        toast.success(`${target.name} deleted — undo available for 24h in Settings`);
      }
      onDeleted();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="asset-delete-dialog">
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-red-700"><AlertTriangle className="h-5 w-5" /> {isBulk ? `Delete ${target.length} assets?` : `Delete ${target.name}?`}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm text-gray-600">
          <p>This is <span className="font-semibold text-red-600">permanent and cannot be undone</span> from this screen (a super admin can restore it from Settings → Recently deleted within 24 hours).</p>
          {!isBulk && deps === null && <p className="text-xs text-gray-400">Checking linked records…</p>}
          {!isBulk && linked && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1" data-testid="asset-delete-warnings">
              <div className="font-bold">Linked records will be cleaned up:</div>
              {deps.assigned_to && <div>• Currently assigned to {deps.assigned_to_name || "an employee"} — will be unassigned</div>}
              {deps.assigned_location && <div>• Location: {deps.assigned_location}</div>}
              {deps.maintenance_entries > 0 && <div>• {deps.maintenance_entries} maintenance log entr{deps.maintenance_entries === 1 ? "y" : "ies"} — deleted with the asset</div>}
              {deps.assignment_entries > 0 && <div>• {deps.assignment_entries} assignment history entr{deps.assignment_entries === 1 ? "y" : "ies"} — deleted with the asset</div>}
            </div>
          )}
          {!isBulk && deps && !linked && <p className="text-xs text-emerald-700" data-testid="asset-delete-clean">No linked records — safe to delete.</p>}
          {isBulk && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-700">Type <span className="font-mono text-red-600">DELETE</span> to confirm:</p>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" data-testid="asset-bulk-confirm-input" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="asset-delete-cancel">Cancel</Button>
          <Button variant="destructive" disabled={busy || (isBulk ? confirm !== "DELETE" : deps === null)} onClick={run} data-testid="asset-delete-confirm">
            {isBulk ? `Delete ${target.length} assets` : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
