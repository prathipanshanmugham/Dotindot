import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatINR } from "@/lib/api";
import { labelize } from "@/components/Badges";
import ExportMenu from "@/components/ExportMenu";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar } from "@/components/RecordDelete";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bot, Plus, Search, Clock, IndianRupee, AlertTriangle, Pencil, PlayCircle, Zap, UserX, BookOpen } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  PLATFORM_LABELS, PlatformMark, AgentStatusBadge, PeopleStack, lastUsedText, CopyButton, AgentFormDialog, LogUsageDialog,
} from "@/pages/agents/agentUi";

const Stat = ({ icon: Icon, label, value, sub, warn, testid, className = "" }) => (
  <Card className={`border-gray-200/80 shadow-sm ${className}`} data-testid={testid}>
    <CardContent className="p-4 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${warn ? "bg-amber-50" : "bg-[#FFF7ED]"}`}>
        <Icon style={{ height: 18, width: 18 }} className={warn ? "text-amber-600" : "text-[#F26B21]"} />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold text-gray-900 font-mono truncate">{value}</div>
        <div className="text-xs text-gray-500">{label}{sub && <span className="text-gray-400"> · {sub}</span>}</div>
      </div>
    </CardContent>
  </Card>
);

const outcomeStyle = { success: "text-emerald-600", partial: "text-amber-600", failed: "text-red-500" };
const outcomeLabel = { success: "Worked", partial: "Needed edits", failed: "Didn't help" };

export default function AgentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [agents, setAgents] = useState(null);
  const [overview, setOverview] = useState(null);
  const [usage, setUsage] = useState([]);
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState({ search: "", platform: "all", status: "all", mine: false });
  const [tab, setTab] = useState("agents");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [logFor, setLogFor] = useState(null);
  const [promptQ, setPromptQ] = useState("");

  const load = useCallback(() => {
    api.get("/agents").then((r) => setAgents(r.data)).catch(() => setAgents([]));
    api.get("/agents/overview").then((r) => setOverview(r.data)).catch(() => {});
    api.get("/agents/usage", { params: { limit: 60 } }).then((r) => setUsage(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); api.get("/agents/meta").then((r) => setMeta(r.data)).catch(() => {}); }, [load]);

  const canManage = !!meta?.can_manage;
  const shown = useMemo(() => (agents || []).filter((a) => {
    if (filters.platform !== "all" && a.platform !== filters.platform) return false;
    if (filters.status !== "all" && a.status !== filters.status) return false;
    if (filters.mine && !(a.assignee_ids || []).includes(user.id) && a.owner_id !== user.id) return false;
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      if (!`${a.name} ${a.purpose} ${PLATFORM_LABELS[a.platform]}`.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [agents, filters, user.id]);

  const prompts = useMemo(() => (agents || []).flatMap((a) => (a.prompts || []).map((p) => ({ ...p, agent: a })))
    .filter((p) => !promptQ.trim() || `${p.title} ${p.prompt} ${p.when_to_use} ${p.agent.name}`.toLowerCase().includes(promptQ.toLowerCase())), [agents, promptQ]);

  const del = useRecordDelete({ coll: "ai_agents", permKey: "ai_agents.delete", rows: shown, onDeleted: load });
  const delUsage = useRecordDelete({ coll: "ai_agent_usage", permKey: "ai_agents.delete", rows: usage, onDeleted: load, labelOf: (r) => r.task });

  if (!agents)
    return <div className="h-64 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-7xl" data-testid="agents-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">AI Agents</h1>
          <p className="text-sm text-gray-500 mt-1">Every AI assistant and automation the team uses: who it's for, how to use it well, and the time it saves.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportMenu dataset="ai-agents" />
          {canManage && (
            <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" onClick={() => { setEditing(null); setFormOpen(true); }} data-testid="add-agent-btn">
              <Plus className="h-4 w-4 mr-2" /> Add agent
            </Button>
          )}
        </div>
      </div>

      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <Stat icon={Bot} label="Active agents" value={overview.active} sub={`${overview.total} total`} testid="agents-stat-active" />
          <Stat icon={IndianRupee} label="Monthly cost" value={formatINR(overview.monthly_cost)} testid="agents-stat-cost" />
          <Stat icon={Clock} label="Hours saved (30 days)" value={overview.hours_saved_30d} sub={`${overview.runs_30d} runs`} testid="agents-stat-hours" />
          <Stat icon={Zap} label="Cost per hour saved" value={overview.cost_per_hour_saved ? formatINR(overview.cost_per_hour_saved) : "—"} testid="agents-stat-cph" />
          <Stat icon={AlertTriangle} label={`Idle ${meta?.idle_days || 14}+ days`} value={overview.idle.length} warn={overview.idle.length > 0} testid="agents-stat-idle" className="col-span-2 lg:col-span-1" />
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white border border-gray-200 h-auto flex-wrap justify-start">
          <TabsTrigger value="agents" className="data-[state=active]:bg-[#FFF7ED] data-[state=active]:text-[#F26B21]" data-testid="agents-tab-agents">Agents</TabsTrigger>
          <TabsTrigger value="impact" className="data-[state=active]:bg-[#FFF7ED] data-[state=active]:text-[#F26B21]" data-testid="agents-tab-impact">Usage & impact</TabsTrigger>
          <TabsTrigger value="prompts" className="data-[state=active]:bg-[#FFF7ED] data-[state=active]:text-[#F26B21]" data-testid="agents-tab-prompts">Prompt library</TabsTrigger>
        </TabsList>

        {/* ---------------- Agents ---------------- */}
        <TabsContent value="agents" className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
            <div className="relative sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input className="pl-9" placeholder="Search agents…" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} data-testid="agents-search" />
            </div>
            <div className="grid grid-cols-2 sm:flex gap-2">
              <Select value={filters.platform} onValueChange={(v) => setFilters((f) => ({ ...f, platform: v }))}>
                <SelectTrigger className="sm:w-40" data-testid="agents-filter-platform"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All platforms</SelectItem>{Object.entries(PLATFORM_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
                <SelectTrigger className="sm:w-36" data-testid="agents-filter-status"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All statuses</SelectItem>{(meta?.statuses || []).map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button variant={filters.mine ? "default" : "outline"} size="sm" className={`h-9 ${filters.mine ? "bg-[#F26B21] hover:bg-[#d95b16] text-white" : ""}`}
              onClick={() => setFilters((f) => ({ ...f, mine: !f.mine }))} data-testid="agents-filter-mine">
              Assigned to me
            </Button>
            <div className="sm:ml-auto">{del.dialog}<BulkDeleteBar kit={del} /></div>
          </div>

          {shown.length === 0 ? (
            <Card className="border-dashed border-gray-300"><CardContent className="py-14 text-center space-y-2">
              <Bot className="h-8 w-8 text-gray-300 mx-auto" />
              <p className="text-sm text-gray-500">{agents.length ? "No agents match these filters." : "No AI agents yet."}</p>
              {!agents.length && canManage && <p className="text-xs text-gray-400">Add the tools your team already uses: ChatGPT, Claude, n8n flows and so on.</p>}
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {shown.map((a) => (
                <Card key={a.id} className="border-gray-200/80 shadow-sm flex flex-col" data-testid={`agent-card-${a.id}`}>
                  <CardContent className="p-4 sm:p-5 flex-1 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <PlatformMark platform={a.platform} />
                      <div className="min-w-0 flex-1">
                        <Link to={`/agents/${a.id}`} className="font-semibold text-gray-900 hover:text-[#F26B21] block truncate" data-testid={`agent-link-${a.id}`}>{a.name}</Link>
                        <div className="text-xs text-gray-500 truncate">{PLATFORM_LABELS[a.platform] || labelize(a.platform)} · {labelize(a.agent_type)}</div>
                      </div>
                      <div className="shrink-0"><AgentStatusBadge status={a.status} /></div>
                    </div>
                    {a.purpose && <p className="text-sm text-gray-600 line-clamp-2">{a.purpose}</p>}
                    <div className="flex items-center justify-between gap-2">
                      <PeopleStack people={a.assignees} openToAll={a.open_to_all} />
                      {a.idle ? (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]" data-testid={`agent-idle-${a.id}`}>
                          {a.idle_days == null ? "Never used" : `Idle ${a.idle_days}d`}
                        </Badge>
                      ) : <span className="text-[11px] text-gray-400">{lastUsedText(a.stats.last_used_at)}</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-2 rounded-lg bg-gray-50 px-3 py-2 text-center">
                      <div><div className="text-sm font-bold font-mono text-gray-900">{a.stats.runs_30d}</div><div className="text-[10px] text-gray-500">runs / 30d</div></div>
                      <div><div className="text-sm font-bold font-mono text-gray-900">{a.stats.hours_saved_30d}h</div><div className="text-[10px] text-gray-500">saved</div></div>
                      <div><div className="text-sm font-bold font-mono text-gray-900">{formatINR(a.monthly_cost)}</div><div className="text-[10px] text-gray-500">/ month</div></div>
                    </div>
                    <div className="mt-auto flex items-center gap-2 pt-1">
                      <Button size="sm" className="bg-[#F26B21] hover:bg-[#d95b16] text-white h-9 flex-1" onClick={() => setLogFor(a)} data-testid={`agent-log-${a.id}`}>
                        <PlayCircle className="h-4 w-4 mr-1.5" /> Log a run
                      </Button>
                      <Button size="sm" variant="outline" className="h-9 flex-1" onClick={() => navigate(`/agents/${a.id}`)} data-testid={`agent-open-${a.id}`}>
                        <BookOpen className="h-4 w-4 mr-1.5" /> Playbook
                      </Button>
                      {canManage && (
                        <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => { setEditing(a); setFormOpen(true); }} aria-label="Edit agent" data-testid={`agent-edit-${a.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {del.canDelete && (
                      <div className="-mb-1 flex justify-end border-t border-gray-100 pt-2">
                        <RowDeleteControls kit={del} row={a} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------------- Impact ---------------- */}
        <TabsContent value="impact" className="space-y-4 pt-2">
          {overview && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="border-gray-200/80">
                  <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">Hours saved per week</CardTitle></CardHeader>
                  <CardContent className="h-60" data-testid="agents-weekly-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={overview.weekly} margin={{ top: 10, right: 4, left: -16, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="#F3F4F6" />
                        <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v, n) => (n === "hours" ? [`${v} h`, "Hours saved"] : [v, "Runs"])} cursor={{ fill: "#FFF7ED" }} />
                        <Bar dataKey="hours" fill="#F26B21" radius={[5, 5, 0, 0]} maxBarSize={36} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card className="border-gray-200/80">
                  <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">Hours saved by agent (30 days)</CardTitle></CardHeader>
                  <CardContent className="h-60" data-testid="agents-by-agent-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={overview.by_agent.slice(0, 8)} layout="vertical" margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                        <XAxis type="number" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={112} />
                        <Tooltip formatter={(v) => [`${v} h`, "Hours saved"]} cursor={{ fill: "#FFF7ED" }} />
                        <Bar dataKey="hours" fill="#FBA834" radius={[0, 5, 5, 0]} maxBarSize={18} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="border-gray-200/80">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700">Top users (30 days)</CardTitle></CardHeader>
                  <CardContent className="space-y-2" data-testid="agents-leaderboard">
                    {overview.leaderboard.length === 0 && <p className="text-sm text-gray-400">No runs logged yet.</p>}
                    {overview.leaderboard.map((p, i) => (
                      <div key={p.user_id} className="flex items-center gap-3 text-sm">
                        <span className="w-5 text-xs font-bold text-gray-400 font-mono">{i + 1}</span>
                        <span className="flex-1 truncate text-gray-800">{p.name}</span>
                        <span className="text-xs text-gray-500">{p.runs} runs</span>
                        <span className="w-14 text-right font-mono font-semibold text-gray-900">{p.hours}h</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card className="border-gray-200/80">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><UserX className="h-4 w-4 text-amber-600" /> Assigned but not using</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5" data-testid="agents-adoption-gaps">
                    {overview.adoption_gaps.length === 0 && <p className="text-sm text-gray-400">Everyone assigned has used their agents this month.</p>}
                    {overview.adoption_gaps.map((g) => (
                      <div key={`${g.agent_id}-${g.user_id}`} className="text-sm text-gray-600"><span className="font-medium text-gray-800">{g.user}</span> hasn't used <Link to={`/agents/${g.agent_id}`} className="text-[#F26B21] hover:underline">{g.agent}</Link> in 30 days</div>
                    ))}
                  </CardContent>
                </Card>
                <Card className="border-gray-200/80">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> Idle agents still costing money</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5" data-testid="agents-idle-list">
                    {overview.idle.length === 0 && <p className="text-sm text-gray-400">No idle agents.</p>}
                    {overview.idle.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
                        <Link to={`/agents/${a.id}`} className="text-gray-800 hover:text-[#F26B21] truncate">{a.name}</Link>
                        <span className="text-xs text-gray-500 shrink-0">{a.idle_days == null ? "never used" : `${a.idle_days}d idle`} · <span className="font-mono">{formatINR(a.monthly_cost)}</span>/mo</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
          <Card className="border-gray-200/80 overflow-hidden">
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-sm font-semibold text-gray-700">Recent runs</CardTitle>
              <div>{delUsage.dialog}<BulkDeleteBar kit={delUsage} /></div>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50/70">
                  {delUsage.canDelete && <TableHead className="w-20" />}
                  <TableHead>Date</TableHead><TableHead>Agent</TableHead><TableHead>Who</TableHead><TableHead>Task</TableHead>
                  <TableHead className="text-right">Saved</TableHead><TableHead>Result</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {usage.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-sm text-gray-400 py-8">No runs logged yet.</TableCell></TableRow>}
                  {usage.map((u) => (
                    <TableRow key={u.id} data-testid={`usage-row-${u.id}`}>
                      {delUsage.canDelete && <TableCell className="w-20"><RowDeleteControls kit={delUsage} row={u} /></TableCell>}
                      <TableCell className="text-xs text-gray-500 whitespace-nowrap">{u.date}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap"><Link to={`/agents/${u.agent_id}`} className="hover:text-[#F26B21]">{u.agent_name}</Link></TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{u.user_name}</TableCell>
                      <TableCell className="text-sm text-gray-600 min-w-[180px]">{u.task}{u.client_name ? <span className="text-gray-400"> · {u.client_name}</span> : ""}</TableCell>
                      <TableCell className="text-right font-mono text-sm whitespace-nowrap">{Math.round(u.minutes_saved)} min</TableCell>
                      <TableCell className={`text-xs font-medium whitespace-nowrap ${outcomeStyle[u.outcome] || ""}`}>{outcomeLabel[u.outcome] || u.outcome}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ---------------- Prompt library ---------------- */}
        <TabsContent value="prompts" className="space-y-4 pt-2">
          <div className="relative sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input className="pl-9" placeholder="Search prompts…" value={promptQ} onChange={(e) => setPromptQ(e.target.value)} data-testid="prompts-search" />
          </div>
          {prompts.length === 0 && <p className="text-sm text-gray-400 py-8 text-center">No saved prompts yet. Add them from an agent's Playbook tab.</p>}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {prompts.map((p) => (
              <Card key={`${p.agent.id}-${p.id}`} className="border-gray-200/80" data-testid={`prompt-card-${p.id}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 text-sm">{p.title}</div>
                      <Link to={`/agents/${p.agent.id}`} className="text-xs text-[#F26B21] hover:underline">{p.agent.name}</Link>
                      {p.when_to_use && <span className="text-xs text-gray-400"> · {p.when_to_use}</span>}
                    </div>
                    <CopyButton text={p.prompt} testid={`prompt-copy-${p.id}`} />
                  </div>
                  <pre className="whitespace-pre-wrap break-words text-xs text-gray-700 bg-gray-50 rounded-lg p-3 font-mono max-h-40 overflow-y-auto">{p.prompt}</pre>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <AgentFormDialog open={formOpen} onOpenChange={setFormOpen} agent={editing} meta={meta} onSaved={load} />
      <LogUsageDialog open={!!logFor} onOpenChange={(o) => !o && setLogFor(null)} agent={logFor} onSaved={load} />
    </div>
  );
}
