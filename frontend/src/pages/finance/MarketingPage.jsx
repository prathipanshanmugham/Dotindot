import { useEffect, useState, useCallback } from "react";
import api, { formatINR, apiError } from "@/lib/api";
import FinanceLayout, { CHANNELS } from "@/components/FinanceLayout";
import ExportMenu from "@/components/ExportMenu";
import { labelize } from "@/components/Badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { toast } from "sonner";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar } from "@/components/RecordDelete";

const CHANNEL_STYLE = {
  meta: "bg-blue-50 text-blue-700 border-blue-200",
  google: "bg-emerald-50 text-emerald-700 border-emerald-200",
  linkedin: "bg-sky-50 text-sky-700 border-sky-200",
  other: "bg-gray-100 text-gray-600 border-gray-200",
};

const EMPTY = { name: "", channel: "meta", spend: "", period: "", client_id: "none" };

export default function MarketingPage() {
  const [data, setData] = useState(null);
  const [clients, setClients] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get("/finance/marketing").then((r) => setData(r.data)).catch(() => {}), []);

  useEffect(() => {
    load();
    api.get("/clients").then((r) => setClients(r.data)).catch(() => {});
  }, [load]);

  const submit = async () => {
    if (!form.name) { toast.error("Campaign name required"); return; }
    setBusy(true);
    try {
      await api.post("/finance/campaigns", { ...form, spend: Number(form.spend) || 0, client_id: form.client_id === "none" ? null : form.client_id });
      toast.success("Campaign added");
      setDialogOpen(false);
      setForm(EMPTY);
      load();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    try { await api.delete(`/finance/campaigns/${id}`); toast.success("Campaign deleted"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  const del = useRecordDelete({ coll: "campaigns", permKey: "finance.delete", rows: data?.campaigns || [], onDeleted: () => load() });
  if (!data)
    return <FinanceLayout title="Marketing Financials"><div className="h-40 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div></FinanceLayout>;

  return (
    <FinanceLayout
      title="Marketing Financials"
      subtitle="Campaign spend vs marketing-attributed revenue. Attribute income by tagging ledger transactions with a campaign."
      actions={
        <div className="flex items-center gap-2">
          <ExportMenu dataset="marketing" />
          <Button onClick={() => setDialogOpen(true)} data-testid="add-campaign-btn" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
            <Plus className="h-4 w-4 mr-1.5" /> Add Campaign
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-gray-200/80"><CardContent className="p-5"><div className="text-2xl font-bold font-mono text-red-500" data-testid="mkt-total-spend">{formatINR(data.total_spend)}</div><div className="text-xs text-gray-500">Total campaign spend</div></CardContent></Card>
        <Card className="border-gray-200/80"><CardContent className="p-5"><div className="text-2xl font-bold font-mono text-emerald-600" data-testid="mkt-total-revenue">{formatINR(data.total_attributed_revenue)}</div><div className="text-xs text-gray-500">Attributed revenue</div></CardContent></Card>
        <Card className="border-gray-200/80"><CardContent className="p-5"><div className="text-2xl font-bold font-mono" data-testid="mkt-overall-roi">{data.overall_roi}x</div><div className="text-xs text-gray-500">Overall ROI</div></CardContent></Card>
      </div>

      <Card className="border-gray-200/80">
        <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">Spend vs attributed revenue by channel</CardTitle></CardHeader>
        <CardContent className="h-64" data-testid="mkt-channel-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.by_channel.map((c) => ({ ...c, channel: labelize(c.channel) }))}>
              <XAxis dataKey="channel" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
              <Tooltip formatter={(v) => formatINR(v)} cursor={{ fill: "#FFF7ED" }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="spend" name="Spend" fill="#94A3B8" radius={[5, 5, 0, 0]} maxBarSize={36} />
              <Bar dataKey="revenue" name="Attributed revenue" fill="#F26B21" radius={[5, 5, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-gray-200/80 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/70"><TableHead className="w-20">{del.canDelete && <><BulkDeleteBar kit={del} />{del.dialog}</>}</TableHead>
              <TableHead>Campaign</TableHead><TableHead>Channel</TableHead><TableHead>Period</TableHead><TableHead>Client</TableHead>
              <TableHead className="text-right">Spend</TableHead><TableHead className="text-right">Attributed revenue</TableHead><TableHead className="text-right">ROI</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.campaigns.map((c) => (
              <TableRow key={c.id} data-testid={`campaign-row-${c.id}`}><TableCell className="w-20"><RowDeleteControls kit={del} row={c} /></TableCell>
                <TableCell className="font-semibold text-gray-900 text-sm">{c.name}</TableCell>
                <TableCell><Badge variant="outline" className={CHANNEL_STYLE[c.channel] || CHANNEL_STYLE.other}>{labelize(c.channel)}</Badge></TableCell>
                <TableCell className="text-xs text-gray-500">{c.period}</TableCell>
                <TableCell className="text-sm text-gray-600">{c.client_name || "—"}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatINR(c.spend)}</TableCell>
                <TableCell className="text-right font-mono text-sm text-emerald-600">{formatINR(c.attributed_revenue)}</TableCell>
                <TableCell className={`text-right font-mono text-sm font-semibold ${c.roi >= 1 ? "text-emerald-600" : "text-red-500"}`}>{c.roi}x</TableCell>
                <TableCell className="w-10"><Button variant="ghost" size="icon" onClick={() => remove(c.id)} data-testid={`delete-campaign-${c.id}`}><Trash2 className="h-3.5 w-3.5 text-gray-300 hover:text-red-500" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add campaign</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2"><Label>Name</Label><Input data-testid="campaign-form-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-1">
              <Label>Channel</Label>
              <Select value={form.channel} onValueChange={(v) => setForm((p) => ({ ...p, channel: v }))}>
                <SelectTrigger data-testid="campaign-form-channel"><SelectValue /></SelectTrigger>
                <SelectContent>{CHANNELS.map((c) => <SelectItem key={c} value={c}>{labelize(c)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Spend (₹)</Label><Input data-testid="campaign-form-spend" type="number" value={form.spend} onChange={(e) => setForm((p) => ({ ...p, spend: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Period</Label><Input data-testid="campaign-form-period" value={form.period} onChange={(e) => setForm((p) => ({ ...p, period: e.target.value }))} placeholder="2026-09 or range" /></div>
            <div className="space-y-1">
              <Label>Client (optional)</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm((p) => ({ ...p, client_id: v }))}>
                <SelectTrigger data-testid="campaign-form-client"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy} data-testid="campaign-form-submit" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">{busy ? "Saving..." : "Add campaign"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FinanceLayout>
  );
}
