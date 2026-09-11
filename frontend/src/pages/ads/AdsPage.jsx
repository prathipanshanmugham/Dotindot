import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import api, { formatINR, apiError } from "@/lib/api";
import ExportMenu from "@/components/ExportMenu";
import { labelize, CHART_COLORS } from "@/components/Badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Megaphone } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

export const AD_PLATFORMS = [
  { value: "google_ads", label: "Google Ads" },
  { value: "meta_ads", label: "Meta Ads" },
  { value: "amazon_ppc", label: "Amazon PPC" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "other", label: "Other" },
];
export const platformLabel = (v) => AD_PLATFORMS.find((p) => p.value === v)?.label || labelize(v);

const AD_STATUSES = ["active", "paused", "completed"];
const statusStyles = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-gray-100 text-gray-500 border-gray-200",
};

export const AdStatusBadge = ({ status }) => (
  <Badge variant="outline" className={`${statusStyles[status] || ""} font-medium`}>{labelize(status)}</Badge>
);

export const CAMPAIGN_EMPTY = {
  name: "", platform: "google_ads", client_id: "", status: "active",
  start_date: "", end_date: "", budget: "", notes: "",
};

export const CampaignFormDialog = ({ open, onOpenChange, clients, campaign, onSaved }) => {
  const [form, setForm] = useState(CAMPAIGN_EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(campaign ? {
        name: campaign.name, platform: campaign.platform, client_id: campaign.client_id || "",
        status: campaign.status, start_date: campaign.start_date || "", end_date: campaign.end_date || "",
        budget: campaign.budget ?? "", notes: campaign.notes || "",
      } : CAMPAIGN_EMPTY);
    }
  }, [open, campaign]);

  const save = async () => {
    if (!form.name.trim()) return toast.error("Campaign name is required");
    setBusy(true);
    const body = { ...form, budget: Number(form.budget) || 0, client_id: form.client_id || null,
      start_date: form.start_date || null, end_date: form.end_date || null };
    try {
      const res = campaign
        ? await api.put(`/ads/campaigns/${campaign.id}`, body)
        : await api.post("/ads/campaigns", body);
      toast.success(campaign ? "Campaign updated" : "Campaign created");
      onOpenChange(false);
      onSaved?.(res.data);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="campaign-form-dialog">
        <DialogHeader><DialogTitle>{campaign ? "Edit campaign" : "New ad campaign"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Name</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} data-testid="campaign-form-name" /></div>
          <div>
            <Label>Platform</Label>
            <Select value={form.platform} onValueChange={(v) => setForm((f) => ({ ...f, platform: v }))}>
              <SelectTrigger className="mt-1" data-testid="campaign-form-platform"><SelectValue /></SelectTrigger>
              <SelectContent>{AD_PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Client</Label>
            <Select value={form.client_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, client_id: v === "none" ? "" : v }))}>
              <SelectTrigger className="mt-1" data-testid="campaign-form-client"><SelectValue placeholder="Client" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Internal / no client</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Budget (₹)</Label><Input type="number" className="mt-1" value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} data-testid="campaign-form-budget" /></div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{AD_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Start</Label><Input type="date" className="mt-1" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} /></div>
          <div><Label>End</Label><Input type="date" className="mt-1" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} /></div>
          <div className="col-span-2"><Label>Notes</Label><Textarea rows={2} className="mt-1" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        <Button onClick={save} disabled={busy} className="w-full bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="campaign-form-submit">
          {busy ? "Saving..." : campaign ? "Save changes" : "Create campaign"}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default function AdsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [rows, setRows] = useState([]);
  const [clients, setClients] = useState([]);
  const [filters, setFilters] = useState({ platform: "all", status: "all", client_id: "all" });
  const [createOpen, setCreateOpen] = useState(false);

  const canWrite = ["super_admin", "admin", "ads_manager"].includes(user.role);

  const load = useCallback(() => {
    const params = {};
    if (filters.platform !== "all") params.platform = filters.platform;
    if (filters.status !== "all") params.status = filters.status;
    if (filters.client_id !== "all") params.client_id = filters.client_id;
    api.get("/ads/campaigns", { params }).then((r) => setRows(r.data)).catch((e) => toast.error(apiError(e)));
    api.get("/ads/overview").then((r) => setOverview(r.data)).catch(() => {});
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/clients").then((r) => setClients(r.data)).catch(() => {});
  }, []);

  const t = overview?.totals;

  return (
    <div className="space-y-6 max-w-7xl" data-testid="ads-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#F26B21]">Growth</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Ads Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manual campaign tracking — spend, revenue and ROAS across Google, Meta, Amazon PPC & LinkedIn.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu dataset="ad-campaigns" params={{
            ...(filters.platform !== "all" && { platform: filters.platform }),
            ...(filters.status !== "all" && { status: filters.status }),
          }} />
          {canWrite && (
            <Button onClick={() => setCreateOpen(true)} className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="add-campaign-btn">
              <Plus className="h-4 w-4 mr-1.5" /> New campaign
            </Button>
          )}
        </div>
      </div>

      {t && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            ["Campaigns", t.campaigns, "ads-stat-campaigns"],
            ["Active", t.active, "ads-stat-active"],
            ["Total spend", formatINR(t.spend), "ads-stat-spend"],
            ["Attributed revenue", formatINR(t.revenue), "ads-stat-revenue"],
            ["Blended ROAS", `${t.roas}x`, "ads-stat-roas"],
            ["Conversions", t.conversions.toLocaleString("en-IN"), "ads-stat-conversions"],
          ].map(([label, value, tid]) => (
            <Card key={tid} className="border-gray-200/80 shadow-sm" data-testid={tid}>
              <CardContent className="p-4">
                <div className="text-lg font-bold text-gray-900 font-mono">{value}</div>
                <div className="text-[11px] text-gray-500">{label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {overview && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-gray-200/80 shadow-sm">
            <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">Spend vs revenue by platform</CardTitle></CardHeader>
            <CardContent className="h-60" data-testid="ads-platform-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overview.by_platform.map((p) => ({ ...p, name: platformLabel(p.platform) }))}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
                  <Tooltip formatter={(v) => formatINR(v)} cursor={{ fill: "#FFF7ED" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="spend" name="Spend" fill="#CBD5E1" radius={[5, 5, 0, 0]} maxBarSize={30} />
                  <Bar dataKey="revenue" name="Revenue" fill="#F26B21" radius={[5, 5, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="border-gray-200/80 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700">Top campaigns by ROAS</CardTitle></CardHeader>
            <CardContent className="space-y-1.5" data-testid="ads-roas-list">
              {overview.roas_by_campaign.slice(0, 6).map((c, i) => (
                <div key={c.name} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-sm text-gray-700 truncate">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-gray-400">{formatINR(c.spend)} spend</span>
                    <span className="font-mono text-sm font-bold text-emerald-600">{c.roas}x</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters + table */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filters.platform} onValueChange={(v) => setFilters((f) => ({ ...f, platform: v }))}>
          <SelectTrigger className="w-[160px]" data-testid="ads-platform-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All platforms</SelectItem>{AD_PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
          <SelectTrigger className="w-[140px]" data-testid="ads-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All statuses</SelectItem>{AD_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.client_id} onValueChange={(v) => setFilters((f) => ({ ...f, client_id: v }))}>
          <SelectTrigger className="w-[180px]" data-testid="ads-client-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All clients</SelectItem>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Card className="border-gray-200/80 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/70">
              <TableHead>Campaign</TableHead><TableHead>Platform</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">ROAS</TableHead>
              <TableHead className="text-right">CTR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-sm text-gray-400"><Megaphone className="h-6 w-6 mx-auto mb-2 text-gray-300" />No campaigns match these filters.</TableCell></TableRow>
            )}
            {rows.map((c) => (
              <TableRow key={c.id} className="cursor-pointer hover:bg-orange-50/40" onClick={() => navigate(`/ads/${c.id}`)} data-testid={`campaign-row-${c.id}`}>
                <TableCell>
                  <div className="font-semibold text-gray-900 text-sm">{c.name}</div>
                  <div className="text-[11px] text-gray-400">{c.client_name || "Internal"}</div>
                </TableCell>
                <TableCell className="text-sm text-gray-600">{platformLabel(c.platform)}</TableCell>
                <TableCell><AdStatusBadge status={c.status} /></TableCell>
                <TableCell className="text-right font-mono text-sm">{formatINR(c.budget)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatINR(c.metrics.spend)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatINR(c.metrics.revenue)}</TableCell>
                <TableCell className="text-right font-mono text-sm font-bold text-emerald-600">{c.metrics.roas}x</TableCell>
                <TableCell className="text-right font-mono text-sm">{c.metrics.ctr}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <CampaignFormDialog open={createOpen} onOpenChange={setCreateOpen} clients={clients} campaign={null} onSaved={load} />
    </div>
  );
}
