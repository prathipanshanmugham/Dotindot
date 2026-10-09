import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import api, { apiError, formatINR } from "@/lib/api";
import { labelize, ROLE_LABELS } from "@/components/Badges";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar, RecordDeleteDialog } from "@/components/RecordDelete";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, ExternalLink, Pencil, PlayCircle, ShieldAlert, Trash2, Star } from "lucide-react";
import {
  PLATFORM_LABELS, PlatformMark, AgentStatusBadge, initialsOf, lastUsedText, CopyButton, AgentFormDialog, LogUsageDialog,
} from "@/pages/agents/agentUi";

const Metric = ({ label, value, testid }) => (
  <Card className="border-gray-200/80"><CardContent className="p-4">
    <div className="text-xl font-bold font-mono text-gray-900" data-testid={testid}>{value}</div>
    <div className="text-xs text-gray-500">{label}</div>
  </CardContent></Card>
);
const outcomeStyle = { success: "text-emerald-600", partial: "text-amber-600", failed: "text-red-500" };
const outcomeLabel = { success: "Worked", partial: "Needed edits", failed: "Didn't help" };

export default function AgentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  const [a, setA] = useState(null);
  const [meta, setMeta] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  const load = useCallback(() => {
    api.get(`/agents/${id}`).then((r) => setA(r.data)).catch((e) => { toast.error(apiError(e)); navigate("/agents"); });
  }, [id, navigate]);
  useEffect(() => { load(); api.get("/agents/meta").then((r) => setMeta(r.data)).catch(() => {}); }, [load]);

  const delUsage = useRecordDelete({ coll: "ai_agent_usage", permKey: "ai_agents.delete", rows: a?.usage || [], onDeleted: load, labelOf: (r) => r.task });
  if (!a)
    return <div className="h-64 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  const removePrompt = async (pid) => {
    try { await api.delete(`/records/ai_agents/${a.id}/items/prompts/${pid}`); toast.success("Prompt removed"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };
  const s = a.stats;

  return (
    <div className="space-y-6 max-w-6xl" data-testid="agent-detail-page">
      <button onClick={() => navigate("/agents")} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#F26B21]" data-testid="back-to-agents">
        <ArrowLeft className="h-4 w-4" /> Back to AI agents
      </button>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <PlatformMark platform={a.platform} size="h-12 w-12 text-base" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900" data-testid="agent-name-heading">{a.name}</h1>
              <AgentStatusBadge status={a.status} />
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{PLATFORM_LABELS[a.platform] || labelize(a.platform)} · {labelize(a.agent_type)} · {lastUsedText(s.last_used_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" onClick={() => setLogOpen(true)} data-testid="agent-detail-log"><PlayCircle className="h-4 w-4 mr-1.5" /> Log a run</Button>
          {a.access_url && (
            <Button variant="outline" asChild><a href={a.access_url} target="_blank" rel="noreferrer" data-testid="agent-open-tool"><ExternalLink className="h-4 w-4 mr-1.5" /> Open tool</a></Button>
          )}
          {a.can_edit && <Button variant="outline" onClick={() => setEditOpen(true)} data-testid="agent-detail-edit"><Pencil className="h-4 w-4 mr-1.5" /> Edit & assign</Button>}
          {hasPerm("ai_agents.delete") && (
            <Button variant="outline" size="icon" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setDelOpen(true)} aria-label="Delete agent" data-testid="agent-detail-delete"><Trash2 className="h-4 w-4" /></Button>
          )}
        </div>
      </div>

      {a.purpose && <p className="text-sm text-gray-600 max-w-3xl">{a.purpose}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Metric label="Runs (30 days)" value={s.runs_30d} testid="agent-metric-runs" />
        <Metric label="Hours saved (30 days)" value={`${s.hours_saved_30d}h`} testid="agent-metric-hours" />
        <Metric label="Worked first time" value={s.success_rate_30d == null ? "—" : `${s.success_rate_30d}%`} />
        <Metric label="Average rating" value={s.avg_rating_30d == null ? "—" : `${s.avg_rating_30d} / 5`} />
        <Metric label="Cost per hour saved" value={a.cost_per_hour_saved ? formatINR(a.cost_per_hour_saved) : "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-gray-200/80">
            <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">How to use it well</CardTitle></CardHeader>
            <CardContent>
              {a.playbook ? <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed" data-testid="agent-playbook">{a.playbook}</p>
                : <p className="text-sm text-gray-400">No playbook yet.{a.can_edit ? " Add one with Edit & assign → Playbook." : ""}</p>}
              {a.guardrails && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2" data-testid="agent-guardrails">
                  <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" /><div><div className="font-semibold text-xs uppercase tracking-wide mb-0.5">Guardrails</div><p className="whitespace-pre-line">{a.guardrails}</p></div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="border-gray-200/80">
            <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Saved prompts</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(a.prompts || []).length === 0 && <p className="text-sm text-gray-400">No saved prompts.</p>}
              {(a.prompts || []).map((p) => (
                <div key={p.id} className="rounded-lg border border-gray-200 p-3 space-y-2" data-testid={`agent-prompt-${p.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="text-sm font-semibold text-gray-900">{p.title}</div>{p.when_to_use && <div className="text-xs text-gray-500">{p.when_to_use}</div>}</div>
                    <div className="flex items-center gap-1 shrink-0">
                      <CopyButton text={p.prompt} testid={`agent-prompt-copy-${p.id}`} />
                      {hasPerm("ai_agents.delete") && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-600" onClick={() => removePrompt(p.id)} aria-label="Delete prompt" data-testid={`agent-prompt-delete-${p.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                      )}
                    </div>
                  </div>
                  <pre className="whitespace-pre-wrap break-words text-xs text-gray-700 bg-gray-50 rounded-md p-2.5 font-mono">{p.prompt}</pre>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-gray-200/80">
            <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Assigned to</CardTitle></CardHeader>
            <CardContent className="space-y-2" data-testid="agent-assignees">
              {a.open_to_all && <p className="text-sm text-gray-700 font-medium">Everyone in the team</p>}
              {!a.open_to_all && a.assignees.length === 0 && <p className="text-sm text-gray-400">Nobody yet.</p>}
              {a.assignees.map((p) => (
                <Link key={p.id} to={`/employees/${p.id}`} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 hover:border-orange-200">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#FE7A18] to-[#FFAD42] text-white text-xs font-bold flex items-center justify-center">{initialsOf(p.name)}</div>
                  <div className="min-w-0"><div className="text-sm font-medium text-gray-800 truncate">{p.name}</div><div className="text-[11px] text-gray-400">{ROLE_LABELS[p.role] || labelize(p.role)}</div></div>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card className="border-gray-200/80">
            <CardContent className="p-4 space-y-3 text-sm">
              <div className="flex justify-between gap-2"><span className="text-gray-500">Owner</span><span className="font-medium text-gray-800 text-right">{a.owner_name || "—"}</span></div>
              <div className="flex justify-between gap-2"><span className="text-gray-500">Monthly cost</span><span className="font-mono font-semibold">{formatINR(a.monthly_cost)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-gray-500">Typical time saved</span><span className="font-medium">{a.minutes_saved_per_run || 0} min / run</span></div>
              <div>
                <div className="text-gray-500 mb-1">Clients</div>
                <div className="flex flex-wrap gap-1.5">{a.clients.length ? a.clients.map((c) => <Link key={c.id} to={`/clients/${c.id}`} className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs hover:border-orange-300">{c.name}</Link>) : <span className="text-xs text-gray-400">Any client</span>}</div>
              </div>
              <div>
                <div className="text-gray-500 mb-1">Projects</div>
                <div className="flex flex-wrap gap-1.5">{a.projects.length ? a.projects.map((p) => <Link key={p.id} to={`/projects/${p.id}`} className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs hover:border-orange-300">{p.name}</Link>) : <span className="text-xs text-gray-400">Any project</span>}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-gray-200/80 overflow-hidden">
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-semibold">Run history</CardTitle>
          <div>{delUsage.dialog}<BulkDeleteBar kit={delUsage} /></div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="bg-gray-50/70">
              {delUsage.canDelete && <TableHead className="w-20" />}
              <TableHead>Date</TableHead><TableHead>Who</TableHead><TableHead>Task</TableHead><TableHead className="text-right">Saved</TableHead><TableHead>Result</TableHead><TableHead>Rating</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {a.usage.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-sm text-gray-400 py-8">No runs logged yet. Log the first one so the team can see what it's good for.</TableCell></TableRow>}
              {a.usage.map((u) => (
                <TableRow key={u.id} data-testid={`agent-usage-row-${u.id}`}>
                  {delUsage.canDelete && <TableCell className="w-20"><RowDeleteControls kit={delUsage} row={u} /></TableCell>}
                  <TableCell className="text-xs text-gray-500 whitespace-nowrap">{u.date}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{u.user_name}</TableCell>
                  <TableCell className="text-sm text-gray-600 min-w-[200px]">{u.task}{(u.client_name || u.project_name) && <span className="text-gray-400"> · {u.client_name || u.project_name}</span>}{u.note && <div className="text-xs text-gray-400 italic">{u.note}</div>}</TableCell>
                  <TableCell className="text-right font-mono text-sm whitespace-nowrap">{Math.round(u.minutes_saved)} min</TableCell>
                  <TableCell className={`text-xs font-medium whitespace-nowrap ${outcomeStyle[u.outcome] || ""}`}>{outcomeLabel[u.outcome] || u.outcome}</TableCell>
                  <TableCell className="whitespace-nowrap">{u.rating ? <span className="inline-flex items-center gap-0.5 text-xs text-gray-600"><Star className="h-3.5 w-3.5 fill-[#FFAD42] text-[#FFAD42]" />{u.rating}</span> : <span className="text-xs text-gray-300">—</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AgentFormDialog open={editOpen} onOpenChange={setEditOpen} agent={a} meta={meta} onSaved={load} />
      <LogUsageDialog open={logOpen} onOpenChange={setLogOpen} agent={a} onSaved={load} />
      {delOpen && <RecordDeleteDialog coll="ai_agents" target={a} labelOf={(x) => x.name} onClose={() => setDelOpen(false)} onDeleted={() => navigate("/agents")} />}
    </div>
  );
}
