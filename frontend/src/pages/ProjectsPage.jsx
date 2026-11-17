import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar } from "@/components/RecordDelete";
import api from "@/lib/api";
import { ProjectStatusBadge, labelize, PROJECT_STATUSES } from "@/components/Badges";
import ExportMenu from "@/components/ExportMenu";
import { Stat, FilterBar, fmtDate } from "@/components/kit";
import { SERVICE_LABEL, rupees } from "@/lib/revenue";
import { BillingCell } from "@/components/ProjectBilling";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Plus, Pencil, Search, Repeat, Receipt, FolderKanban } from "lucide-react";
import ProjectEditDialog from "@/components/ProjectEditDialog";
import { BranchFilter } from "@/components/BranchFilter";
import { InternalBadge } from "@/components/ProjectKind";

const ACTIVE = ["kickoff", "in_progress", "review"];

export default function ProjectsPage() {
  const { user, hasPerm } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [team, setTeam] = useState([]);
  const [filters, setFilters] = useState({ kind: "all", client_id: params.get("client") || "all", team_member: "all", branch: "all" });
  const [status, setStatus] = useState(params.get("status") || "open");
  const [billing, setBilling] = useState(params.get("billing") || "all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editProject, setEditProject] = useState(null);

  const isEmployee = user.role === "employee";
  const canCreate = ["super_admin", "admin", "pm", "sales"].includes(user.role);
  const canEdit = canCreate;

  useEffect(() => {
    if (!isEmployee) {
      api.get("/clients").then((r) => setClients(r.data)).catch(() => {});
      api.get("/users/team").then((r) => setTeam(r.data)).catch(() => {});
    }
  }, [isEmployee]);

  const load = useCallback(async () => {
    const q = {};
    Object.entries(filters).forEach(([k, v]) => { if (v && v !== "all") q[k] = v; });
    try {
      const { data } = await api.get("/projects", { params: q });
      setProjects(data);
    } catch { setProjects([]); }
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {   // keep the billing / status choice in the address so it can be shared
    const next = new URLSearchParams(params);
    billing !== "all" ? next.set("billing", billing) : next.delete("billing");
    status !== "open" ? next.set("status", status) : next.delete("status");
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [billing, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const m = { all: projects.length, open: 0 };
    projects.forEach((p) => { m[p.status] = (m[p.status] || 0) + 1; if (ACTIVE.includes(p.status)) m.open += 1; });
    return m;
  }, [projects]);

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return projects.filter((p) =>
      (status === "all" || (status === "open" ? ACTIVE.includes(p.status) : p.status === status)) &&
      (billing === "all" || (billing === "recurring" ? p.billing_type === "recurring" : p.billing_type !== "recurring")) &&
      (!s || p.name.toLowerCase().includes(s) || (p.client_name || "").toLowerCase().includes(s)));
  }, [projects, status, billing, search]);

  const kpi = useMemo(() => {
    const open = projects.filter((p) => ACTIVE.includes(p.status));
    return {
      open: open.length,
      mrr: projects.reduce((a, p) => a + (p.live ? p.mrr || 0 : 0), 0),
      recurring: projects.filter((p) => p.live).length,
      oneTime: open.filter((p) => p.billing_type !== "recurring" && p.kind !== "internal").reduce((a, p) => a + (p.budget || 0), 0),
      oneTimeCount: open.filter((p) => p.billing_type !== "recurring" && p.kind !== "internal").length,
    };
  }, [projects]);

  const progressOf = (p) => {
    const items = [...(p.deliverables || []), ...(p.milestones || [])];
    if (!items.length) return null;
    return Math.round((items.filter((d) => d.done).length / items.length) * 100);
  };

  const del = useRecordDelete({ coll: "projects", permKey: "projects.delete", rows: shown, onDeleted: () => load() });
  const chips = [["open", "Open"], ...PROJECT_STATUSES.map((s) => [s, labelize(s)]), ["all", "All"]];
  return (
    <div className="space-y-5 max-w-7xl" data-testid="projects-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">{isEmployee ? "My Projects" : "Projects"}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{shown.length} of {projects.length} projects</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu dataset="projects" params={{ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v && v !== "all")), ...(billing !== "all" ? { billing_type: billing } : {}) }} />
          {canCreate && (
            <Button onClick={() => navigate("/projects/new")} data-testid="new-project-btn" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
              <Plus className="h-4 w-4 mr-1.5" /> New Project
            </Button>
          )}
        </div>
      </div>

      {!isEmployee && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="projects-kpis">
          <Stat icon={FolderKanban} label="Open projects" value={kpi.open} tone="gray" />
          <Stat icon={Repeat} label="MRR from recurring" sub={`${kpi.recurring} billing`} value={rupees(kpi.mrr)} testid="projects-mrr" />
          <Stat icon={Repeat} label="ARR" value={rupees(kpi.mrr * 12)} tone="blue" />
          <Stat icon={Receipt} label="One-time work open" sub={`${kpi.oneTimeCount} projects`} value={rupees(kpi.oneTime)} tone="green" />
        </div>
      )}
      {!isEmployee && hasPerm("finance.revenue") && <Link to="/finance/revenue" className="inline-block text-xs font-semibold text-[#F26B21] -mt-2">MRR & ARR trend, renewals and this month's bills →</Link>}

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Status" data-testid="project-status-chips">
        {chips.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={status === k} onClick={() => setStatus(k)} data-testid={`project-status-${k}`}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${status === k ? "bg-[#F26B21] text-white" : "bg-gray-100 text-gray-600 hover:bg-orange-50 hover:text-[#F26B21]"}`}>
            {l} <span className={status === k ? "text-white/80" : "text-gray-400"}>{counts[k] || 0}</span>
          </button>
        ))}
      </div>

      <Card className="border-gray-200/80 shadow-sm">
        <CardContent className="p-3 sm:p-4">
          <FilterBar active={[billing !== "all", ...Object.values(filters).map((v) => v && v !== "all")].filter(Boolean).length}
            search={<><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects or clients…" className="pl-9" data-testid="project-search" /></>}>
            {!isEmployee && (
              <Select value={billing} onValueChange={setBilling}>
                <SelectTrigger className="w-[160px]" data-testid="filter-project-billing"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any billing</SelectItem>
                  <SelectItem value="recurring">Recurring</SelectItem>
                  <SelectItem value="one_time">One-time</SelectItem>
                </SelectContent>
              </Select>
            )}
            {!isEmployee && (
              <>
                <Select value={filters.kind} onValueChange={(v) => setFilters((p) => ({ ...p, kind: v, client_id: v === "internal" ? "all" : p.client_id }))}>
                  <SelectTrigger className="w-[160px]" data-testid="filter-project-kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Client & internal</SelectItem>
                    <SelectItem value="client">Client projects</SelectItem>
                    <SelectItem value="internal">Internal projects</SelectItem>
                  </SelectContent>
                </Select>
                {filters.kind !== "internal" && <Select value={filters.client_id} onValueChange={(v) => setFilters((p) => ({ ...p, client_id: v }))}>
                  <SelectTrigger className="w-[200px]" data-testid="filter-project-client"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All clients</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>}
                <Select value={filters.team_member} onValueChange={(v) => setFilters((p) => ({ ...p, team_member: v }))}>
                  <SelectTrigger className="w-[190px]" data-testid="filter-project-team"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Anyone on the team</SelectItem>
                    {team.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <BranchFilter value={filters.branch} onChange={(v) => setFilters((p) => ({ ...p, branch: v }))} testid="filter-project-branch" />
              </>
            )}
          </FilterBar>
        </CardContent>
      </Card>

      <ProjectEditDialog open={!!editProject} onOpenChange={(o) => !o && setEditProject(null)} project={editProject} onSaved={load} />

      <Card className="border-gray-200/80 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/70">{del.canDelete && <TableHead className="w-20"><BulkDeleteBar kit={del} />{del.dialog}</TableHead>}
              <TableHead>Project</TableHead>
              <TableHead className="hidden md:table-cell">Client</TableHead>
              <TableHead className="hidden md:table-cell">Billing</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Dates</TableHead>
              <TableHead className="hidden lg:table-cell w-36">Progress</TableHead>
              {canEdit && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-sm text-gray-400">Loading projects…</TableCell></TableRow>
            ) : shown.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-sm text-gray-400">No projects match. Try “All” or clear the filters.</TableCell></TableRow>
            ) : (
              shown.map((p) => {
                const pr = progressOf(p);
                return (
                  <TableRow key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="cursor-pointer hover:bg-orange-50/40" data-testid={`project-row-${p.id}`}>{del.canDelete && <TableCell className="w-20"><RowDeleteControls kit={del} row={p} /></TableCell>}
                    <TableCell>
                      <div className="font-semibold text-gray-900">{p.name}</div>
                      <div className="text-xs text-gray-400">{[SERVICE_LABEL[p.service], p.location].filter(Boolean).join(" · ")}</div>
                      <div className="md:hidden mt-1 space-y-0.5"><div className="text-xs text-gray-600">{p.kind === "internal" ? "Internal" : p.client_name}</div><BillingCell p={p} /></div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-gray-700">{p.kind === "internal" ? <InternalBadge /> : <Link to={`/clients/${p.client_id}`} onClick={(e) => e.stopPropagation()} className="hover:text-[#F26B21]">{p.client_name}</Link>}</TableCell>
                    <TableCell className="hidden md:table-cell"><BillingCell p={p} /></TableCell>
                    <TableCell><ProjectStatusBadge status={p.status} /></TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-gray-500 whitespace-nowrap">{p.start_date ? fmtDate(p.start_date) : "—"} → {p.end_date ? fmtDate(p.end_date) : p.billing_type === "recurring" ? "ongoing" : "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {pr === null ? <span className="text-xs text-gray-300">No checklist</span> : (
                        <div className="flex items-center gap-2"><Progress value={pr} className="h-1.5" /><span className="text-xs text-gray-500 w-9">{pr}%</span></div>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="w-12" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-[#F26B21]" onClick={() => setEditProject(p)} aria-label={`Edit ${p.name}`} data-testid={`edit-project-${p.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
