import { useEffect, useState, useCallback } from "react";
import api, { formatINR, apiError } from "@/lib/api";
import FinanceLayout from "@/components/FinanceLayout";
import ExportMenu from "@/components/ExportMenu";
import { labelize } from "@/components/Badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Pencil, BellRing, Cpu } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar } from "@/components/RecordDelete";

const EMPTY = { name: "", vendor: "", cost: "", billing_cycle: "monthly", next_renewal_date: "", owner: "", is_ai: false, status: "active" };

export default function SubscriptionsPage() {
  const [data, setData] = useState({ subscriptions: [], monthly_burn: 0, alerts: 0 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get("/finance/subscriptions");
    setData(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (s) => {
    setEditing(s);
    setForm({ name: s.name, vendor: s.vendor, cost: s.cost, billing_cycle: s.billing_cycle, next_renewal_date: s.next_renewal_date || "", owner: s.owner, is_ai: s.is_ai, status: s.status });
    setDialogOpen(true);
  };
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.name || !form.cost) { toast.error("Name and cost are required"); return; }
    setBusy(true);
    try {
      const payload = { ...form, cost: Number(form.cost), next_renewal_date: form.next_renewal_date || null };
      if (editing) await api.put(`/finance/subscriptions/${editing.id}`, payload);
      else await api.post("/finance/subscriptions", payload);
      toast.success(editing ? "Subscription updated" : "Subscription added");
      setDialogOpen(false);
      load();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    try { await api.delete(`/finance/subscriptions/${id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  const alertSubs = data.subscriptions.filter((s) => s.renewal_alert);
  const byVendor = data.subscriptions.filter((s) => s.status === "active").map((s) => ({ name: s.name, value: s.monthly_equivalent }));

  const del = useRecordDelete({ coll: "subscriptions", permKey: "finance.delete", rows: data.subscriptions, onDeleted: () => load() });
  return (
    <FinanceLayout
      title="Subscriptions"
      subtitle="Recurring tool spend, normalized to monthly equivalents."
      actions={
        <div className="flex items-center gap-2">
          <ExportMenu dataset="subscriptions" />
          <Button onClick={openCreate} data-testid="add-subscription-btn" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
            <Plus className="h-4 w-4 mr-1.5" /> Add Subscription
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-gray-200/80"><CardContent className="p-5"><div className="text-2xl font-bold font-mono" data-testid="subs-monthly-burn">{formatINR(data.monthly_burn)}</div><div className="text-xs text-gray-500">Monthly burn (normalized)</div></CardContent></Card>
        <Card className={`${data.alerts ? "border-amber-300 bg-amber-50/50" : "border-gray-200/80"}`}><CardContent className="p-5"><div className="text-2xl font-bold font-mono" data-testid="subs-alert-count">{data.alerts}</div><div className="text-xs text-gray-500">Renewing within 30 days</div></CardContent></Card>
        <Card className="border-gray-200/80"><CardContent className="p-5"><div className="text-2xl font-bold font-mono">{data.subscriptions.filter((s) => s.status === "active").length}</div><div className="text-xs text-gray-500">Active subscriptions</div></CardContent></Card>
      </div>

      {alertSubs.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50" data-testid="renewal-alert-banner">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 mb-2"><BellRing className="h-4 w-4" /> Upcoming renewals</div>
            <div className="flex flex-wrap gap-2">
              {alertSubs.map((s) => (
                <Badge key={s.id} variant="outline" className="bg-white border-amber-300 text-amber-800" data-testid={`renewal-alert-${s.id}`}>
                  {s.name} · {s.days_to_renewal}d · {formatINR(s.cost)}/{s.billing_cycle.slice(0, 2)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-gray-200/80">
        <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">Monthly-equivalent spend by tool</CardTitle></CardHeader>
        <CardContent className="h-56" data-testid="subs-vendor-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byVendor}>
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#6B7280" }} axisLine={false} tickLine={false} interval={0} angle={-25} textAnchor="end" height={55} />
              <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => formatINR(v)} cursor={{ fill: "#FFF7ED" }} />
              <Bar dataKey="value" fill="#FBA834" radius={[5, 5, 0, 0]} maxBarSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-gray-200/80 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/70"><TableHead className="w-20">{del.canDelete && <><BulkDeleteBar kit={del} />{del.dialog}</>}</TableHead>
              <TableHead>Tool</TableHead><TableHead>Owner</TableHead><TableHead>Cycle</TableHead>
              <TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Monthly eq.</TableHead>
              <TableHead>Next renewal</TableHead><TableHead>Status</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.subscriptions.map((s) => (
              <TableRow key={s.id} data-testid={`subscription-row-${s.id}`}><TableCell className="w-20"><RowDeleteControls kit={del} row={s} /></TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {s.is_ai && <Cpu className="h-3.5 w-3.5 text-[#F26B21]" />}
                    <div>
                      <div className="font-semibold text-gray-900 text-sm">{s.name}</div>
                      <div className="text-xs text-gray-400">{s.vendor}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-gray-600">{s.owner}</TableCell>
                <TableCell className="text-sm text-gray-600">{labelize(s.billing_cycle)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatINR(s.cost)}</TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold">{formatINR(s.monthly_equivalent)}</TableCell>
                <TableCell className="text-sm">
                  <span className="text-gray-600">{s.next_renewal_date || "—"}</span>
                  {s.renewal_alert && <Badge variant="outline" className="ml-2 bg-amber-100 text-amber-800 border-amber-300">{s.days_to_renewal}d</Badge>}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={s.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}>
                    {labelize(s.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)} data-testid={`edit-subscription-${s.id}`}><Pencil className="h-3.5 w-3.5 text-gray-400" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(s.id)} data-testid={`delete-subscription-${s.id}`}><Trash2 className="h-3.5 w-3.5 text-gray-300 hover:text-red-500" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? `Edit ${editing.name}` : "Add subscription"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2"><Label>Name</Label><Input data-testid="sub-form-name" value={form.name} onChange={(e) => setF("name", e.target.value)} /></div>
            <div className="space-y-1"><Label>Vendor</Label><Input data-testid="sub-form-vendor" value={form.vendor} onChange={(e) => setF("vendor", e.target.value)} /></div>
            <div className="space-y-1"><Label>Owner / team</Label><Input data-testid="sub-form-owner" value={form.owner} onChange={(e) => setF("owner", e.target.value)} /></div>
            <div className="space-y-1"><Label>Cost (₹)</Label><Input data-testid="sub-form-cost" type="number" value={form.cost} onChange={(e) => setF("cost", e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Billing cycle</Label>
              <Select value={form.billing_cycle} onValueChange={(v) => setF("billing_cycle", v)}>
                <SelectTrigger data-testid="sub-form-cycle"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem><SelectItem value="yearly">Yearly</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Next renewal</Label><Input data-testid="sub-form-renewal" type="date" value={form.next_renewal_date} onChange={(e) => setF("next_renewal_date", e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setF("status", v)}>
                <SelectTrigger data-testid="sub-form-status"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex items-center gap-2 pt-1">
              <Switch checked={form.is_ai} onCheckedChange={(v) => setF("is_ai", v)} data-testid="sub-form-ai" />
              <Label className="text-sm">AI tool (appears in AI Spend sub-ledger)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy} data-testid="sub-form-submit" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">{busy ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FinanceLayout>
  );
}
