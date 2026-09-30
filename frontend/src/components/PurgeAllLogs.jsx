import { useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Trash2 } from "lucide-react";

// super_admin only: purge ALL activity logs (typed DELETE). Backend writes one meta audit entry "logs purged by X".
export const PurgeAllLogs = ({ onDone }) => {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/records/activity_logs/purge", { confirm });
      toast.success(`Purged ${data.purged} log entries — one audit entry recorded`);
      setOpen(false); setConfirm(""); onDone && onDone();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)} data-testid="purge-all-logs-btn"><Trash2 className="h-4 w-4 mr-2" /> Purge all logs</Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirm(""); }}>
        <DialogContent className="max-w-md" data-testid="purge-all-logs-dialog">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-red-700"><AlertTriangle className="h-5 w-5" /> Purge every activity log?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">This is <span className="font-semibold text-red-600">permanent and cannot be undone</span>. A single audit entry "logs purged by you" will remain.</p>
          <div className="space-y-1"><p className="text-xs font-semibold text-gray-700">Type <span className="font-mono text-red-600">DELETE</span> to confirm:</p>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" data-testid="purge-all-logs-input" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={busy || confirm !== "DELETE"} onClick={run} data-testid="purge-all-logs-confirm">Purge everything</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
