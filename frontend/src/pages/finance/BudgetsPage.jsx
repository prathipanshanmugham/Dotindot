import { useEffect, useState, useCallback, useMemo } from "react";
import api, { formatINR, apiError } from "@/lib/api";
import FinanceLayout, { EXPENSE_CATEGORIES } from "@/components/FinanceLayout";
import ExportMenu from "@/components/ExportMenu";
import { labelize } from "@/components/Badges";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const currentMonth = () => new Date().toISOString().slice(0, 7);
const currentQuarter = () => {
  const n = new Date();
  return `${n.getFullYear()}-Q${Math.floor(n.getMonth() / 3) + 1}`;
};

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState([]);
  const [period, setPeriod] = useState(currentMonth());
  const [report, setReport] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ period: currentMonth(), category: "operational", amount: "" });
  const [busy, setBusy] = useState(false);

  const loadBudgets = useCallback(() => api.get("/finance/budgets").then((r) => setBudgets(r.data)).catch(() => {}), []);
  const loadReport = useCallback(() => api.get("/finance/budgets/report", { params: { period } }).then((r) => setReport(r.data)).catch(() => {}), [period]);

  useEffect(() => { loadBudgets(); }, [loadBudgets]);
  useEffect(() => { loadReport(); }, [loadReport]);

  const periods = useMemo(() => {
    const s = new Set([currentMonth(), currentQuarter()]);
    budgets.forEach((b) => s.add(b.period));
    return [...s].sort().reverse();
  }, [budgets]);

  const submit = async () => {
    if (!form.amount || !form.period) { toast.error("Period and amount required"); return; }
    setBusy(true);
    try {
      await api.post("/finance/budgets", { ...form, amount: Number(form.amount) });
      toast.success("Budget added");
      setDialogOpen(false);
      loadBudgets(); loadReport();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    try { await api.delete(`/finance/budgets/${id}`); toast.success("Budget removed"); loadBudgets(); loadReport(); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <FinanceLayout
      title="Budgets"
      subtitle="Actual spend vs planned budget per category. Actuals come straight from the ledger."
      actions={
        <div className="flex items-center gap-2">
          <ExportMenu dataset="budgets" params={{ period }} />
          <Button onClick={() => setDialogOpen(true)} data-testid="add-budget-btn" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
            <Plus className="h-4 w-4 mr-1.5" /> Add Budget
          </Button>
        </div>
      }
    >
      <div className="flex items-center gap-3">
        <Label className="text-sm text-gray-500">Period</Label>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[170px]" data-testid="budget-period-select"><SelectValue /></SelectTrigger>
          <SelectContent>{periods.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="space-y-3" data-testid="budget-report">
        {report?.rows?.length === 0 && <p className="text-sm text-gray-400">No budgets defined for {period}. Add one to start tracking.</p>}
        {report?.rows?.map((r) => (
          <Card key={r.id} className={`border ${r.over ? "border-red-300 bg-red-50/40" : "border-gray-200/80"}`} data-testid={`budget-row-${r.category}`}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">{labelize(r.category)}</span>
                  {r.over && (
                    <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 gap-1" data-testid={`budget-over-flag-${r.category}`}>
                      <AlertTriangle className="h-3 w-3" /> {r.over_pct}% over
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono">
                    <span className={r.over ? "text-red-600 font-semibold" : "text-gray-800 font-semibold"}>{formatINR(r.actual)}</span>
                    <span className="text-gray-400"> / {formatINR(r.amount)}</span>
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => remove(r.id)} data-testid={`delete-budget-${r.id}`}><Trash2 className="h-3.5 w-3.5 text-gray-300 hover:text-red-500" /></Button>
                </div>
              </div>
              <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${r.over ? "bg-red-500" : r.pct > 80 ? "bg-amber-400" : "bg-[#F26B21]"}`}
                  style={{ width: `${Math.min(r.pct, 100)}%` }}
                />
              </div>
              <div className="text-[11px] text-gray-400 mt-1">{r.pct}% of budget used</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {report?.unbudgeted?.length > 0 && (
        <Card className="border-gray-200/80">
          <CardContent className="p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Spend without a budget in {period}</div>
            <div className="flex flex-wrap gap-2">
              {report.unbudgeted.map((u) => (
                <Badge key={u.category} variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                  {labelize(u.category)} · {formatINR(u.actual)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add budget</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Period (YYYY-MM or YYYY-Qn)</Label><Input data-testid="budget-form-period" value={form.period} onChange={(e) => setForm((p) => ({ ...p, period: e.target.value }))} placeholder="2026-09 or 2026-Q3" /></div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
                <SelectTrigger data-testid="budget-form-category"><SelectValue /></SelectTrigger>
                <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{labelize(c)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Amount (₹)</Label><Input data-testid="budget-form-amount" type="number" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy} data-testid="budget-form-submit" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">{busy ? "Saving..." : "Add budget"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FinanceLayout>
  );
}
