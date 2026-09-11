import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatINR, apiError } from "@/lib/api";
import { ProjectStatusBadge, labelize, PROJECT_STATUSES } from "@/components/Badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Trash2, MapPin, CalendarDays, IndianRupee, CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [project, setProject] = useState(null);
  const [profit, setProfit] = useState(null);

  const canWrite = ["super_admin", "admin", "pm", "sales"].includes(user.role);
  const canDelete = ["super_admin", "admin", "pm"].includes(user.role);
  const isAssigned = project?.team_member_ids?.includes(user.id);
  const canToggle = canWrite || isAssigned;

  const load = useCallback(() => {
    api.get(`/projects/${id}`).then((r) => setProject(r.data)).catch((e) => toast.error(apiError(e)));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (["super_admin", "admin", "finance", "pm"].includes(user.role)) {
      api.get(`/finance/project-profit/${id}`).then((r) => setProfit(r.data)).catch(() => {});
    }
  }, [id, user.role]);

  if (!project)
    return <div className="h-64 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  const deliverables = project.deliverables || [];
  const doneCount = deliverables.filter((d) => d.done).length;
  const progress = deliverables.length ? Math.round((doneCount / deliverables.length) * 100) : 0;

  const toggle = async (kind, itemId) => {
    if (!canToggle) return;
    try {
      const { data } = await api.patch(`/projects/${id}/toggle`, { kind, item_id: itemId });
      setProject((p) => ({ ...p, ...(data.milestones ? { milestones: data.milestones } : {}), ...(data.deliverables ? { deliverables: data.deliverables } : {}) }));
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const updateStatus = async (status) => {
    try {
      await api.put(`/projects/${id}`, { status });
      setProject((p) => ({ ...p, status }));
      toast.success(`Status → ${labelize(status)}`);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const deleteProject = async () => {
    try {
      await api.delete(`/projects/${id}`);
      toast.success("Project deleted");
      navigate("/projects");
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-6 max-w-6xl" data-testid="project-detail-page">
      <button onClick={() => navigate("/projects")} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#F26B21] transition-colors" data-testid="back-to-projects">
        <ArrowLeft className="h-4 w-4" /> Back to projects
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900" data-testid="project-name-heading">{project.name}</h1>
            <ProjectStatusBadge status={project.status} />
          </div>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
            {user.role !== "employee" ? (
              <Link to={`/clients/${project.client_id}`} className="text-[#F26B21] font-medium hover:underline" data-testid="project-client-link">
                {project.client_name}
              </Link>
            ) : (
              <span className="font-medium">{project.client_name}</span>
            )}
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{project.location || "—"}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
            <Select value={project.status} onValueChange={updateStatus}>
              <SelectTrigger className="w-[150px]" data-testid="project-status-select"><SelectValue /></SelectTrigger>
              <SelectContent>{PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" data-testid="delete-project-btn">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
                  <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteProject} className="bg-red-600 hover:bg-red-700" data-testid="confirm-delete-project">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {project.description && <p className="text-sm text-gray-600 max-w-3xl">{project.description}</p>}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-gray-200/80"><CardContent className="p-5 flex items-center gap-3">
          <IndianRupee className="h-5 w-5 text-[#F26B21]" />
          <div><div className="text-xl font-bold font-mono" data-testid="project-budget">{formatINR(project.budget)}</div><div className="text-xs text-gray-500">Budget (INR)</div></div>
        </CardContent></Card>
        <Card className="border-gray-200/80"><CardContent className="p-5 flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-[#F26B21]" />
          <div><div className="text-sm font-semibold">{project.start_date || "—"} → {project.end_date || "—"}</div><div className="text-xs text-gray-500">Timeline</div></div>
        </CardContent></Card>
        <Card className="border-gray-200/80"><CardContent className="p-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500">Deliverables progress</span>
            <span className="text-xs font-semibold text-gray-700">{doneCount}/{deliverables.length}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Milestones timeline */}
        <Card className="border-gray-200/80 lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Milestones</CardTitle></CardHeader>
          <CardContent>
            {(project.milestones || []).length === 0 && <p className="text-sm text-gray-400">No milestones defined.</p>}
            <div className="relative">
              {(project.milestones || []).map((m, i, arr) => (
                <div key={m.id} className="flex gap-3 pb-5 last:pb-0 relative" data-testid={`milestone-${m.id}`}>
                  {i < arr.length - 1 && <div className="absolute left-[9px] top-6 bottom-0 w-px bg-gray-200" />}
                  <button onClick={() => toggle("milestone", m.id)} disabled={!canToggle} className="shrink-0 mt-0.5" data-testid={`milestone-toggle-${m.id}`}>
                    {m.done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-gray-300" />}
                  </button>
                  <div>
                    <div className={`text-sm font-medium ${m.done ? "text-gray-400 line-through" : "text-gray-800"}`}>{m.title}</div>
                    <div className="text-xs text-gray-400">Due {m.due_date || "—"}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Deliverables */}
        <Card className="border-gray-200/80 lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Deliverables</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {deliverables.length === 0 && <p className="text-sm text-gray-400">No deliverables defined.</p>}
            {deliverables.map((d) => (
              <label key={d.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${canToggle ? "cursor-pointer hover:border-orange-200" : ""} ${d.done ? "bg-gray-50 border-gray-100" : "border-gray-200"}`} data-testid={`deliverable-row-${d.id}`}>
                <Checkbox checked={d.done} disabled={!canToggle} onCheckedChange={() => toggle("deliverable", d.id)} data-testid={`deliverable-checkbox-${d.id}`} />
                <span className={`text-sm ${d.done ? "text-gray-400 line-through" : "text-gray-800"}`}>{d.item}</span>
              </label>
            ))}
          </CardContent>
        </Card>

        {/* Team */}
        <Card className="border-gray-200/80 lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Team</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(project.team || []).length === 0 && <p className="text-sm text-gray-400">No team assigned.</p>}
            {(project.team || []).map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5" data-testid={`team-member-${u.id}`}>
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#F26B21] to-[#FBA834] text-white text-xs font-bold flex items-center justify-center">
                  {u.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-800">{u.name}</div>
                  <div className="text-[11px] text-gray-400 uppercase tracking-wide">{u.role}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      {/* Profit (finance/admin/assigned pm) */}
      {profit && (
        <Card className="border-gray-200/80" data-testid="project-profit-section">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Profit & loss</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
              <div><div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Revenue billed</div><span className="font-mono font-semibold text-emerald-600">{formatINR(profit.revenue)}</span></div>
              <div><div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Linked expenses</div><span className="font-mono font-semibold text-red-500">{formatINR(profit.linked_expenses)}</span></div>
              <div><div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Cost allocation</div><span className="font-mono font-semibold text-gray-600">{formatINR(profit.cost_allocation)}</span></div>
              <div><div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Net</div><span className={`font-mono font-bold ${profit.net >= 0 ? "text-gray-900" : "text-red-600"}`} data-testid="project-profit-net">{formatINR(profit.net)}</span></div>
              <div><div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Margin</div><span className={`font-mono font-semibold ${profit.margin_pct === null ? "text-gray-300" : profit.margin_pct >= 0 ? "text-emerald-600" : "text-red-500"}`}>{profit.margin_pct === null ? "—" : `${profit.margin_pct}%`}</span></div>
            </div>
            {profit.transactions?.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Recent linked transactions</div>
                {profit.transactions.slice(0, 5).map((x) => (
                  <div key={x.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm">
                    <span className="text-gray-600 truncate mr-3">{x.date} · {x.description}</span>
                    <span className={`font-mono font-semibold shrink-0 ${x.type === "income" ? "text-emerald-600" : "text-red-500"}`}>
                      {x.type === "income" ? "+" : "−"}{formatINR(x.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
