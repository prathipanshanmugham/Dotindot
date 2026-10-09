import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar } from "@/components/RecordDelete";
import api from "@/lib/api";
import {
  ClientStatusBadge, HealthBadge, labelize, CHART_COLORS,
  CLIENT_STATUSES, INDUSTRIES, SERVICE_TYPES, SIZES,
} from "@/components/Badges";
import ClientFormDialog from "@/components/ClientFormDialog";
import ExportMenu from "@/components/ExportMenu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, MapPin } from "lucide-react";
import { BranchFilter } from "@/components/BranchFilter";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const FILTERS = [
  { key: "status", label: "Status", options: CLIENT_STATUSES },
  { key: "industry", label: "Industry", options: INDUSTRIES },
  { key: "service_type", label: "Service", options: SERVICE_TYPES },
  { key: "size", label: "Size", options: SIZES },
  { key: "retainer", label: "Engagement", options: ["retainer", "one-off"] },
];

export default function ClientsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const canWrite = ["super_admin", "admin", "pm", "sales"].includes(user.role);

  const load = useCallback(async () => {
    const params = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (!v || v === "all") return;
      if (k === "retainer") params.retainer = v === "retainer";
      else params[k] = v;
    });
    if (search.trim()) params.search = search.trim();
    const { data } = await api.get("/clients", { params });
    setClients(data);
    setLoading(false);
  }, [filters, search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const byStatus = useMemo(() => {
    const m = {};
    clients.forEach((c) => (m[c.status] = (m[c.status] || 0) + 1));
    return Object.entries(m).map(([name, value]) => ({ name: labelize(name), value }));
  }, [clients]);

  const byIndustry = useMemo(() => {
    const m = {};
    clients.forEach((c) => (m[c.industry || "other"] = (m[c.industry || "other"] || 0) + 1));
    return Object.entries(m).map(([name, value]) => ({ name: labelize(name), value }));
  }, [clients]);

  const exportParams = {};
  Object.entries(filters).forEach(([k, v]) => {
    if (!v || v === "all") return;
    if (k === "retainer") exportParams.retainer = v === "retainer";
    else exportParams[k] = v;
  });
  if (search.trim()) exportParams.search = search.trim();

  const del = useRecordDelete({ coll: "clients", permKey: "clients.delete", rows: clients, onDeleted: () => load() });
  return (
    <div className="space-y-6 max-w-7xl" data-testid="clients-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">{clients.length} clients in view</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu dataset="clients" params={exportParams} />
          {canWrite && (
            <Button onClick={() => setFormOpen(true)} data-testid="add-client-btn" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
              <Plus className="h-4 w-4 mr-1.5" /> Add Client
            </Button>
          )}
        </div>
      </div>

      {/* Chart-first header */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-gray-200/80 shadow-sm">
          <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">Clients by status</CardTitle></CardHeader>
          <CardContent className="h-52" data-testid="clients-status-donut">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byStatus} dataKey="value" nameKey="name" innerRadius={45} outerRadius={72} paddingAngle={3}>
                  {byStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-gray-200/80 shadow-sm">
          <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">Clients by industry</CardTitle></CardHeader>
          <CardContent className="h-52" data-testid="clients-industry-bar">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byIndustry}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} width={24} />
                <Tooltip cursor={{ fill: "#FFF7ED" }} />
                <Bar dataKey="value" fill="#FFAD42" radius={[6, 6, 0, 0]} maxBarSize={42} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-gray-200/80 shadow-sm">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input data-testid="client-search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or company..." className="pl-9" />
          </div>
          {FILTERS.map((f) => (
            <Select key={f.key} value={filters[f.key] || "all"} onValueChange={(v) => setFilters((p) => ({ ...p, [f.key]: v }))}>
              <SelectTrigger className="w-[140px]" data-testid={`filter-${f.key}`}>
                <SelectValue placeholder={f.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {f.label}</SelectItem>
                {f.options.map((o) => (
                  <SelectItem key={o} value={o}>{labelize(o)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
          <BranchFilter value={filters.branch} onChange={(v) => setFilters((p) => ({ ...p, branch: v }))} testid="filter-branch" />
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-gray-200/80 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/70">{del.canDelete && <TableHead className="w-20"><BulkDeleteBar kit={del} />{del.dialog}</TableHead>}
              <TableHead>Client</TableHead>
              <TableHead className="hidden md:table-cell">Industry</TableHead>
              <TableHead className="hidden md:table-cell">Service</TableHead>
              <TableHead className="hidden md:table-cell">Size</TableHead>
              <TableHead className="hidden md:table-cell">Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Projects</TableHead>
              <TableHead>Health</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-sm text-gray-400">Loading clients...</TableCell></TableRow>
            ) : clients.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-sm text-gray-400">No clients match these filters.</TableCell></TableRow>
            ) : (
              clients.map((c) => (
                <TableRow key={c.id} onClick={() => navigate(`/clients/${c.id}`)} className="cursor-pointer hover:bg-orange-50/40" data-testid={`client-row-${c.id}`}>{del.canDelete && <TableCell className="w-20"><RowDeleteControls kit={del} row={c} /></TableCell>}
                  <TableCell>
                    <div className="font-semibold text-gray-900">{c.name}</div>
                    <div className="text-xs text-gray-400">{c.company}</div>
                    <div className="md:hidden text-[11px] text-gray-400">{labelize(c.industry)} · {c.city}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-gray-600">{labelize(c.industry)}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-gray-600">{labelize(c.service_type)}{c.retainer ? " · Retainer" : ""}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-gray-600">{labelize(c.size)}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-gray-600">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-gray-400" />{c.city}{c.region ? `, ${c.region}` : ""}</span>
                  </TableCell>
                  <TableCell><ClientStatusBadge status={c.status} /></TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-gray-700 font-medium">{c.project_count} <span className="text-gray-400 text-xs">({c.active_projects} active)</span></TableCell>
                  <TableCell><HealthBadge health={c.health} /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={load} />
    </div>
  );
}
