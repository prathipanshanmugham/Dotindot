import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { labelize } from "@/components/Badges";
import { History, Undo2 } from "lucide-react";

const remaining = (iso) => {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return "expiring";
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h ? `${h}h ${m}m left` : `${m}m left`;
};

// 24h undo for Workspace hard-deletes (super_admin only)
export const RecycleBin = ({ onRestored }) => {
  const [rows, setRows] = useState([]);

  const load = useCallback(() => {
    api.get("/workspace/recycle-bin").then((r) => setRows(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    window.addEventListener("workspace-deleted", load);
    return () => { clearInterval(t); window.removeEventListener("workspace-deleted", load); };
  }, [load]);

  const restore = async (s) => {
    try {
      await api.post(`/workspace/recycle-bin/${s.id}/restore`);
      toast.success(`Restored "${s.label}"`);
      load();
      onRestored && onRestored();
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <Card className="border-gray-200/80 shadow-sm" data-testid="recycle-bin">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2"><History className="h-4 w-4 text-[#F26B21]" /> Recently deleted</CardTitle>
        <p className="text-xs text-gray-400">Hard-deleted records can be restored for 24 hours (including cascaded dependents). After that they are purged permanently.</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 && <p className="text-sm text-gray-400 py-3" data-testid="recycle-bin-empty">Nothing in the bin.</p>}
        <div className="divide-y divide-gray-100">
          {rows.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 py-2.5" data-testid={`recycle-row-${s.record_id}`}>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-800 truncate">{s.label}</div>
                <div className="text-[11px] text-gray-400 flex flex-wrap gap-x-2">
                  <Badge variant="outline" className="text-[9px] px-1.5">{labelize(s.coll)}</Badge>
                  <span>by {s.deleted_by}</span>
                  {s.cascaded > 0 && <span>· {s.cascaded} dependent{s.cascaded > 1 ? "s" : ""}</span>}
                  <span className="text-amber-600 font-semibold">· {remaining(s.expires_at)}</span>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => restore(s)} data-testid={`recycle-restore-${s.record_id}`}>
                <Undo2 className="h-3.5 w-3.5 mr-1.5" /> Undo
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
