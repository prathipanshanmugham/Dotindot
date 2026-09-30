import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import api, { apiError } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Trash2 } from "lucide-react";
import { labelize } from "@/components/Badges";

// Generic permanent-delete kit: per-row checkbox + trash, bulk bar with typed DELETE, 24h recycle-bin.
// coll = backend collection key (see routes_records.DELETE_KEYS); permKey = "<module>.delete".
export const useRecordDelete = ({ coll, permKey, rows = [], onDeleted, labelOf = (r) => r.name || r.title || r.number || r.description || r.id }) => {
  const { hasPerm } = useAuth();
  const canDelete = hasPerm(permKey);
  const [selected, setSelected] = useState({});
  const [target, setTarget] = useState(null); // row | row[]
  const ids = rows.map((r) => r.id);
  const selectedIds = ids.filter((id) => selected[id]);
  const kit = {
    canDelete, coll, labelOf,
    selectedCount: selectedIds.length,
    allSelected: ids.length > 0 && selectedIds.length === ids.length,
    isSelected: (id) => !!selected[id],
    toggle: (id) => setSelected((s) => ({ ...s, [id]: !s[id] })),
    toggleAll: () => setSelected(kit.allSelected ? {} : Object.fromEntries(ids.map((id) => [id, true]))),
    requestDelete: (row) => setTarget(row),
    requestBulk: () => setTarget(rows.filter((r) => selected[r.id])),
    dialog: target ? (
      <RecordDeleteDialog coll={coll} target={target} labelOf={labelOf} onClose={() => setTarget(null)}
        onDeleted={() => { setTarget(null); setSelected({}); onDeleted && onDeleted(); }} />
    ) : null,
  };
  return kit;
};

export const RowDeleteControls = ({ kit, row, className = "" }) => {
  if (!kit.canDelete) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} onClick={(e) => e.stopPropagation()}>
      <Checkbox checked={kit.isSelected(row.id)} onCheckedChange={() => kit.toggle(row.id)} data-testid={`select-${kit.coll}-${row.id}`} />
      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-600" onClick={() => kit.requestDelete(row)} data-testid={`delete-${kit.coll}-${row.id}`} title="Delete permanently">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
};

export const BulkDeleteBar = ({ kit }) => {
  if (!kit.canDelete) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
        <Checkbox checked={kit.allSelected} onCheckedChange={kit.toggleAll} data-testid={`select-all-${kit.coll}`} /> All
      </label>
      {kit.selectedCount > 0 && (
        <Button variant="destructive" size="sm" onClick={kit.requestBulk} data-testid={`bulk-delete-${kit.coll}`}>
          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete {kit.selectedCount} selected
        </Button>
      )}
    </span>
  );
};

export const RecordDeleteDialog = ({ coll, target, labelOf, onClose, onDeleted }) => {
  const isBulk = Array.isArray(target);
  const [deps, setDeps] = useState(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setConfirm(""); setDeps(null);
    if (isBulk) return;
    api.get(`/records/${coll}/${target.id}/dependents`).then((r) => setDeps(r.data)).catch(() => setDeps({}));
  }, [coll, target, isBulk]);

  const run = async () => {
    setBusy(true);
    try {
      if (isBulk) {
        const { data } = await api.post(`/records/${coll}/bulk-delete`, { ids: target.map((r) => r.id) });
        toast.success(`${data.deleted} deleted — undo available for 24h in Settings`);
      } else {
        await api.delete(`/records/${coll}/${target.id}`);
        toast.success(`"${labelOf(target)}" deleted — undo available for 24h in Settings`);
      }
      window.dispatchEvent(new Event("records-changed"));
      onDeleted();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const depEntries = deps ? Object.entries(deps) : [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="record-delete-dialog">
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-red-700"><AlertTriangle className="h-5 w-5" /> {isBulk ? `Delete ${target.length} records?` : `Delete "${labelOf(target)}"?`}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm text-gray-600">
          <p>This is <span className="font-semibold text-red-600">permanent and cannot be undone</span> from this screen. A super admin can restore it from Settings → Recently deleted within 24 hours.</p>
          {!isBulk && deps === null && <p className="text-xs text-gray-400">Checking linked records…</p>}
          {!isBulk && depEntries.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-0.5" data-testid="record-delete-warnings">
              <div className="font-bold">Linked records will be removed or unlinked:</div>
              {depEntries.map(([k, n]) => <div key={k}>• {n} {labelize(k)}</div>)}
            </div>
          )}
          {isBulk && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-700">Type <span className="font-mono text-red-600">DELETE</span> to confirm:</p>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" data-testid="record-bulk-confirm-input" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="record-delete-cancel">Cancel</Button>
          <Button variant="destructive" disabled={busy || (isBulk ? confirm !== "DELETE" : deps === null)} onClick={run} data-testid="record-delete-confirm">
            {isBulk ? `Delete ${target.length}` : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
