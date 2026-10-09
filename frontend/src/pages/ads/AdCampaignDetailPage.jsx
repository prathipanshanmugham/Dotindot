import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import api, { formatINR, apiError } from "@/lib/api";
import { CampaignFormDialog, AdStatusBadge, platformLabel } from "@/pages/ads/AdsPage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Pencil, Trash2, Plus } from "lucide-react";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { SubItemDeleteButton } from "@/components/RecordDelete";

const SNAP_EMPTY = { date: "", spend: "", impressions: "", clicks: "", conversions: "", revenue: "" };

export default function AdCampaignDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [c, setC] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [snapOpen, setSnapOpen] = useState(false);
  const [snap, setSnap] = useState(SNAP_EMPTY);
  const [busy, setBusy] = useState(false);

  const canWrite = ["super_admin", "admin", "ads_manager"].includes(user.role);

  const load = useCallback(() => {
    api.get(`/ads/campaigns/${id}`).then((r) => setC(r.data)).catch((e) => toast.error(apiError(e)));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!c)
    return <div className="h-64 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  const m = c.metrics;

  const addSnapshot = async () => {
    if (!snap.date) return toast.error("Snapshot date is required");
    setBusy(true);
    try {
      const body = { date: snap.date };
      ["spend", "impressions", "clicks", "conversions", "revenue"].forEach((k) => (body[k] = Number(snap[k]) || 0));
      await api.post(`/ads/campaigns/${id}/metrics`, body);
      toast.success("Metrics snapshot added");
      setSnapOpen(false);
      setSnap(SNAP_EMPTY);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/ads/campaigns/${id}`);
      toast.success("Campaign deleted");
      navigate("/ads");
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-6 max-w-6xl" data-testid="campaign-detail-page">
      <button onClick={() => navigate("/ads")} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#F26B21] transition-colors" data-testid="back-to-ads">
        <ArrowLeft className="h-4 w-4" /> Back to campaigns
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900" data-testid="campaign-name">{c.name}</h1>
            <AdStatusBadge status={c.status} />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {platformLabel(c.platform)} · {c.client_name || "Internal"} · {c.start_date || "—"} → {c.end_date || "ongoing"} · Budget {formatINR(c.budget)}
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSnapOpen(true)} data-testid="add-snapshot-btn">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add metrics snapshot
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} data-testid="edit-campaign-btn">
              <Pencil className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" data-testid="delete-campaign-btn"><Trash2 className="h-4 w-4" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {c.name}?</AlertDialogTitle>
                  <AlertDialogDescription>All metric snapshots for this campaign will be removed.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={remove} className="bg-red-600 hover:bg-red-700" data-testid="confirm-delete-campaign">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          ["Spend", formatINR(m.spend)], ["Revenue", formatINR(m.revenue)],
          ["ROAS", `${m.roas}x`], ["CTR", `${m.ctr}%`],
          ["CPC", formatINR(m.cpc)], ["Cost / conversion", formatINR(m.cost_per_conversion)],
        ].map(([label, value]) => (
          <Card key={label} className="border-gray-200/80 shadow-sm" data-testid={`campaign-kpi-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
            <CardContent className="p-4">
              <div className="text-lg font-bold font-mono text-gray-900">{value}</div>
              <div className="text-[11px] text-gray-500">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trend chart */}
      <Card className="border-gray-200/80 shadow-sm">
        <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">Snapshot trend — spend, revenue & ROAS</CardTitle></CardHeader>
        <CardContent className="h-64" data-testid="campaign-trend-chart">
          {c.trend?.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={c.trend}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={34} tickFormatter={(v) => `${v}x`} />
                <Tooltip formatter={(v, n) => (n === "ROAS" ? `${v}x` : formatINR(v))} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="l" dataKey="spend" name="Spend" fill="#CBD5E1" radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Bar yAxisId="l" dataKey="revenue" name="Revenue" fill="#F26B21" radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Line yAxisId="r" type="monotone" dataKey="roas" name="ROAS" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <div className="h-full flex items-center justify-center text-sm text-gray-400">No metric snapshots yet — add the first one.</div>}
        </CardContent>
      </Card>

      {/* Snapshots table */}
      <Card className="border-gray-200/80 shadow-sm overflow-hidden">
        <div className="px-4 pt-3 text-xs font-bold uppercase tracking-widest text-[#F26B21]">Metric snapshots</div>
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/70">
              <TableHead>Date</TableHead><TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Impressions</TableHead><TableHead className="text-right">Clicks</TableHead>
              <TableHead className="text-right">Conversions</TableHead><TableHead className="text-right">Revenue</TableHead>
              <TableHead>Entered by</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(c.metrics_history || []).length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-sm text-gray-400">No snapshots recorded.</TableCell></TableRow>
            )}
            {[...(c.metrics_history || [])].reverse().map((s) => (
              <TableRow key={s.id} data-testid={`snapshot-row-${s.id}`}>
                <TableCell className="text-sm font-medium">{s.date}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatINR(s.spend)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{(s.impressions || 0).toLocaleString("en-IN")}</TableCell>
                <TableCell className="text-right font-mono text-sm">{(s.clicks || 0).toLocaleString("en-IN")}</TableCell>
                <TableCell className="text-right font-mono text-sm">{s.conversions}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatINR(s.revenue)}</TableCell>
                <TableCell className="text-xs text-gray-400">{s.entered_by}</TableCell>
                <TableCell className="w-12"><SubItemDeleteButton coll="ad_campaigns" rid={c.id} field="metrics_history" itemId={s.id} permKey="ads.delete" label="snapshot" onDeleted={load} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {c.notes && (
        <Card className="border-gray-200/80"><CardContent className="p-4 text-sm text-gray-600 whitespace-pre-wrap">{c.notes}</CardContent></Card>
      )}

      {/* Add snapshot dialog */}
      <Dialog open={snapOpen} onOpenChange={setSnapOpen}>
        <DialogContent className="max-w-md" data-testid="snapshot-dialog">
          <DialogHeader><DialogTitle>Add metrics snapshot</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Snapshot date</Label><Input type="date" className="mt-1" value={snap.date} onChange={(e) => setSnap((s) => ({ ...s, date: e.target.value }))} data-testid="snapshot-date" /></div>
            {["spend", "impressions", "clicks", "conversions", "revenue"].map((k) => (
              <div key={k}>
                <Label className="capitalize">{k}{["spend", "revenue"].includes(k) ? " (₹)" : ""}</Label>
                <Input type="number" className="mt-1" value={snap[k]} onChange={(e) => setSnap((s) => ({ ...s, [k]: e.target.value }))} data-testid={`snapshot-${k}`} />
              </div>
            ))}
          </div>
          <Button onClick={addSnapshot} disabled={busy} className="w-full bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="snapshot-submit">
            {busy ? "Saving..." : "Add snapshot"}
          </Button>
        </DialogContent>
      </Dialog>

      <CampaignFormDialog open={editOpen} onOpenChange={setEditOpen} clients={[{ id: c.client_id, name: c.client_name }].filter((x) => x.id)} campaign={c} onSaved={load} />
    </div>
  );
}
