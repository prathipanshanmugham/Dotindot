import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatINR } from "@/lib/api";
import { ProjectStatusBadge, labelize, PROJECT_STATUSES } from "@/components/Badges";
import ExportMenu from "@/components/ExportMenu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Plus } from "lucide-react";
import { BranchFilter } from "@/components/BranchFilter";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function ProjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [team, setTeam] = useState([]);
  const [filters, setFilters] = useState({ status: "all", client_id: "all", team_member: "all" });
  const [loading, setLoading] = useState(true);

  const isEmployee = user.role === "employee";
  const canCreate = ["super_admin", "admin", "pm", "sales"].includes(user.role);

  useEffect(() => {
    if (!isEmployee) {
      api.get("/clients").then((r) => setClients(r.data)).catch(() => {});
      api.get("/users/team").then((r) => setTeam(r.data)).catch(() => {});
    }
  }, [isEmployee]);

  const load = useCallback(async () => {
    const params = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v && v !== "all") params[k] = v;
    });
    const { data } = await api.get("/projects", { params });
    setProjects(data);
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const byStatus = useMemo(() => {
    const m = {};
    projects.forEach((p) => (m[p.status] = (m[p.status] || 0) + 1));
    return PROJECT_STATUSES.filter((s) => m[s]).map((s) => ({ name: labelize(s), value: m[s] }));
  }, [projects]);

  const totalBudget = useMemo(() => projects.reduce((s, p) => s + (p.budget || 0), 0), [projects]);

  const progressOf = (p) => {
    const items = p.deliverables || [];
    if (!items.length) return 0;
    return Math.round((items.filter((d) => d.done).length / items.length) * 100);
  };

  return (
    <div className="space-y-6 max-w-7xl" data-testid="projects-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">{isEmployee ? "My Projects" : "Projects"}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{projects.length} projects · {formatINR(totalBudget)} total budget</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            dataset="projects"
            params={Object.fromEntries(Object.entries(filters).filter(([, v]) => v && v !== "all"))}
          />
          {canCreate && (
            <Button onClick={() => navigate("/projects/new")} data-testid="new-project-btn" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
              <Plus className="h-4 w-4 mr-1.5" /> New Project
            </Button>
          )}
        </div>
      </div>

      {/* Status summary chart */}
      <Card className="border-gray-200/80 shadow-sm">
        <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">Status summary</CardTitle></CardHeader>
        <CardContent className="h-44" data-testid="projects-status-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byStatus} layout="vertical">
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} width={90} />
              <Tooltip cursor={{ fill: "#FFF7ED" }} />
              <Bar dataKey="value" fill="#F26B21" radius={[0, 6, 6, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="border-gray-200/80 shadow-sm">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Select value={filters.status} onValueChange={(v) => setFilters((p) => ({ ...p, status: v }))}>
            <SelectTrigger className="w-[160px]" data-testid="filter-project-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
            </SelectContent>
          </Select>
          {!isEmployee && (
            <>
              <Select value={filters.client_id} onValueChange={(v) => setFilters((p) => ({ ...p, client_id: v }))}>
                <SelectTrigger className="w-[190px]" data-testid="filter-project-client"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.team_member} onValueChange={(v) => setFilters((p) => ({ ...p, team_member: v }))}>
                <SelectTrigger className="w-[190px]" data-testid="filter-project-team"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Team Members</SelectItem>
                  {team.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <BranchFilter value={filters.branch} onChange={(v) => setFilters((p) => ({ ...p, branch: v }))} testid="filter-project-branch" />
            </>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-gray-200/80 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/70">
              <TableHead>Project</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Timeline</TableHead>
              <TableHead className="w-40">Deliverables</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-sm text-gray-400">Loading projects...</TableCell></TableRow>
            ) : projects.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-sm text-gray-400">No projects match these filters.</TableCell></TableRow>
            ) : (
              projects.map((p) => (
                <TableRow key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="cursor-pointer hover:bg-orange-50/40" data-testid={`project-row-${p.id}`}>
                  <TableCell>
                    <div className="font-semibold text-gray-900">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.location}</div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{p.client_name}</TableCell>
                  <TableCell><ProjectStatusBadge status={p.status} /></TableCell>
                  <TableCell className="font-mono text-sm">{formatINR(p.budget)}</TableCell>
                  <TableCell className="text-sm text-gray-500">{p.start_date} → {p.end_date}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={progressOf(p)} className="h-1.5" />
                      <span className="text-xs text-gray-500 w-9">{progressOf(p)}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
