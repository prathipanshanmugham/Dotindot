import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar } from "@/components/RecordDelete";
import api, { formatINR, apiError } from "@/lib/api";
import SalesLayout from "@/components/SalesLayout";
import ExportMenu from "@/components/ExportMenu";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const currentMonth = () => new Date().toISOString().slice(0, 7);
const currentQuarter = () => {
  const n = new Date();
  return `${n.getFullYear()}-Q${Math.floor(n.getMonth() / 3) + 1}`;
};

export default function TargetsPage() {
  const { user } = useAuth();
  const [targets, setTargets] = useState([]);
  const [period, setPeriod] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [team, setTeam] = useState([]);
  const [form, setForm] = useState({ scope: "user", user_id: "", period: currentMonth(), amount: "" });
  const [busy, setBusy] = useState(false);

  const canWrite = ["super_admin", "admin", "sales"].includes(user.role);

  const load = useCallback(async () => {
    const params = period === "all" ? {} : { period };
    const { data } = await api.get("/sales/targets", { params });
    setTargets(data);
  }, [period]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/users/team").then((r) => setTeam(r.data)).catch(() => {}); }, []);

  const periods = useMemo(() => {
    const s = new Set([currentMonth(), currentQuarter()]);
    targets.forEach((t) => s.add(t.period));
    return [...s].sort().reverse();
  }, [targets]);

  const submit = async () => {
    if (!form.amount || !form.period) { toast.error("Period and amount required"); return; }
    if (form.scope === "user" && !form.user_id) { toast.error("Pick a team member"); return; }
    setBusy(true);
    try {
      await api.post("/sales/targets", {
        scope: form.scope, user_id: form.scope === "user" ? form.user_id : null,
        period: form.period, amount: Number(form.amount),
      });
      toast.success("Target set");
      setDialogOpen(false);
      load();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    try { await api.delete(`/sales/targets/${id}`); toast.success("Target removed"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  const del = useRecordDelete({ coll: "targets", permKey: "sales.delete", rows: targets, onDeleted: () => load() });
  return (
    <SalesLayout
      title="Targets vs Actuals"
      subtitle="Actuals = value of won leads in the period."
      actions={
        <div className="flex items-center gap-2">
          <ExportMenu dataset="targets" params={period === "all" ? {} : { period }} />
          {canWrite && (
            <Button onClick={() => setDialogOpen(true)} data-testid="add-target-btn" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
              <Plus className="h-4 w-4 mr-1.5" /> Set Target
            </Button>
          )}
        </div>
      }
    >
      <div className="flex items-center gap-3">
        <Label className="text-sm text-gray-500">Period</Label>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[160px]" data-testid="target-period-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All periods</SelectItem>
            {periods.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3" data-testid="targets-list">
        {targets.length === 0 && <p className="text-sm text-gray-400">No targets for this period.</p>}
        {del.canDelete && <div className="flex justify-end">{del.dialog}<BulkDeleteBar kit={del} /></div>}
        {targets.map((t) => (
          <Card key={t.id} className="border-gray-200/80" data-testid={`target-row-${t.id}`}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">{t.user_name}</span>
                  <Badge variant="outline" className="bg-gray-50 border-gray-200 text-gray-500">{t.period}</Badge>
                  {t.on_track ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200" data-testid={`target-ontrack-${t.id}`}>On track</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200" data-testid={`target-behind-${t.id}`}>{t.pct}% there</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono">
                    <span className="font-semibold">{formatINR(t.actual)}</span>
                    <span className="text-gray-400"> / {formatINR(t.amount)}</span>
                  </span>
                  {del.canDelete ? <RowDeleteControls kit={del} row={t} /> : canWrite && (
                    <Button variant="ghost" size="icon" onClick={() => remove(t.id)} data-testid={`delete-target-${t.id}`}>
                      <Trash2 className="h-3.5 w-3.5 text-gray-300 hover:text-red-500" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full rounded-full ${t.pct >= 100 ? "bg-emerald-500" : t.pct >= 70 ? "bg-[#F26B21]" : "bg-amber-400"}`}
                  style={{ width: `${Math.min(t.pct, 100)}%` }} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Set target</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Scope</Label>
              <Select value={form.scope} onValueChange={(v) => setForm((p) => ({ ...p, scope: v }))}>
                <SelectTrigger data-testid="target-form-scope"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="user">Individual</SelectItem><SelectItem value="team">Team</SelectItem></SelectContent>
              </Select>
            </div>
            {form.scope === "user" && (
              <div className="space-y-1">
                <Label>Team member</Label>
                <Select value={form.user_id} onValueChange={(v) => setForm((p) => ({ ...p, user_id: v }))}>
                  <SelectTrigger data-testid="target-form-user"><SelectValue placeholder="Pick member" /></SelectTrigger>
                  <SelectContent>{team.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1"><Label>Period (YYYY-MM or YYYY-Qn)</Label><Input data-testid="target-form-period" value={form.period} onChange={(e) => setForm((p) => ({ ...p, period: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Target amount (₹)</Label><Input data-testid="target-form-amount" type="number" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy} data-testid="target-form-submit" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">{busy ? "Saving..." : "Set target"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SalesLayout>
  );
}
