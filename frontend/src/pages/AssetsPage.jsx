import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import api, { formatINR, apiError } from "@/lib/api";
import ExportMenu from "@/components/ExportMenu";
import { labelize } from "@/components/Badges";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Laptop, Plus, Search, Wrench, IndianRupee, Boxes, AlertTriangle } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CHART_COLORS } from "@/components/Badges";

const TYPES = ["laptop", "computer", "phone", "sim_card", "camera", "equipment", "other"];
const STATUSES = ["available", "in_use", "maintenance", "retired"];
const statusStyles = {
  available: "bg-blue-50 text-blue-700 border-blue-200",
  in_use: "bg-emerald-50 text-emerald-700 border-emerald-200",
  maintenance: "bg-amber-50 text-amber-700 border-amber-200",
  retired: "bg-gray-100 text-gray-500 border-gray-200",
};

const StatusBadge = ({ status }) => (
  <Badge variant="outline" className={`${statusStyles[status] || ""} font-medium`} data-testid={`asset-status-${status}`}>{labelize(status)}</Badge>
);

const StatCard = ({ icon: Icon, label, value, testid }) => (
  <Card className="border-gray-200/80 shadow-sm" data-testid={testid}>
    <CardContent className="p-4 flex items-center gap-3">
      <div className="h-9 w-9 rounded-xl bg-[#FFF7ED] flex items-center justify-center shrink-0">
        <Icon style={{ height: 17, width: 17 }} className="text-[#F26B21]" />
      </div>
      <div>
        <div className="text-lg font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </CardContent>
  </Card>
);

const EMPTY_FORM = {
  name: "", asset_type: "laptop", serial_no: "", purchase_date: "", purchase_value: "",
  status: "available", branch_id: "", notes: "", next_maintenance_date: "", maintenance_interval_days: "",
};

