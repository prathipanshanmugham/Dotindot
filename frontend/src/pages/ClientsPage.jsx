import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar } from "@/components/RecordDelete";
import api from "@/lib/api";
import { ClientStatusBadge, HealthBadge, labelize, CLIENT_STATUSES, INDUSTRIES, SIZES } from "@/components/Badges";
import ClientFormDialog from "@/components/ClientFormDialog";
import ExportMenu from "@/components/ExportMenu";
import { Stat, FilterBar } from "@/components/kit";
import { rupees } from "@/lib/revenue";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, MapPin, Building2, Repeat, Phone } from "lucide-react";
import { BranchFilter } from "@/components/BranchFilter";

const FILTERS = [
  { key: "status", label: "Status", options: CLIENT_STATUSES },
  { key: "billing", label: "Billing", options: ["recurring", "one_time"], labels: { recurring: "Recurring (retainer)", one_time: "One-time only" } },
  { key: "industry", label: "Industry", options: INDUSTRIES },
  { key: "size", label: "Size", options: SIZES },
];

export default function ClientsPage() {
  const { user, hasPerm } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const canWrite = ["super_admin", "admin", "pm", "sales"].includes(user.role);
  const params = useMemo(() => {
    const p = {};
    Object.entries(filters).forEach(([k, v]) => { if (v && v !== "all") p[k] = v; });
    if (search.trim()) p.search = search.trim();
    return p;
  }, [filters, search]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/clients", { params });
      setClients(data);
    } catch { setClients([]); }
    setLoading(false);
  }, [params]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const kpi = useMemo(() => {
    const mrr = clients.reduce((a, c) => a + (c.mrr || 0), 0);
    return { active: clients.filter((c) => c.status === "active").length, recurring: clients.filter((c) => c.recurring).length, mrr };
  }, [clients]);

  const del = useRecordDelete({ coll: "clients", permKey: "clients.delete", rows: clients, onDeleted: () => load() });
  return (
    <div className="space-y-5 max-w-7xl" data-testid="clients-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">{clients.length} compan{clients.length === 1 ? "y" : "ies"} in view</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu dataset="clients" params={params} />
          {canWrite && (
            <Button onClick={() => setFormOpen(true)} data-testid="add-client-btn" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
              <Plus className="h-4 w-4 mr-1.5" /> Add client
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="clients-kpis">
        <Stat icon={Building2} label="Active clients" value={kpi.active} tone="gray" />
        <Stat icon={Repeat} label="On a retainer" sub="recurring projects" value={kpi.recurring} tone="blue" />
        <Stat icon={Repeat} label="MRR" value={rupees(kpi.mrr)} testid="clients-mrr" />
        <Stat icon={Repeat} label="ARR" value={rupees(kpi.mrr * 12)} tone="green" />
      </div>
      {hasPerm("finance.revenue") && <Link to="/finance/revenue" className="inline-block text-xs font-semibold text-[#F26B21] -mt-2">See MRR & ARR in detail →</Link>}

      <Card className="border-gray-200/80 shadow-sm">
        <CardContent className="p-3 sm:p-4">
          <FilterBar active={Object.values(filters).filter((v) => v && v !== "all").length}
            search={<><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input data-testid="client-search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, contact, phone or city…" className="pl-9" /></>}>
            {FILTERS.map((f) => (
              <Select key={f.key} value={filters[f.key] || "all"} onValueChange={(v) => setFilters((p) => ({ ...p, [f.key]: v }))}>
                <SelectTrigger className="w-[160px]" data-testid={`filter-${f.key}`}><SelectValue placeholder={f.label} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any {f.label.toLowerCase()}</SelectItem>
                  {f.options.map((o) => <SelectItem key={o} value={o}>{f.labels?.[o] || labelize(o)}</SelectItem>)}
                </SelectContent>
              </Select>
            ))}
            <BranchFilter value={filters.branch} onChange={(v) => setFilters((p) => ({ ...p, branch: v }))} testid="filter-branch" />
          </FilterBar>
        </CardContent>
      </Card>

      <Card className="border-gray-200/80 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/70">{del.canDelete && <TableHead className="w-20"><BulkDeleteBar kit={del} />{del.dialog}</TableHead>}
              <TableHead>Client</TableHead>
              <TableHead className="hidden md:table-cell">Main contact</TableHead>
              <TableHead>Billing</TableHead>
              <TableHead className="hidden md:table-cell">Projects</TableHead>
              <TableHead className="hidden lg:table-cell">Location</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="hidden sm:table-cell">Health</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-sm text-gray-400">Loading clients…</TableCell></TableRow>
            ) : clients.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-sm text-gray-400">No clients match these filters.</TableCell></TableRow>
            ) : (
              clients.map((c) => (
                <TableRow key={c.id} onClick={() => navigate(`/clients/${c.id}`)} className="cursor-pointer hover:bg-orange-50/40" data-testid={`client-row-${c.id}`}>{del.canDelete && <TableCell className="w-20"><RowDeleteControls kit={del} row={c} /></TableCell>}
                  <TableCell>
                    <div className="font-semibold text-gray-900">{c.name}</div>
                    <div className="text-xs text-gray-400">{labelize(c.industry)}</div>
                    <div className="md:hidden text-[11px] text-gray-500 mt-0.5">{[c.contact_name, c.city].filter(Boolean).join(" · ")}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {c.contact_name ? (
                      <>
                        <div className="text-sm text-gray-800">{c.contact_name}</div>
                        {c.contact_phone && <a href={`tel:${c.contact_phone.replace(/\s+/g, "")}`} onClick={(e) => e.stopPropagation()} className="text-xs text-gray-500 hover:text-[#F26B21] inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.contact_phone}</a>}
                      </>
                    ) : <span className="text-xs text-gray-300">No contact yet</span>}
                  </TableCell>
                  <TableCell>
                    {c.recurring ? (
                      <><div className="text-sm font-semibold text-gray-900 font-mono">{rupees(c.mrr)}<span className="text-xs font-sans font-normal text-gray-500"> /mo</span></div><div className="text-[11px] text-gray-500">Retainer · {rupees(c.arr)} a year</div></>
                    ) : <span className="text-xs text-gray-500">One-time{c.one_time_value ? ` · ${rupees(c.one_time_value)}` : ""}</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-gray-700 font-medium">{c.active_projects} <span className="text-gray-400 text-xs font-normal">open · {c.project_count} total</span></TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-gray-600">
                    {c.city || c.state ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-gray-400" />{[c.city, c.state].filter(Boolean).join(", ")}</span> : <span className="text-gray-300">—</span>}
                    {c.branch_name && <div className="text-[11px] text-gray-400 mt-0.5 inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{c.branch_name}</div>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell"><ClientStatusBadge status={c.status} /></TableCell>
                  <TableCell className="hidden sm:table-cell"><HealthBadge health={c.health} /></TableCell>
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
