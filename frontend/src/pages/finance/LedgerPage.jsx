import { useEffect, useMemo, useState, useCallback } from "react";
import api, { formatINR, apiError } from "@/lib/api";
import FinanceLayout, { EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_METHODS } from "@/components/FinanceLayout";
import ExportMenu from "@/components/ExportMenu";
import { labelize, CHART_COLORS } from "@/components/Badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { toast } from "sonner";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar } from "@/components/RecordDelete";

const iso = (d) => d.toISOString().slice(0, 10);

const PRESETS = {
  this_month: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)]; },
  last_month: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), iso(new Date(n.getFullYear(), n.getMonth(), 0))]; },
  quarter: () => { const n = new Date(); const qs = Math.floor(n.getMonth() / 3) * 3; return [iso(new Date(n.getFullYear(), qs, 1)), iso(n)]; },
  ytd: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), 0, 1)), iso(n)]; },
  all: () => ["", ""],
};

const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];
const EMPTY_TX = { type: "income", date: iso(new Date()), amount: "", category: "project_income", description: "", client_id: "none", project_id: "none", invoice_ref: "", payment_method: "bank_transfer" };

export default function LedgerPage() {
  const [data, setData] = useState({ transactions: [], totals: { income: 0, expense: 0, net: 0 } });
  const [preset, setPreset] = useState("all");
  const [range, setRange] = useState(["", ""]);
  const [type, setType] = useState("all");
  const [category, setCategory] = useState("all");
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_TX);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/clients").then((r) => setClients(r.data)).catch(() => {});
    api.get("/projects").then((r) => setProjects(r.data)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const params = {};
    if (range[0]) params.start = range[0];
    if (range[1]) params.end = range[1];
    if (type !== "all") params.type = type;
    if (category !== "all") params.category = category;
    const { data } = await api.get("/finance/transactions", { params });
    setData(data);
  }, [range, type, category]);

  useEffect(() => { load(); }, [load]);

  const applyPreset = (p) => { setPreset(p); setRange(PRESETS[p]()); };

  const monthly = useMemo(() => {
    const m = {};
    data.transactions.forEach((x) => {
      const k = (x.date || "").slice(0, 7);
      m[k] = m[k] || { month: k, income: 0, expense: 0 };
      m[k][x.type] += x.amount;
    });
    return Object.values(m).sort((a, b) => a.month.localeCompare(b.month));
  }, [data.transactions]);

  const byCategory = useMemo(() => {
    const m = {};
    data.transactions.filter((x) => x.type === "expense").forEach((x) => (m[x.category] = (m[x.category] || 0) + x.amount));
    return Object.entries(m).map(([name, value]) => ({ name: labelize(name), value: Math.round(value) }));
  }, [data.transactions]);

  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submitTx = async () => {
    if (!form.amount || Number(form.amount) <= 0) { toast.error("Enter a valid amount"); return; }
    setBusy(true);
    try {
      await api.post("/finance/transactions", {
        ...form, amount: Number(form.amount),
        client_id: form.client_id === "none" ? null : form.client_id,
        project_id: form.project_id === "none" ? null : form.project_id,
      });
      toast.success("Transaction recorded");
      setDialogOpen(false);
      setForm(EMPTY_TX);
      load();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const deleteTx = async (id) => {
    try { await api.delete(`/finance/transactions/${id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  const del = useRecordDelete({ coll: "transactions", permKey: "finance.delete", rows: data.transactions, onDeleted: () => load() });
  return (
    <FinanceLayout
      title="General Ledger"
      subtitle={`${data.transactions.length} transactions in view`}
      actions={
        <div className="flex items-center gap-2">
          <ExportMenu
            dataset="ledger"
            params={{
              ...(range[0] && { start: range[0] }), ...(range[1] && { end: range[1] }),
              ...(type !== "all" && { type }), ...(category !== "all" && { category }),
            }}
          />
          <Button onClick={() => setDialogOpen(true)} data-testid="add-transaction-btn" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
            <Plus className="h-4 w-4 mr-1.5" /> Add Transaction
          </Button>
        </div>
      }
    >
      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-gray-200/80"><CardContent className="p-5"><div className="text-2xl font-bold font-mono text-emerald-600" data-testid="ledger-total-income">{formatINR(data.totals.income)}</div><div className="text-xs text-gray-500">Total income</div></CardContent></Card>
        <Card className="border-gray-200/80"><CardContent className="p-5"><div className="text-2xl font-bold font-mono text-red-500" data-testid="ledger-total-expense">{formatINR(data.totals.expense)}</div><div className="text-xs text-gray-500">Total expenses</div></CardContent></Card>
        <Card className="border-gray-200/80"><CardContent className="p-5"><div className={`text-2xl font-bold font-mono ${data.totals.net >= 0 ? "text-gray-900" : "text-red-600"}`} data-testid="ledger-total-net">{formatINR(data.totals.net)}</div><div className="text-xs text-gray-500">Net</div></CardContent></Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-gray-200/80">
          <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">Income vs expense by month</CardTitle></CardHeader>
          <CardContent className="h-60" data-testid="ledger-trend-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
                <Tooltip formatter={(v) => formatINR(v)} cursor={{ fill: "#FFF7ED" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="Income" fill="#F26B21" radius={[5, 5, 0, 0]} maxBarSize={26} />
                <Bar dataKey="expense" name="Expense" fill="#94A3B8" radius={[5, 5, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-gray-200/80">
          <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">Expense breakdown by category</CardTitle></CardHeader>
          <CardContent className="h-60" data-testid="ledger-category-donut">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                  {byCategory.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => formatINR(v)} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-gray-200/80">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5">
            {Object.keys(PRESETS).map((p) => (
              <button key={p} onClick={() => applyPreset(p)} data-testid={`ledger-preset-${p}`}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${preset === p ? "bg-[#FFF7ED] text-[#F26B21] border border-orange-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                {labelize(p === "ytd" ? "YTD" : p)}
              </button>
            ))}
          </div>
          <Input type="date" className="w-[150px]" value={range[0]} onChange={(e) => { setRange([e.target.value, range[1]]); setPreset(""); }} data-testid="ledger-start-date" />
          <span className="text-gray-400 text-sm">→</span>
          <Input type="date" className="w-[150px]" value={range[1]} onChange={(e) => { setRange([range[0], e.target.value]); setPreset(""); }} data-testid="ledger-end-date" />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[130px]" data-testid="ledger-type-filter"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Types</SelectItem><SelectItem value="income">Income</SelectItem><SelectItem value="expense">Expense</SelectItem></SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[170px]" data-testid="ledger-category-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {ALL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{labelize(c)}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-gray-200/80 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/70"><TableHead className="w-20">{del.canDelete && <><BulkDeleteBar kit={del} />{del.dialog}</>}</TableHead>
              <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Category</TableHead>
              <TableHead>Description</TableHead><TableHead>Client / Project</TableHead><TableHead className="text-right">Amount</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.transactions.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-sm text-gray-400">No transactions in this range.</TableCell></TableRow>
            ) : data.transactions.slice(0, 200).map((x) => (
              <TableRow key={x.id} data-testid={`ledger-row-${x.id}`}><TableCell className="w-20"><RowDeleteControls kit={del} row={x} /></TableCell>
                <TableCell className="text-sm text-gray-600 whitespace-nowrap">{x.date}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={x.type === "income" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"}>
                    {labelize(x.type)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-gray-600">{labelize(x.category)}</TableCell>
                <TableCell className="text-sm text-gray-800 max-w-[260px] truncate">{x.description}</TableCell>
                <TableCell className="text-xs text-gray-500">{[x.client_name, x.project_name].filter(Boolean).join(" · ") || "—"}</TableCell>
                <TableCell className={`text-right font-mono text-sm font-semibold ${x.type === "income" ? "text-emerald-600" : "text-red-500"}`}>
                  {x.type === "income" ? "+" : "−"}{formatINR(x.amount)}
                </TableCell>
                <TableCell className="w-10">
                  <Button variant="ghost" size="icon" onClick={() => deleteTx(x.id)} data-testid={`delete-tx-${x.id}`}><Trash2 className="h-3.5 w-3.5 text-gray-300 hover:text-red-500" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Add transaction dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add transaction</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v, category: v === "income" ? "project_income" : "operational" }))}>
                <SelectTrigger data-testid="tx-form-type"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="income">Income</SelectItem><SelectItem value="expense">Expense</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setF("category", v)}>
                <SelectTrigger data-testid="tx-form-category"><SelectValue /></SelectTrigger>
                <SelectContent>{(form.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => <SelectItem key={c} value={c}>{labelize(c)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Date</Label><Input type="date" data-testid="tx-form-date" value={form.date} onChange={(e) => setF("date", e.target.value)} /></div>
            <div className="space-y-1"><Label>Amount (₹)</Label><Input type="number" data-testid="tx-form-amount" value={form.amount} onChange={(e) => setF("amount", e.target.value)} /></div>
            <div className="col-span-2 space-y-1"><Label>Description</Label><Input data-testid="tx-form-description" value={form.description} onChange={(e) => setF("description", e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Client</Label>
              <Select value={form.client_id} onValueChange={(v) => setF("client_id", v)}>
                <SelectTrigger data-testid="tx-form-client"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Project</Label>
              <Select value={form.project_id} onValueChange={(v) => setF("project_id", v)}>
                <SelectTrigger data-testid="tx-form-project"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Invoice ref</Label><Input data-testid="tx-form-invoice" value={form.invoice_ref} onChange={(e) => setF("invoice_ref", e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Payment method</Label>
              <Select value={form.payment_method} onValueChange={(v) => setF("payment_method", v)}>
                <SelectTrigger data-testid="tx-form-method"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{labelize(m)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitTx} disabled={busy} data-testid="tx-form-submit" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">{busy ? "Saving..." : "Record transaction"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FinanceLayout>
  );
}