export default function AssetsPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ asset_type: "all", status: "all", search: "" });
  const [team, setTeam] = useState([]);
  const [branches, setBranches] = useState([]);
  const [detail, setDetail] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [assign, setAssign] = useState({ assigned_to: "", assigned_location: "", note: "" });
  const [maint, setMaint] = useState({ date: "", description: "", cost: "" });
  const [busy, setBusy] = useState(false);

  const canWrite = ["super_admin", "admin"].includes(user.role);

  const load = useCallback(() => {
    const params = {};
    if (filters.asset_type !== "all") params.asset_type = filters.asset_type;
    if (filters.status !== "all") params.status = filters.status;
    if (filters.search.trim()) params.search = filters.search.trim();
    api.get("/assets", { params }).then((r) => setRows(r.data)).catch((e) => toast.error(apiError(e)));
    api.get("/assets/stats").then((r) => setStats(r.data)).catch(() => {});
  }, [filters]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => {
    api.get("/users/team").then((r) => setTeam(r.data)).catch(() => {});
    api.get("/locations/branches").then((r) => setBranches(r.data)).catch(() => {});
  }, []);

  const openDetail = async (id) => {
    try {
      const { data } = await api.get(`/assets/${id}`);
      setDetail(data);
      setAssign({ assigned_to: data.assigned_to || "", assigned_location: data.assigned_location || "", note: "" });
      setMaint({ date: new Date().toISOString().slice(0, 10), description: "", cost: "" });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const openCreate = () => { setEditId(null); setForm(EMPTY_FORM); setFormOpen(true); };
  const openEdit = (a) => {
    setEditId(a.id);
    setForm({
      name: a.name, asset_type: a.asset_type, serial_no: a.serial_no || "", purchase_date: a.purchase_date || "",
      purchase_value: a.purchase_value ?? "", status: a.status, branch_id: a.branch_id || "", notes: a.notes || "",
      next_maintenance_date: a.next_maintenance_date || "", maintenance_interval_days: a.maintenance_interval_days ?? "",
    });
    setFormOpen(true);
  };

  const saveForm = async () => {
    if (!form.name.trim()) return toast.error("Asset name is required");
    setBusy(true);
    const body = {
      ...form,
      purchase_value: Number(form.purchase_value) || 0,
      maintenance_interval_days: form.maintenance_interval_days ? Number(form.maintenance_interval_days) : null,
      purchase_date: form.purchase_date || null,
      next_maintenance_date: form.next_maintenance_date || null,
      branch_id: form.branch_id || null,
    };
    try {
      if (editId) {
        await api.put(`/assets/${editId}`, body);
        toast.success("Asset updated");
        if (detail?.id === editId) openDetail(editId);
      } else {
        await api.post("/assets", body);
        toast.success("Asset registered");
      }
      setFormOpen(false);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const doAssign = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/assets/${detail.id}/assign`, {
        assigned_to: assign.assigned_to || null,
        assigned_location: assign.assigned_location,
        note: assign.note,
      });
      setDetail((d) => ({ ...d, ...data, assigned_to_name: team.find((t) => t.id === data.assigned_to)?.name || null }));
      toast.success("Assignment updated");
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const logMaintenance = async () => {
    if (!maint.date || !maint.description.trim()) return toast.error("Date and description required");
    setBusy(true);
    try {
      const { data } = await api.post(`/assets/${detail.id}/maintenance`, { ...maint, cost: Number(maint.cost) || 0 });
      setDetail((d) => ({ ...d, ...data }));
      setMaint({ date: new Date().toISOString().slice(0, 10), description: "", cost: "" });
      toast.success("Maintenance logged");
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const retire = async () => {
    try {
      await api.delete(`/assets/${detail.id}`);
      toast.success("Asset retired");
      setDetail(null);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-6 max-w-7xl" data-testid="assets-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Assets</h1>
          <p className="text-sm text-gray-500 mt-0.5">Laptops, cameras, SIMs & studio equipment — assignments and maintenance in one register.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu dataset="assets" params={{
            ...(filters.asset_type !== "all" && { asset_type: filters.asset_type }),
            ...(filters.status !== "all" && { status: filters.status }),
          }} />
          {canWrite && (
            <Button onClick={openCreate} className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="add-asset-btn">
              <Plus className="h-4 w-4 mr-1.5" /> Register asset
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_260px] gap-4">
          <StatCard icon={Boxes} label="Total assets" value={stats.total} testid="asset-stat-total" />
          <StatCard icon={IndianRupee} label="Asset value" value={formatINR(stats.total_value)} testid="asset-stat-value" />
          <StatCard icon={Laptop} label="In use" value={stats.in_use} testid="asset-stat-inuse" />
          <StatCard icon={Wrench} label="Maintenance due ≤30d" value={stats.maintenance_due} testid="asset-stat-maint" />
          <Card className="border-gray-200/80 shadow-sm row-span-1">
            <CardContent className="p-2 h-[88px]" data-testid="asset-type-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.by_type} dataKey="value" nameKey="name" innerRadius={22} outerRadius={36} paddingAngle={2}>
                    {stats.by_type.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [`${v}`, labelize(n)]} />
                  <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" wrapperStyle={{ fontSize: 9 }} formatter={(v) => labelize(v)} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input className="pl-9 w-56" placeholder="Search name, code, serial..." value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} data-testid="asset-search-input" />
        </div>
        <Select value={filters.asset_type} onValueChange={(v) => setFilters((f) => ({ ...f, asset_type: v }))}>
          <SelectTrigger className="w-[150px]" data-testid="asset-type-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All types</SelectItem>{TYPES.map((t) => <SelectItem key={t} value={t}>{labelize(t)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
          <SelectTrigger className="w-[150px]" data-testid="asset-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All statuses</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border-gray-200/80 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/70">
              <TableHead>Code</TableHead><TableHead>Asset</TableHead><TableHead>Type</TableHead>
              <TableHead>Status</TableHead><TableHead>Assigned to</TableHead><TableHead>Branch</TableHead>
              <TableHead className="text-right">Value</TableHead><TableHead>Next maintenance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-sm text-gray-400">No assets match these filters.</TableCell></TableRow>
            )}
            {rows.map((a) => (
              <TableRow key={a.id} className="cursor-pointer hover:bg-orange-50/40" onClick={() => openDetail(a.id)} data-testid={`asset-row-${a.id}`}>
                <TableCell className="font-mono text-xs text-gray-500">{a.code}</TableCell>
                <TableCell>
                  <div className="font-semibold text-gray-900 text-sm">{a.name}</div>
                  <div className="text-[11px] text-gray-400 font-mono">{a.serial_no}</div>
                </TableCell>
                <TableCell className="text-sm text-gray-600">{labelize(a.asset_type)}</TableCell>
                <TableCell><StatusBadge status={a.status} /></TableCell>
                <TableCell className="text-sm text-gray-700">{a.assigned_to_name || a.assigned_location || <span className="text-gray-300">—</span>}</TableCell>
                <TableCell className="text-sm text-gray-500">{a.branch_name || "—"}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatINR(a.purchase_value)}</TableCell>
                <TableCell className="text-sm">
                  {a.next_maintenance_date ? (
                    <span className="flex items-center gap-1.5">
                      {a.next_maintenance_date}
                      {a.maintenance_overdue && <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-[9px] px-1">Overdue</Badge>}
                      {a.maintenance_due && !a.maintenance_overdue && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[9px] px-1">Due soon</Badge>}
                    </span>
                  ) : <span className="text-gray-300">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="asset-detail-dialog">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {detail.name} <StatusBadge status={detail.status} />
                  <span className="font-mono text-xs text-gray-400 font-normal">{detail.code}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div><div className="text-[10px] text-gray-400 uppercase">Type</div>{labelize(detail.asset_type)}</div>
                <div><div className="text-[10px] text-gray-400 uppercase">Serial</div><span className="font-mono text-xs">{detail.serial_no || "—"}</span></div>
                <div><div className="text-[10px] text-gray-400 uppercase">Value</div>{formatINR(detail.purchase_value)}</div>
                <div><div className="text-[10px] text-gray-400 uppercase">Purchased</div>{detail.purchase_date || "—"}</div>
                <div><div className="text-[10px] text-gray-400 uppercase">Branch</div>{detail.branch_name || "—"}</div>
                <div><div className="text-[10px] text-gray-400 uppercase">Next maintenance</div>{detail.next_maintenance_date || "—"}</div>
              </div>

              {canWrite && (
                <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                  <div className="text-xs font-bold uppercase tracking-widest text-[#F26B21]">Assign</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Select value={assign.assigned_to || "none"} onValueChange={(v) => setAssign((a) => ({ ...a, assigned_to: v === "none" ? "" : v }))}>
                      <SelectTrigger data-testid="asset-assign-user"><SelectValue placeholder="Assign to person" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Nobody (location / unassigned)</SelectItem>
                        {team.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Or a location (e.g. Mumbai HQ Studio)" value={assign.assigned_location}
                      onChange={(e) => setAssign((a) => ({ ...a, assigned_location: e.target.value }))} data-testid="asset-assign-location" />
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder="Note (optional)" value={assign.note} onChange={(e) => setAssign((a) => ({ ...a, note: e.target.value }))} />
                    <Button onClick={doAssign} disabled={busy} className="bg-[#F26B21] hover:bg-[#E05A10] text-white shrink-0" data-testid="asset-assign-submit">Update</Button>
                  </div>
                </div>
              )}

              {/* Assignment history */}
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Assignment history</div>
                <div className="space-y-1.5" data-testid="asset-history">
                  {(detail.assignment_history || []).length === 0 && <p className="text-sm text-gray-400">Never assigned.</p>}
                  {[...(detail.assignment_history || [])].reverse().map((h, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <span className="font-medium text-gray-700">{h.assigned_to_name || h.location || "—"}</span>
                      <span className="text-xs text-gray-400">{h.from_date} → {h.to_date || "present"}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Maintenance */}
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5" /> Maintenance log
                </div>
                <div className="space-y-1.5" data-testid="asset-maintenance-log">
                  {(detail.maintenance_log || []).length === 0 && <p className="text-sm text-gray-400">No maintenance recorded.</p>}
                  {[...(detail.maintenance_log || [])].reverse().map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm gap-3">
                      <div className="min-w-0">
                        <span className="font-medium text-gray-700">{m.description}</span>
                        <span className="text-xs text-gray-400 ml-2">by {m.logged_by}</span>
                      </div>
                      <div className="text-xs text-gray-500 shrink-0">{m.date} · {formatINR(m.cost)}</div>
                    </div>
                  ))}
                </div>
                {canWrite && (
                  <div className="mt-2 grid grid-cols-[130px_1fr_100px_auto] gap-2">
                    <Input type="date" value={maint.date} onChange={(e) => setMaint((m) => ({ ...m, date: e.target.value }))} data-testid="maint-date" />
                    <Input placeholder="What was done?" value={maint.description} onChange={(e) => setMaint((m) => ({ ...m, description: e.target.value }))} data-testid="maint-desc" />
                    <Input type="number" placeholder="Cost ₹" value={maint.cost} onChange={(e) => setMaint((m) => ({ ...m, cost: e.target.value }))} data-testid="maint-cost" />
                    <Button variant="outline" onClick={logMaintenance} disabled={busy} data-testid="maint-submit">Log</Button>
                  </div>
                )}
              </div>

              {canWrite && (
                <div className="flex justify-between pt-2 border-t border-gray-100">
                  <Button variant="outline" size="sm" onClick={() => openEdit(detail)} data-testid="asset-edit-btn">Edit details</Button>
                  {detail.status !== "retired" && (
                    <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={retire} data-testid="asset-retire-btn">
                      <AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> Retire asset
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg" data-testid="asset-form-dialog">
          <DialogHeader><DialogTitle>{editId ? "Edit asset" : "Register asset"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Name</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} data-testid="asset-form-name" /></div>
            <div>
              <Label>Type</Label>
              <Select value={form.asset_type} onValueChange={(v) => setForm((f) => ({ ...f, asset_type: v }))}>
                <SelectTrigger className="mt-1" data-testid="asset-form-type"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{labelize(t)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Serial no.</Label><Input className="mt-1" value={form.serial_no} onChange={(e) => setForm((f) => ({ ...f, serial_no: e.target.value }))} /></div>
            <div><Label>Purchase date</Label><Input type="date" className="mt-1" value={form.purchase_date} onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value }))} /></div>
            <div><Label>Value (₹)</Label><Input type="number" className="mt-1" value={form.purchase_value} onChange={(e) => setForm((f) => ({ ...f, purchase_value: e.target.value }))} data-testid="asset-form-value" /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Branch</Label>
              <Select value={form.branch_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, branch_id: v === "none" ? "" : v }))}>
                <SelectTrigger className="mt-1" data-testid="asset-form-branch"><SelectValue placeholder="Branch" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No branch</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Next maintenance</Label><Input type="date" className="mt-1" value={form.next_maintenance_date} onChange={(e) => setForm((f) => ({ ...f, next_maintenance_date: e.target.value }))} /></div>
            <div><Label>Maintenance interval (days)</Label><Input type="number" className="mt-1" value={form.maintenance_interval_days} onChange={(e) => setForm((f) => ({ ...f, maintenance_interval_days: e.target.value }))} /></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea rows={2} className="mt-1" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <Button onClick={saveForm} disabled={busy} className="w-full bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="asset-form-submit">
            {busy ? "Saving..." : editId ? "Save changes" : "Register asset"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
